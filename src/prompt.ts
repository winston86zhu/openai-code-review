import { getLanguageFromFilePath } from "./model/get_lang_from_file_path";
import { PRDetails } from "./model/pr_detail";

export function createPromptLineByLine(
  filePath: string,
  change: { line: number; content: string; type: string }, 
  prDetails: PRDetails
): string {
    const changeDescription = change.type === "added" 
    ? "This is a new line of code that was added. Please review it for correctness, efficiency, and adherence to best practices. \
    Does this code improve the existing functionality or introduce potential issues?"
    : "This is a line of code that was deleted. Please review whether removing this line might negatively impact functionality,\
    introduce bugs, or remove important logic. Is this deletion justified and safe?";

    return `Your task is to review pull requests. Instructions:
  - Provide the response in JSON format **without any code blocks or additional formatting**. The result should be able to be parsed as JSON.
  - Provide the response in the following JSON format: {"lineNumber": <line_number>, "reviewComment": "<review comment>"}
  - Provide suggestions only if there's something to improve.

  **Instructions:**
  - Analyze the code change in the context provided.
  - Assume the surrounding code is consistent with standard practices.
  - **Do not mention irrelevant details or hypothetical code outside of the given snippet.**

  Pull request title: ${prDetails.title}
  Pull request description:

  ${prDetails.description}

  Code diff to review in ${filePath}:
  ${changeDescription}

  \`\`\`diff
  ${change.line} ${change.content}
  \`\`\`
  `;
}

export function createPromptFileByFile(
  filePath: string,
  changes: { line: number; content: string; type: string }[],
  prDetails: PRDetails,
  fullFileContent: string,
): string {
  const changeDescription =
    "Below are the code changes made to the file. Please review them comprehensively.";

  return `You are an expert code reviewer. Your task is to analyze the code changes made in the file \`${filePath}\` and provide constructive feedback focusing on:

- Correctness
- Efficiency
- Security vulnerabilities
- Compliance with coding standards and best practices
- Readability and maintainability

**Instructions:**

- Review the changes in the context of the entire file.
- Reference specific lines in your feedback.
- **Avoid mentioning irrelevant or unchanged code.**

**Response Format:**

Provide your feedback in the following JSON format:

\`\`\`json
[
  {
    "lineNumber": <line_number>,
    "reviewComment": "<Your comment here>"
  }
  // Add more comments as needed
]
\`\`\`

**Pull Request Details:**

- **Title:** ${prDetails.title}
- **Description:**

${prDetails.description}

**File:** ${filePath}

**Code After Changes:**

\`\`\`${getLanguageFromFilePath(filePath)}
${fullFileContent}
\`\`\`
`;
}

export function createPromptEverythingTogether(
  allChanges: {
    file: string;
    changes: { line: number; content: string; type: string }[];
  }[],
  prDetails: PRDetails,
): string {
  const changeDescription =
    "Below are the code changes made across multiple files. Please review them comprehensively.";

  let diffContent = "";
  for (const file of allChanges) {
    diffContent += `--- a/${file.file}\n+++ b/${file.file}\n`;
    diffContent += file.changes
      .map((change) => {
        const sign = change.type === "added" ? "+" : "-";
        return `${sign}${change.content}`;
      })
      .join("\n");
    diffContent += "\n";
  }

  return `As an experienced code reviewer, your task is to analyze the code changes made across multiple files and provide detailed feedback focusing on:

- Overall architecture and design considerations
- Interactions between different parts of the codebase
- Potential integration issues
- Correctness, efficiency, and security
- Compliance with coding standards and best practices

**Instructions:**

- Review the changes in the context of the entire project.
- Reference specific files and lines in your feedback.
- **Provide high-level insights as well as specific comments where necessary.**

**Response Format:**

Provide your feedback in the following JSON format:

\`\`\`json
[
  {
    "filePath": "<file_path>",
    "lineNumber": <line_number>,
    "reviewComment": "<Your comment here>"
  },
  // Add more comments as needed
]
\`\`\`

**Pull Request Details:**

- **Title:** ${prDetails.title}
- **Description:**

${prDetails.description}

**Code Changes:**

${changeDescription}

\`\`\`diff
${diffContent}
\`\`\`
`;
}
