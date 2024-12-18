import OpenAI from 'openai';
import { getAIResponse } from '../src/api';

jest.mock('openai');

const mockOpenAI = OpenAI as jest.Mocked<typeof OpenAI>;

test('getAIResponse returns parsed reviews on valid API response', async () => {
  const prompt = 'Test prompt';
  const mockResponse = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            reviews: [
              { lineNumber: 1, reviewComment: 'First comment' },
              { lineNumber: 2, reviewComment: 'Second comment' },
            ],
          }),
        },
      },
    ],
  };

  mockOpenAI.prototype.chat = {
    completions: {
      create: jest.fn().mockResolvedValue(mockResponse),
    },
  } as any;

  const result = await getAIResponse(prompt);

  expect(result).toEqual([
    {
      lineNumber: 1,
      reviewComment: '📌 **Note**: This is an AI-generated comment.\n\nFirst comment',
    },
    {
      lineNumber: 2,
      reviewComment: '📌 **Note**: This is an AI-generated comment.\n\nSecond comment',
    },
  ]);
});

test('getAIResponse handles invalid JSON response', async () => {
  const prompt = 'Test prompt';
  const mockResponse = {
    choices: [
      {
        message: {
          content: 'Invalid JSON',
        },
      },
    ],
  };

  mockOpenAI.prototype.chat = {
    completions: {
      create: jest.fn().mockResolvedValue(mockResponse),
    },
  } as any;

  const result = await getAIResponse(prompt);

  expect(result).toBeNull();
});

test('getAIResponse handles API error', async () => {
  const prompt = 'Test prompt';

  mockOpenAI.prototype.chat = {
    completions: {
      create: jest.fn().mockRejectedValue(new Error('API Error')),
    },
  } as any;

  const result = await getAIResponse(prompt);

  expect(result).toBeNull();
});

test('getAIResponse handles unexpected response format', async () => {
  const prompt = 'Test prompt';
  const mockResponse = {
    choices: [
      {
        message: {
          content: JSON.stringify({ unexpected: 'data' }),
        },
      },
    ],
  };

  mockOpenAI.prototype.chat = {
    completions: {
      create: jest.fn().mockResolvedValue(mockResponse),
    },
  } as any;

  const result = await getAIResponse(prompt);

  expect(result).toBeNull();
});