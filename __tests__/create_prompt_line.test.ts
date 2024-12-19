// tests/createPrompt.test.ts

import { PRDetails } from "../src/model/pr_detail";
import { createPromptLineByLine } from "../src/prompt";

describe("createPrompt", () => {
  it("should create the correct prompt for added lines", () => {
    const filePath = "example.tsx";
    const change = {
      line: 3,
      content: "console.log('New line added');",
      type: "added",
    };

    const prDetails: PRDetails = {
      owner: "octocat",
      repo: "Hello-World",
      pull_number: 1,
      title: "Update example.tsx",
      description:
        "This pull request updates example.tsx with new log statements.",
    };

    const prompt = createPromptLineByLine(filePath, change, prDetails);

    expect(prompt).toContain("Pull request title: Update example.tsx");
    expect(prompt).toContain("console.log('New line added');");
  });

  it("should create the correct prompt for deleted lines", () => {
    const filePath = "example.tsx";
    const change = {
      line: 3,
      content: "console.log('Old line removed');",
      type: "deleted",
    };

    const prDetails: PRDetails = {
      owner: "octocat",
      repo: "Hello-World",
      pull_number: 2,
      title: "Remove logging",
      description: "This pull request removes unnecessary logging.",
    };

    const prompt = createPromptLineByLine(filePath, change, prDetails);

    expect(prompt).toContain("Pull request title: Remove logging");
    expect(prompt).toContain("console.log('Old line removed');");
  });
});
