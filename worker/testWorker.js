
import { mysqlQueue, testMysqlQueue } from './model/bullQueue.js'
import { table, getBorderCharacters } from 'table'
import _ from 'lodash'
import { createPool } from 'mysql2'
import { WrongAnswerError, RunTimeError } from './utils/errorHandler.js'

import { getProblem, getTestCases, createAcSubmission, createWaReSubmission } from './model/database.js'

const NUM_WORKERS = 4

const mysqlPool = createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT
}).promise()



const compareResults = (testResult, expectedOutput) => {
  const sortObject = o => Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {})
  const sortedTestResult = testResult.map(sortObject)
  const sortedExpectedOutput = expectedOutput.map(sortObject)
  const sortedTestResultArray = sortedTestResult.sort((a, b) => JSON.stringify(a) > JSON.stringify(b) ? 1 : -1)
  const sortedExpectedOutputArray = sortedExpectedOutput.sort((a, b) => JSON.stringify(a) > JSON.stringify(b) ? 1 : -1)
  return _.isEqual(sortedExpectedOutputArray, sortedTestResultArray)
}
const transformToTable = (data) => {
  return table([Object.keys(data[0]), ...data.map(row => Object.values(row))], { border: getBorderCharacters('ramac') });
}

const processMysqlProblem = async (data) => {
  const { problemId, code } = data
  try {
    const testCases = await getTestCases(problemId, 'example')
    const queryPromise = testCases.map(async (testCase) => {
      const inputData = JSON.parse(testCase.test_input)
      const testInput = Object.keys(inputData).reduce((acc, cur) => {
        if (!acc[cur]) acc[cur] = table(inputData[cur], { border: getBorderCharacters('ramac') })
        return acc
      }, {})

      const expectedOutput = JSON.parse(testCase.expected_output)
      const startTime = new Date()
      const [testResult] = await mysqlPool.query(`${code}`)
      const endTime = new Date()

      const resultTable = transformToTable(testResult)
      const expectedTable = transformToTable(expectedOutput)

      return {
        status: compareResults(testResult, expectedOutput) ? 'AC' : 'WA',
        testInput,
        expectedOutput: expectedTable,
        realOutput: resultTable,
        runtime: endTime - startTime 
      }
    })
    const results = await Promise.all(queryPromise)

    if (results.some(result => result.status === 'WA')) {
      throw new WrongAnswerError(results);
    }
    return { status: 'AC', results }
  } catch (err) {
    if (err instanceof WrongAnswerError) {
      return { status: 'WA', results: err.message }
    }
    return { status: 'RE', results: [err.message] }
  }
}



const addTestMysqlQueue = async (problemId, language, code, socketId) => {
  await testMysqlQueue.add(
    { problemId, language, code, socketId},
    { removeOnComplete: true, removeOnFail: true }
  )
}

export const setSocketMysqlEvent = (io) => {
  testMysqlQueue.process(NUM_WORKERS, async({ data }) => {
    console.log('process the mysql test data')
    const { socketId } = data
    const result = await processMysqlProblem(data)
  
    io.to(socketId).emit('result', result)
  })
}

mysqlQueue.process(NUM_WORKERS, async ({ data }) => {
  const { submittedId, language } = data
  console.log(`Start process mysql problem [ submitted ID: ${ submittedId }]`)
  try {
    const result = await processMysqlProblem(data)
    const { status, results } = result
    if (status === 'AC') {
      const totalTime = results.reduce((acc, { runtime }) => acc + runtime, 0)
      const avgTime = (totalTime / results.length).toFixed(1)
      return await createAcSubmission(submittedId, status, language, avgTime, 0)
    } else if (status === 'RE') {
      return await createWaReSubmission(submittedId, status, results[0])
    }
    return await createWaReSubmission(submittedId, status, results)
  } catch (err) {
    console.error(err.message)
  } finally {
    console.log(`End process mysql problem [ submitted ID: ${ submittedId }]`)
  }
})

export {addTestMysqlQueue, testMysqlQueue}
