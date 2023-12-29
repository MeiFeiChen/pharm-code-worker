import { problemQueue, mysqlQueue } from './model/bullQueue.js'

import { generateFile, removeFile } from './utils/generateFile.js'

import { WrongAnswerError, RunTimeError, TimeLimitExceededError } from './utils/errorHandler.js'
import { 
  createAcSubmission,
  createWaReSubmission,
  getTestCases, 
  getProblemBySubmittedId
} from './model/database.js'
import { execFile } from './utils/execFile.js'


// process problem
problemQueue.process(NUM_WORKERS, async ({ data }) => {
  console.log(`Start process problem [ submitted ID: ${ submittedId }]`)
  const { submittedId, problemId, language, code } = data
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

    
    // Check if there are any WA results
    const hasWaResults = results.some((result) => result.status === 'WA')
    if (hasWaResults) throw new WrongAnswerError(results)

    // if (hasWaResults) {
    //   const error = new WrongAnswerError()
    //   error.message = results
    //   throw error
    // }
    const { totalTime, totalMemory } = results.reduce((acc, cur) => {
      const { time, memory } = cur
      acc.totalTime += time
      acc.totalMemory += memory
      return acc
    }, { totalTime: 0, totalMemory: 0 })
    const avgTime = (totalTime / results.length).toFixed(1)
    const avgMemory = (totalMemory / results.length).toFixed(1)
    await createAcSubmission(submittedId, 'AC', language, avgTime, avgMemory)
  } catch (err) {
    console.log('err', err)
    console.error('err message', err.message)
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