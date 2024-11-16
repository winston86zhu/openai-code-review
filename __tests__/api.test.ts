import * as apiModule from "../src/api";
import { PRDetails } from "../src/model/pr_detail";

describe("analyzeCode with dependency injection", () => {
  it("should analyze code and return comments for added lines", async () => {
    const parsedDiff: apiModule.ParsedDiff[] = [
      {
        file: "example.tsx",
        changes: [
          { line: 3, content: "console.log('New line added');", type: "added" },
        ],
      },
    ];

    const prDetails: PRDetails = {
      owner: "octocat",
      repo: "Hello-World",
      pull_number: 1,
      title: "Update example.tsx",
      description:
        "This pull request updates example.js with new log statements.",
    };

    const mockGetAIResponse = jest
      .fn()
      .mockResolvedValueOnce([
        {
          lineNumber: 3,
          reviewComment:
            "Consider refactoring this line for better readability.",
        },
      ]);

    const expectedComments = [
      {
        body: "Consider refactoring this line for better readability.",
        path: "example.tsx",
        line: 3,
      },
    ];

    const comments = await apiModule.analyzeCode(
      parsedDiff,
      prDetails,
      mockGetAIResponse,
    );
    console.log(comments);
    expect(comments).toEqual(expectedComments);
    expect(mockGetAIResponse).toHaveBeenCalledTimes(1);
  });
});
