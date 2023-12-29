import { problemQueue, testProblemQueue } from './model/bullQueue.js'
import { generateFile, removeFile } from './utils/generateFile.js'
import { WrongAnswerError, RunTimeError, TimeLimitExceededError } from './utils/errorHandler.js'
import { 
  createAcSubmission,
  createWaReSubmission,
  getTestCases, 
  getProblem
} from './model/database.js'
import { execFile } from './utils/execFile.js'

const NUM_WORKERS = 4

export async function processProblem(data) {
  const { submittedId, problemId, language, code } = data
  const filepath = generateFile(language, code)
  try {
    const problem = await getProblem(problemId)
    const testCaseType = submittedId ? 'test' : 'example'
    const testCases = await getTestCases(problemId, testCaseType)

    const results = await Promise.all(testCases.map(async (testCase) => {
      return processTestCase(testCase, language, filepath, problem.time_limit)
    }))

    const hasWaResults = results.some((result) => result.status === 'WA')
    if (hasWaResults) throw new WrongAnswerError(results)

    const { avgTime, avgMemory} = calculateAverages(results)
    return {submittedId, status: 'AC', language, avgTime, avgMemory, results}

  } catch (err) {
    console.error(err.message)
    if (err instanceof RunTimeError) {
      const cleanedErrorMessage = err.message.replace(/(Traceback \(most recent call last\):)?\s*File "[^"]+", /g, '').replace(/\d+\.\d+ \d+$/m, '')
      return { submittedId, status:'RE', results: [cleanedErrorMessage] }
    } else if (err instanceof WrongAnswerError) {
      return { submittedId, status: 'WA', results: err.message}
    } else if (err instanceof TimeLimitExceededError) {
      return { submittedId, status: 'TLE', results: [null]}
    }
  } finally {
    removeFile(filepath)
  }
}

async function processTestCase(testCase, language, filepath, timeLimit) {
  const { id, test_input: testInput, expected_output: expectedOutput } = testCase
  const output = await execFile(language, filepath, id, testInput, timeLimit)
  const realOutput = output.stdout.replace(/\n/g, '')
  const result = {
    status: expectedOutput !== realOutput ? 'WA' : 'AC',
    testInput,
    expectedOutput,
    realOutput
  }
  if (result.status === 'AC') {
    const { time, memory } = parseTimeAndMemory(output.stderr)
    result.time = time
    result.memory = memory
  }
  return result
}

function parseTimeAndMemory(stderr) {
  const [time, memory] = stderr.split(/[\s\n]+/).map(parseFloat)
  return {
    time: !isNaN(time) ? time * 1000 : null,
    memory: !isNaN(memory) ? memory / 1024 : null
  }
}

function calculateAverages(results) {
  const total = results.reduce((acc, { time, memory }) => {
    acc.time += time
    acc.memory += memory 
    return acc;
  }, { time: 0, memory: 0 })

  return {
    avgTime: (total.time / results.length).toFixed(1),
    avgMemory: (total.memory / results.length).toFixed(1)
  }
}


problemQueue.process(NUM_WORKERS, async ({ data }) => {
  const { submittedId } = data
  console.log(`Start process problem [ submitted ID: ${ submittedId }]`)
  try {
    const { status, results,  language, avgTime, avgMemory } = await processProblem(data)
    if (status === 'AC') {
      return await createAcSubmission(submittedId, status, language, avgTime, avgMemory)
    } else if (status === 'WA') {
      await createWaReSubmission(submittedId, status, results)
    }
    return await createWaReSubmission(submittedId, status, results[0])
  } catch (err) {
    console.error(err.message)
  } finally {
    console.log(`End process problem [ submitted ID: ${ submittedId }]`)
  }
})

export const setSocketProblemEvent = (io) => {
  testProblemQueue.process(NUM_WORKERS, async({ data }) => {
    console.log('process the test data')
    const results  = await processProblem(data)    
    const { socketId } = data
    io.to(socketId).emit('result', results)
  }) 
}



export const addTestProblemQueue = async (problemId, language, code, socketId) => {
  await testProblemQueue.add(
    { problemId, language, code, socketId},
    { removeOnComplete: true, removeOnFail: true }
  )
}