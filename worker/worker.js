import Bull from 'bull'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateFile, removeFile } from './utils/generateFile.js'
import { table, getBorderCharacters } from 'table'
import _ from 'lodash'
import { createPool } from 'mysql2'
import { WrongAnswerError, RunTimeError, TimeLimitExceededError } from './utils/errorHandler.js'
import { 
  createAcSubmission,
  createWaReSubmission,
  getTestCases, 
  getProblemBySubmittedId
} from './model/database.js'
import { execFile } from './utils/execFile.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env') })

let problemQueue
let mysqlQueue

if (process.env.MODE === 'develop') {
  problemQueue = new Bull('problem-queue', {
    redis: {
      port: process.env.REDIS_PORT,
      host: process.env.REDIS_HOST
    }
  })
  mysqlQueue = new Bull('mysql-queue', {
    redis: {
      port: process.env.REDIS_PORT,
      host: process.env.REDIS_HOST
    }
  })
} else {
  problemQueue = new Bull(
    'problem-queue',
    `rediss://:${process.env.AWS_REDIS_AUTH_TOKEN}@${process.env.AWS_REDIS_HOST}:${process.env.REDIS_PORT}`,
    { redis: { tls: true, enableTLSForSentinelMode: false } }
  )
  mysqlQueue = new Bull(
    'mysql-queue',
    `rediss://:${process.env.AWS_REDIS_AUTH_TOKEN}@${process.env.AWS_REDIS_HOST}:${process.env.REDIS_PORT}`,
    { redis: { tls: true, enableTLSForSentinelMode: false } }
  )
}

const NUM_WORKERS = 5

const mysqlPool = createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT
}).promise()

// process problem
problemQueue.process(NUM_WORKERS, async ({ data }) => {
  const { submittedId, language, code, addToQueueTime } = data
  const workerGetJobTime = new Date()
  console.log(`Start process problem [ submitted ID: ${ submittedId }]`)
  // generate a file
  const filepath = generateFile(language, code)
  try {
    // get the test cases
    const problem = await getProblemBySubmittedId(submittedId)
    const testCases = await getTestCases(problem.id, 'test')

    const execFilePromises = testCases.map(async (testCase, index) => {
      const { test_input: testInput, expected_output: expectedOutput } = testCase
      const output = await execFile(
        submittedId,
        language,
        filepath,
        index,
        testInput,
        problem.time_limit
      )

      // compare result with test case
      const realOutput = output.stdout.replace(/\n/g, '')
      if (expectedOutput !== realOutput) {
        return {
          status: 'WA', testInput, expectedOutput, realOutput
        }
      }
      const timeAndMemory = output.stderr.split(/[\s\n]+/)
        .map((part) => parseFloat(part))
        .filter((number) => !Number.isNaN(number))
        .map((number, i) => {
          if (!Number.isNaN(number)) {
            return i === 0 ? (number * 1000) : (number / 1024);
          }
          return number;
        })

      return {
        status: 'AC',
        time: timeAndMemory[0],
        memory: timeAndMemory[1],
        testInput,
        expectedOutput,
        realOutput
      }
    })
    // calculate the average time and memory
    const results = await Promise.all(execFilePromises)

    const getResultTime = new Date()
    // Check if there are any WA results
    const hasWaResults = results.some((result) => result.status === 'WA')

    if (hasWaResults) {
      const error = new WrongAnswerError()
      error.message = results
      throw error
    }
    const { totalTime, totalMemory } = results.reduce((acc, cur) => {
      const { time, memory } = cur
      acc.totalTime += time
      acc.totalMemory += memory
      return acc
    }, { totalTime: 0, totalMemory: 0 })
    const avgTime = (totalTime / results.length).toFixed(1)
    const avgMemory = (totalMemory / results.length).toFixed(1)
    console.log(avgTime, avgMemory)

    const endTime = new Date()
    const startToQueue = (workerGetJobTime - addToQueueTime)/1000 // queue 接到工作
    const startToResult = (getResultTime - addToQueueTime)/1000 // 程式執行 + 驗證
    const startToEnd = (endTime - addToQueueTime)/1000 // 全部程式執行時間

    await createAcSubmission(submittedId, 'AC', language, avgTime, avgMemory)
  } catch (err) {
    console.log(err)
    console.error(err.message)
    if (err instanceof RunTimeError) {
      const cleanedErrorMessage = err.message.replace(/(Traceback \(most recent call last\):)?\s*File "[^"]+", /g, '').replace(/\d+\.\d+ \d+$/m, '')
      await createWaReSubmission(submittedId, 'RE', cleanedErrorMessage)
    }
    if (err instanceof WrongAnswerError) {
      await createWaReSubmission(submittedId, 'WA', err.message)
    }
    if (err instanceof TimeLimitExceededError) {
      await createWaReSubmission(submittedId, 'TLE', null)
    }
  } finally {
    // delete the file
    removeFile(filepath)
    console.log(`End process problem [ submitted ID: ${ submittedId }]`)
  }
})


const sortObject = (o) => Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {})

// process mysql problem
mysqlQueue.process(NUM_WORKERS, async ({ data }) => {
  const {
    submittedId,
    problemId,
    language,
    code
  } = data
  console.log(`Start process mysql problem [ submitted ID: ${ submittedId }]`)

  try {
    const testCases = await getTestCases(problemId, 'example')
    const queryPromise = testCases.map(async (testCase) => {
      try {
        // get the expect output
        const expectedOutput = JSON.parse(testCase.expected_output)
        // get real output and count time
        const startTime = new Date()
        const [testResult] = await mysqlPool.query(`${code}`)
        const endTime = new Date()

        // compare result
        // sorted objects in array
        const testResultSorted = testResult.map((result) => sortObject(result))
        const expectedOutputSorted = expectedOutput.map((result) => sortObject(result))
        // sorted array
        const expectedOutputSortedArray = expectedOutputSorted.map((obj) => (
          { ...obj })).sort((a, b) => JSON.stringify(a) > JSON.stringify(b) ? 1 : -1)
        const testResultSortedArray = testResultSorted.map((obj) => (
          { ...obj })).sort((a, b) => JSON.stringify(a) > JSON.stringify(b) ? 1 : -1)

        const resultData = testResult.map((row) => Object.values(row))
        const resultTable = table([Object.keys(testResult[0]), ...resultData], { border: getBorderCharacters('ramac') })
        if (!_.isEqual(expectedOutputSortedArray, testResultSortedArray)) {
          return { status: 'WA', realOutput: resultTable, runtime: endTime - startTime }
        }
        return { status: 'AC', realOutput: resultTable, runtime: endTime - startTime }
      } catch (err) {
        throw new RunTimeError(err.message)
      }
    })
    const results = await Promise.all(queryPromise)
    // Check if there are any WA results
    const hasWaResults = results.some((result) => result.status === 'WA')
    if (hasWaResults) {
      const error = new WrongAnswerError()
      error.message = results
      throw error
    }
    // calculate the average time
    const totalTime = results.reduce((acc, { runtime }) => acc + runtime, 0)
    const avgTime = (totalTime / results.length).toFixed(1)

    await createAcSubmission(submittedId, 'AC', language, avgTime, 0)
  } catch (err) {
    if (err instanceof RunTimeError) {
      await createWaReSubmission(submittedId, 'RE', err.message)
    }
    if (err instanceof WrongAnswerError) {
      await createWaReSubmission(submittedId, 'WA', err.message)
    }
  } finally {
    console.log(`End process mysql problem [ submitted ID: ${ submittedId }]`)
  }
})

