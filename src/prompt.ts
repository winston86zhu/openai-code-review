import { ParsedDiff } from "./api";
import { getLanguageFromFilePath } from "./model/get_lang_from_file_path";
import { PRDetails } from "./model/pr_detail";

export function createPromptLineByLine(
  filePath: string,
  change: { line: number; content: string; type: string },
  prDetails: PRDetails
): string {
  // const changeDescription = change.type === "added"
  //   ? "This is a new line of code that was added. Please review it for correctness, efficiency, and adherence to best practices. Does this code improve the existing functionality or introduce potential issues?"
  //   : "This is a line of code that was deleted. Please review whether removing this line might negatively impact functionality, introduce bugs, or remove important logic. Is this deletion justified and safe?";

  return `Your task is to review pull requests. Instructions:
- Provide the response in following JSON format:  {"reviews": [{"lineNumber":  <line_number>, "reviewComment": "<review comment>"}]}
- Do not give positive comments or compliments.
- Provide comments and suggestions ONLY if there is something to improve, otherwise "reviews" should be an empty array.
- Write the comment in GitHub Markdown format.
- Use the given description only for the overall context and only comment the code.
- IMPORTANT: NEVER suggest adding comments to the code.

Review the following code diff in the file "${
  filePath
  }" and take the pull request title and description into account when writing the response.
  
Pull request title: ${prDetails.title}
Pull request description:

---
${prDetails.description}
---

Git diff to review:
\`\`\`diff
${change.line} ${change.content}
\`\`\`
`;
}

export function createPromptFileByFile(
  filePath: string,
  changes: { line: number; content: string; type: string }[],
  prDetails: PRDetails,
): string {
  const diffContent = changes
    .map((change) => {
      const sign = change.type === "added" ? "+" : "-";
      return `${sign} ${change.content}`;
    })
    .join("\n");

  return `Your task is to review pull requests. Instructions:
- Provide the response in JSON format without any markdown or code fences: {"reviews": [{"lineNumber":  <line_number>, "reviewComment": "<review comment>"}]}
- Do not give positive comments or compliments.
- Provide comments and suggestions ONLY if there is something to improve, otherwise "reviews" should be an empty array.
- Write the comment in GitHub Markdown format.
- Use the given description only for the overall context and only comment on the code.
- IMPORTANT: NEVER suggest adding comments to the code.

Review the following code diff in the file "${filePath}" and take the pull request title and description into account when writing the response.

Pull request title: ${prDetails.title}
Pull request description:

---
${prDetails.description}
---

Git diff to review:
\`\`\`diff
${diffContent}
\`\`\`
`;
}

export function createPromptForAllFiles(
  files: ParsedDiff[],
  prDetails: PRDetails,
): string {
  let diffContents = files
    .map((file) => {
      const diffContent = file.changes
        .map((change) => {
          const sign = change.type === "added" ? "+" : "-";
          return `${sign} ${change.content}`;
        })
        .join("\n");

      return `Diff for file "${file.file}":\n\`\`\`diff\n${diffContent}\n\`\`\``;
    })
    .join("\n\n");

  return `Your task is to review pull requests. Instructions:
- Provide the response in JSON format without any markdown or code fences: {"reviews": [{"filePath": "<file path>", "lineNumber":  <line_number>, "reviewComment": "<review comment>"}]}
- Do not give positive comments or compliments.
- Provide comments and suggestions ONLY if there is something to improve, otherwise "reviews" should be an empty array.
- Write the comment in GitHub Markdown format.
- Use the given description only for the overall context and only comment on the code.
- IMPORTANT: NEVER suggest adding comments to the code.

Review the following code diffs and take the pull request title and description into account when writing the response.

Pull request title: ${prDetails.title}
Pull request description:

---
${prDetails.description}
---

Git diffs to review:

${diffContents}
`;
}
