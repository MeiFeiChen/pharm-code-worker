import { exec } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { RunTimeError, TimeLimitExceededError} from '../worker/utils/errorHandler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const filepath = `${__dirname}/code`
const fileName = 'sum.py'

async function execFile(filepath, fileName) {
  return new Promise((resolve, reject) => {
    const volumePath = '/app'
    

    const command = `echo "1 2" | docker run -i --rm --name python_oj -v ${filepath}:${volumePath} online_python:latest timeout 1 /usr/bin/time -f '%U %M' python3 ${volumePath}/${fileName}`
    console.log(command)
    exec(command, (error, stdout, stderr) => {
      console.log(`error: ${error}`)
      console.log(`stdout: ${stdout}`)
      console.log(`stderr: ${stderr}`)
      if (error) {
        if (error.code === 124 || error.code === 2) return reject(new TimeLimitExceededError('Time Limit Exceeded'))
        return reject(new RunTimeError(stderr, error))
      }
      const output = { stdout, stderr }
      return resolve(output)
    })
  })
}


await execFile(filepath, fileName)