import { analyzeCode, createPrompt, getAIResponse } from "../src/api"; // Adjust the path to match your file structure
import nock from "nock";

// Mock input data
const mockPRDetails = {
  owner: "test-owner",
  repo: "test-repo",
  pull_number: 1,
  title: "Add new feature",
  description: "Implements a new feature with tests",
};

const mockParsedDiff = [
  {
    file: "file1.js",
    changes: [
      { line: 1, content: "const a = 10;" },
    ],
  },
];

// Mock OpenAI response
const mockAIResponse = [
  { lineNumber: "1", reviewComment: "Consider renaming variable `a` to be more descriptive." }
];

// Set up and tear down
beforeAll(() => {
  nock.disableNetConnect();
});

afterAll(() => {
  nock.enableNetConnect();
});

describe("getAIResponse", () => {
  it("should return an AI response with a disclaimer", async () => {
    const prompt = createPrompt(mockParsedDiff[0].file, mockParsedDiff[0].changes[0], mockPRDetails);

    // Mock the OpenAI API response
    nock("https://api.openai.com")
      .post("/v1/chat/completions")
      .reply(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({ reviews: mockAIResponse }),
            },
          },
        ],
      });

    const aiResponse = await getAIResponse(prompt);

    // Check that each review comment has the disclaimer at the start
    expect(aiResponse).not.toBeNull();
    aiResponse?.forEach(response => {
      expect(response.reviewComment).toMatch(/^📌 \*\*Note\*\*: This is an AI-generated comment\./);
    });
  });
});

describe("analyzeCode", () => {
  it("should generate comments with AI review suggestions", async () => {
    // Mock the OpenAI API response for `analyzeCode`
    nock("https://api.openai.com")
      .post("/v1/chat/completions")
      .reply(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({ reviews: mockAIResponse }),
            },
          },
        ],
      });

    const comments = await analyzeCode(mockParsedDiff, mockPRDetails);

    // Verify that the comments array is populated correctly
    expect(comments.length).toBeGreaterThan(0);
    comments.forEach((comment) => {
      expect(comment.body).toContain("📌 **Note**: This is an AI-generated comment.");
      expect(comment.body).toContain("Consider renaming variable `a` to be more descriptive.");
      expect(comment.path).toBe("file1.js");
      expect(comment.line).toBe(1);
    });
  });
});
