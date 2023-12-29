import express from 'express'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { setSocketMysqlEvent } from './worker/testWorker.js'
import { setSocketProblemEvent } from './worker/worker.js'
import { ioInit, setSocketEvent } from './io.js'

dotenv.config()
const port = process.env.PORT

const app = express()
const server = createServer(app)

const io = ioInit(server)
setSocketEvent(io)
setSocketMysqlEvent(io)
setSocketProblemEvent(io)

server.listen(port, () => {
  console.log(`Server is listening on port ${port}....`)
})
