import { analyzeCode, ParsedDiff } from "../src/api";
import { PRDetails } from "../src/model/pr_detail";


test('analyzeCode returns comments when AI provides responses', async () => {
  const parsedDiff: ParsedDiff[] = [
    {
      file: 'src/example.ts',
      changes: [
        { line: 1, content: 'const x = 10;', type: 'added' },
        { line: 2, content: 'console.log(x);', type: 'added' },
      ],
    },
  ];

  const prDetails: PRDetails = {
    owner: 'owner',
    repo: 'repo',
    pull_number: 1,
    title: 'Add example.ts',
    description: 'This PR adds example.ts',
  };

  const mockGetAIResponseFn = jest.fn().mockResolvedValue([
    {
      filePath: 'src/example.ts',
      lineNumber: 1,
      reviewComment: 'Consider using a type annotation for x.',
    },
    {
      filePath: 'src/example.ts',
      lineNumber: 2,
      reviewComment: 'Avoid using console.log in production code.',
    },
  ]);

  const comments = await analyzeCode(parsedDiff, prDetails, mockGetAIResponseFn);

  expect(mockGetAIResponseFn).toHaveBeenCalled();
  expect(comments).toEqual([
    {
      body: 'Consider using a type annotation for x.',
      path: 'src/example.ts',
      line: 1,
    },
    {
      body: 'Avoid using console.log in production code.',
      path: 'src/example.ts',
      line: 2,
    },
  ]);
});

test('analyzeCode skips files with no changes', async () => {
  const parsedDiff: ParsedDiff[] = [
    {
      file: 'src/empty.ts',
      changes: [],
    },
  ];

  const prDetails: PRDetails = {
    owner: 'owner',
    repo: 'repo',
    pull_number: 2,
    title: 'Update empty.ts',
    description: 'This PR updates empty.ts',
  };

  const mockGetAIResponseFn = jest.fn();

  const comments = await analyzeCode(parsedDiff, prDetails, mockGetAIResponseFn);

  expect(mockGetAIResponseFn).not.toHaveBeenCalled();
  expect(comments).toEqual([]);
});

test('analyzeCode filters out files exceeding MAX_CHANGES', async () => {
  const parsedDiff: ParsedDiff[] = [
    {
      file: 'src/largeFile.ts',
      changes: Array(101).fill({
        line: 1,
        content: 'const x = 10;',
        type: 'added',
      }),
    },
  ];

  const prDetails: PRDetails = {
    owner: 'owner',
    repo: 'repo',
    pull_number: 3,
    title: 'Add largeFile.ts',
    description: 'This PR adds a large file',
  };

  const mockGetAIResponseFn = jest.fn();

  const comments = await analyzeCode(parsedDiff, prDetails, mockGetAIResponseFn);

  expect(mockGetAIResponseFn).not.toHaveBeenCalled();
  expect(comments).toEqual([]);
});

test('analyzeCode limits total changes to MAX_TOTAL_CHANGES', async () => {
  const parsedDiff: ParsedDiff[] = [
    {
      file: 'src/file1.ts',
      changes: Array(300).fill({
        line: 1,
        content: 'const a = 1;',
        type: 'added',
      }),
    },
    {
      file: 'src/file2.ts',
      changes: Array(300).fill({
        line: 1,
        content: 'const b = 2;',
        type: 'added',
      }),
    },
  ];

  const prDetails: PRDetails = {
    owner: 'owner',
    repo: 'repo',
    pull_number: 4,
    title: 'Add multiple files',
    description: 'This PR adds multiple files',
  };

  const mockGetAIResponseFn = jest.fn();

  const comments = await analyzeCode(parsedDiff, prDetails, mockGetAIResponseFn);

  expect(mockGetAIResponseFn).not.toHaveBeenCalled();
  expect(comments).toEqual([]);
});