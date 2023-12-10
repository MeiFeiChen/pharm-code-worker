import pg from 'pg'
import dotenv from 'dotenv'
import path from 'path';
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
dotenv.config({ path: path.resolve(dirname, '../../.env') });

const { Pool } = pg;

// eslint-disable-next-line import/no-mutable-exports
let pool

if (process.env.MODE === 'develop') {
  pool = new Pool({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DATABASE,
    password: process.env.POSTGRES_PASSWORD,
  });
} else {
  pool = new Pool({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DATABASE,
    password: process.env.POSTGRES_PASSWORD,
    ssl: {
      rejectUnauthorized: false
    }
  })
}

export async function createAcSubmission(submittedId, result, language, runTime, memory) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`
        UPDATE submissions
        SET status = $1
        WHERE id = $2
    `, [result, submittedId])
    await client.query(`
      INSERT INTO ac_results(submission_id, language, runtime, memory)
      VALUES ($1, $2, $3, $4)
    `, [submittedId, language, runTime, memory])
    await client.query('COMMIT')
    console.log(`submitted ID ${submittedId}: successfully updated status and inserted the accepted result`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function createWaReSubmission(submittedId, result, error) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const errorJson = JSON.stringify(error)
    await client.query(`
        UPDATE submissions
        SET status = $1
        WHERE id = $2
    `, [result, submittedId])
    await client.query(`
      INSERT INTO wa_re_results(submission_id, error)
      VALUES ($1, $2)
    `, [submittedId, errorJson])
    await client.query('COMMIT')
    console.log(`submitted ID ${submittedId}: successfully updated status and inserted the WA/RE result`)
  } catch (err) {
    console.log(err)
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function getProblemBySubmittedId(submittedId) {
  const { rows } = await pool.query(`
    SELECT problems.* FROM problems
    JOIN submissions ON submissions.problem_id = problems.id
    WHERE submissions.id = $1;
  `, [submittedId])
  const problem = rows[0]
  return problem
}

export async function getTestCases(problemId, fieldName) {
  const { rows } = await pool.query(`
    SELECT test_input, expected_output FROM problem_test_cases
    WHERE problem_id = $1 AND field_name = $2;
  `, [problemId, fieldName])
  return rows
}

export async function getProblem(problemId) {
  const { rows } = await pool.query(`
    SELECT 
      problems.*,
      LAG(id) OVER (ORDER BY id) AS last_problem_id,
      LEAD(id) OVER (ORDER BY id) AS next_problem_id
      FROM problems
    WHERE id = $1
  `, [problemId])
  const problem = rows[0]
  return problem
}