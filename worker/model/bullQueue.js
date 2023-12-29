import Bull from 'bull'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const isDevelopment = process.env.MODE === 'develop'

function createQueue(name) {
  const config = isDevelopment
    ? { redis: { port: process.env.REDIS_PORT, host: process.env.REDIS_HOST } }
    : { redis: { tls: true, enableTLSForSentinelMode: false } }

  const url = isDevelopment ? null : `rediss://:${process.env.AWS_REDIS_AUTH_TOKEN}@${process.env.AWS_REDIS_HOST}:${process.env.REDIS_PORT}`

  return new Bull(name, url, config);
}

export const problemQueue = createQueue('problem-queue')
export const mysqlQueue = createQueue('mysql-queue')
export const testProblemQueue = createQueue('test-problem-queue')
export const testMysqlQueue = createQueue('mysql-test-queue')
