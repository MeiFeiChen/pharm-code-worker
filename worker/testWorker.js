import Bull from 'bull'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateFile, removeFile } from './utils/generateFile.js'
import { execTestFile } from './utils/execFile.js'
import { table, getBorderCharacters } from 'table'
import _ from 'lodash'
import { createPool } from 'mysql2'
import { WrongAnswerError, RunTimeError, TimeLimitExceededError } from './utils/errorHandler.js'

import { getProblem, getTestCases } from './model/database.js'


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env') })

let testProblemQueue
let testMysqlQueue

if (process.env.MODE === 'develop') {
  testProblemQueue = new Bull('test-problem-queue', {
    redis: {
      port: process.env.REDIS_PORT,
      host: process.env.REDIS_HOST
    }
  })
  testMysqlQueue = new Bull('test-mysql-queue', {
    redis: {
      port: process.env.REDIS_PORT,
      host: process.env.REDIS_HOST
    }
  })
} else {
  testProblemQueue = new Bull(
    'problem-test-queue',
    `rediss://:${process.env.AWS_REDIS_AUTH_TOKEN}@${process.env.AWS_REDIS_HOST}:${process.env.REDIS_PORT}`,
    { redis: { tls: true, enableTLSForSentinelMode: false } }
  )
  testMysqlQueue = new Bull(
    'mysql-test-queue',
    `rediss://:${process.env.AWS_REDIS_AUTH_TOKEN}@${process.env.AWS_REDIS_HOST}:${process.env.REDIS_PORT}`,
    { redis: { tls: true, enableTLSForSentinelMode: false } }
  )
}


const mysqlPool = createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT
}).promise()
const sortObject = o => Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {})


// process problem
const processProblem = async (problemId, language, code) => {
  const filepath = generateFile(language, code)
  try {
    // get the test cases
    const problem = await getProblem(problemId)
    const testCases = await getTestCases(problemId, 'example')

    const execFilePromises = testCases.map(async (testCase, index) => {
      const { test_input: testInput, expected_output: expectedOutput } = testCase
      const output = await execTestFile(
        language,
        filepath,
        index,
        testInput,
        problem.time_limit
      )
      // compare result with test case
      console.log('expectedOutput', expectedOutput, 'output.stdout', output)
      const realOutput = output.stdout.replace(/\n/g, '')
      if (expectedOutput !== realOutput) {
        return {
          status: 'WA', testInput, expectedOutput, realOutput
        }
      }
      return {
        status: 'AC',
        testInput,
        expectedOutput,
        realOutput
      }
    })
    // calculate the average time and memory
    const results = await Promise.all(execFilePromises)
    // Check if there are any WA results
    const hasWaResults = results.some((result) => result.status === 'WA')

    if (hasWaResults) {
      const error = new WrongAnswerError()
      error.message = results
      throw error
    }
    // delete the file
    removeFile(filepath)

    return { status: 'AC', results }
  } catch (err) {
    console.log(err)
    console.error(err.message)
    if (err instanceof RunTimeError) {
      const cleanedErrorMessage = err.message.replace(/(Traceback \(most recent call last\):)?\s*File "[^"]+", /g, '').replace(/\d+\.\d+ \d+$/m, '')
      removeFile(filepath)
      return { status: 'RE', results: [cleanedErrorMessage] }
    }
    if (err instanceof WrongAnswerError) {
      removeFile(filepath)
      return { status: 'WA', results: err.message }
    }
    if (err instanceof TimeLimitExceededError) {
      removeFile(filepath)
      return { status: 'TLE', results: [] }
    }
    return { status: err.message }
  }
}


// process mysql problem
const processMysqlProblem = async (problemId, code) => {
  try {
    const testCases = await getTestCases(problemId, 'example')
    const queryPromise = testCases.map(async (testCase) => {
      try {
        // get the expect output
        const inputData = JSON.parse(testCase.test_input)
        const testInput = Object.keys(inputData).reduce((acc, cur) => {
          if (!acc[cur]) acc[cur] = table(inputData[cur], { border: getBorderCharacters('ramac') })
          return acc
        }, {})

        const expectedOutput = JSON.parse(testCase.expected_output)
        // get real output and count time
        const startTime = new Date()
        const [testResult] = await mysqlPool.query(`${code}`)
        const endTime = new Date()

        // compare result
        // sorted objects in array
        const testResultSorted = testResult.map((data) => sortObject(data))
        const expectedOutputSorted = expectedOutput.map((data) => sortObject(data))
        // sorted array
        const expectedOutputSortedArray = expectedOutputSorted.map((obj) => (
          { ...obj })).sort((a, b) => JSON.stringify(a) > JSON.stringify(b) ? 1 : -1)
        const testResultSortedArray = testResultSorted.map((obj) => (
          { ...obj })).sort((a, b) => JSON.stringify(a) > JSON.stringify(b) ? 1 : -1)

        // transfer data to table
        const resultData = testResult.map((row) => Object.values(row))
        const resultTable = table([Object.keys(testResult[0]), ...resultData], { border: getBorderCharacters('ramac') })
        const expectedData = expectedOutput.map((row) => Object.values(row))
        const expectedTable = table([Object.keys(expectedOutput[0]), ...expectedData], { border: getBorderCharacters('ramac') })

        if (!_.isEqual(expectedOutputSortedArray, testResultSortedArray)) {
          return {
            status: 'WA',
            testInput,
            expectedOutput: expectedTable,
            realOutput: resultTable,
            runtime: endTime - startTime
          }
        }
        return {
          status: 'AC',
          testInput,
          expectedOutput: expectedTable,
          realOutput: resultTable,
          runtime: endTime - startTime
        }
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
    return { status: 'AC', results }
  } catch (err) {
    if (err instanceof RunTimeError) {
      return { status: 'RE', results: [err.message] }
    }
    if (err instanceof WrongAnswerError) {
      return { status: 'WA', results: err.message }
    }
    return { status: err.message }
  }
}

const addTestProblemQueue = async (problemId, language, code, socketId) => {
  await testProblemQueue.add(
    { problemId, language, code, socketId},
    { removeOnComplete: true, removeOnFail: true }
  )
}

const addTestMysqlQueue = async (problemId, language, code, socketId) => {
  await testMysqlQueue.add(
    { problemId, language, code, socketId},
    { removeOnComplete: true, removeOnFail: true }
  )
}

export {addTestProblemQueue, addTestMysqlQueue, testProblemQueue, testMysqlQueue, processProblem, processMysqlProblem}
