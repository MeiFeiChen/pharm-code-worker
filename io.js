import { Server } from 'socket.io'
import { addTestMysqlQueue } from './worker/testWorker.js'
import { addTestProblemQueue } from './worker/worker.js'

export const ioInit = (server) => new Server(server, {
  cors: {
    origin: '*'
  }
})
export const setSocketEvent = (io)  => {
  io.on('connection', (socket) => {
    console.log('a user connected')
  
    socket.on('disconnect', () => {
      console.log('user disconnect')
    })
  
    socket.on('test_data', async (data) => {
      socket.join(socket.id)
      const socketId = socket.id
      const { problemId, language, code} = data
      const addToTestQueue = language === 'mysql' ? addTestMysqlQueue : addTestProblemQueue
      addToTestQueue(problemId, language, code, socketId)
    })
  })
}