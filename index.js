import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { Server } from 'socket.io'
import { createServer } from 'http'
import * as worker from './worker/worker.js'
import { addTestProblemQueue, addTestMysqlQueue } from './worker/testWorker.js'
import { testMysqlQueue, testProblemQueue, processProblem, processMysqlProblem } from './worker/testWorker.js'


dotenv.config()
const port = process.env.PORT

const app = express()
const server = createServer(app)

const io = new Server(server, {
  cors: {
    origin: '*'
  }
})

const NUM_WORKERS = 5


io.on('connection', (socket) => {
  console.log('a user connected')

  socket.on('disconnect', () => {
    console.log('user disconnect')
  })

  socket.on('test_data', async (data) => {
    socket.join(socket.id)
    const socketId = socket.id
    const { problemId, language, code} = data
    if (language !== 'mysql') {
      addTestProblemQueue(problemId, language, code, socketId)
    } else {
      addTestMysqlQueue(problemId, language, code, socketId)
    }
  })
})




testMysqlQueue.process(NUM_WORKERS, async({ data }) => {
  console.log('process the mysql test data')
  const {
    problemId, language, code, socketId
  } = data
  const result = await processMysqlProblem(problemId, code)

  io.to(socketId).emit('result', result)
  
})

testProblemQueue.process(NUM_WORKERS, async({ data }) => {
  console.log('process the test data')
  const {
    problemId, language, code, socketId
  } = data
  const result = await processProblem(problemId, language, code)
  console.log(result)
  io.to(socketId).emit('result', result)
})


server.listen(port, () => {
  console.log(`Server is listening on port ${port}....`)
})
