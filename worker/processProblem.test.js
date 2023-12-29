import jest from 'jest'

import { processProblem } from './worker.js'
import { generateFile, removeFile } from './utils/generateFile.js'
import { getProblem, getTestCases } from './model/database.js'
import { execFile } from './utils/execFile.js'

jest.mock('./utils/generateFile.js', () => ({
  generateFile: jest.fn(), 
  removeFile: jest.fn()
}))

jest.mock('./model/databases.js', () => ({
  getProblem: jest.fn(),
  getTestCases: jest.fn()
}))

jest.mock('./utils/execFile.js', () => jest.fn())

describe('processProblem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process problem correctly when everything works as expected', async () => {
    // Set up mock implementations
    generateFile.mockReturnValue('path/to/temp/file');
    getProblem.mockResolvedValue({ time_limit: 1000 });
    getTestCases.mockResolvedValue([
      { /* fill in mock test case data */ }
    ]);
    execFile.mockResolvedValue({ /* fill in mock execFile output */ });

    // Call the function with mock data
    const mockData = { /* fill in mock data for processProblem */ };
    const result = await processProblem(mockData);

    // Assert the expected outcome
    const expectedOutcome = { /* fill in the expected result object */ };
    expect(result).toEqual(expectedOutcome);

    // Verify that removeFile was called correctly
    expect(removeFile).toHaveBeenCalledWith('path/to/temp/file');
  });

  // Additional test cases...
});