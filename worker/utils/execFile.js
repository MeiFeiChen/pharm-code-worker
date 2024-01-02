import { exec } from 'child_process'
import languageRuntime from '../constants/runtime.js'
import path from 'path'
import { RunTimeError, TimeLimitExceededError } from './errorHandler.js'

export async function execFile(language, filepath, index, input, timeLimit) {
  const { imageName, containerName, runtimeCommand } = languageRuntime[language]
  const tempFileName = path.basename(filepath)
  const tempFileDir = path.dirname(filepath)
  
  return new Promise((resolve, reject) => {
    const volumePath = '/app'

    const command = `echo "${input}" | docker run -i --rm --name ${tempFileName}${containerName}${index} -v ${tempFileDir}:${volumePath} ${imageName}:latest timeout ${timeLimit / 1000} /usr/bin/time -f '%U %M' ${runtimeCommand} ${volumePath}/${tempFileName}`
    exec(command, (error, stdout, stderr) => {
      console.log(stderr)
      if (error) {
        if (error.code === 124 || error.code === 2) return reject(new TimeLimitExceededError('Time Limit Exceeded'))
        return reject(new RunTimeError(stderr, error))
      }
      const output = { stdout, stderr }
      return resolve(output)
    })
  })
}