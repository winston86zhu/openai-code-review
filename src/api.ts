import { readFileSync } from "fs";
import * as core from "@actions/core";
import OpenAI from "openai";
import { Octokit } from "@octokit/core";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import minimatch from "minimatch";

const GITHUB_TOKEN: string = core.getInput("GITHUB_TOKEN");
const OPENAI_API_KEY: string = core.getInput("OPENAI_API_KEY");
const OPENAI_API_MODEL: string = core.getInput("OPENAI_API_MODEL") || "gpt-4o-mini";

const MyOctokit = Octokit.plugin(restEndpointMethods);
const octokit = new MyOctokit({ auth: GITHUB_TOKEN });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

interface PRDetails {
  owner: string;
  repo: string;
  pull_number: number;
  title: string;
  description: string;
}

interface ParsedDiff {
  file: string;
  changes: Array<{
    line: number; content: string; type: string; 
}>;
}

export async function getPRDetails(): Promise<PRDetails> {
  const { repository, number } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH || "", "utf8"));
  const prResponse = await octokit.rest.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
  });

  return {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
    title: prResponse.data.title || "",
    description: prResponse.data.body || "",
  };
}

/**
 * https://github.com/octocat/Hello-World/commit/7fd1a60b01f91b314f59955a4e4d4e80d8edf11d.diff 
 * diff --git a/README b/README
index c57eff55..980a0d5f 100644
--- a/README
+++ b/README
@@ -1 +1 @@
-Hello World!
\ No newline at end of file
+Hello World!
 */
export async function getDiff(owner: string, repo: string, pull_number: number): Promise<string | null> {
  const response = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number,
    mediaType: { format: "diff" },
  });
  
  // Octokit returns response data as string if media type is "diff"
  return String(response.data);
}

export function parseDiff(diffText: string): ParsedDiff[] {
  // Removes the first element of the resulting array,
  // which is an empty string because the split operation creates an empty string
  const files = diffText.split(/^diff --git/gm).slice(1);
  
  return files.map((fileDiff) => {
    const [fileHeader, ...contentLines] = fileDiff.split("\n");
    const filePath = fileHeader.match(/b\/(\S+)/)?.[1] ?? "";

  // TODO: I dont know if it is plausible to review both added and deleted lines, see `analyzeCode` function
    const changes = contentLines
      .filter((line) => (line.startsWith("+") && !line.startsWith("+++") || line.startsWith("-") && !line.startsWith("---")))
      .map((line, index) => ({
        line: index + 1,
        content: line.slice(1),
        type: line.startsWith("+") ? "added" : "deleted",
      }));

    return { file: filePath, changes };
  });
}

// TODO: Instead of sending each line individually, it can be bundled by Logical Grouping:
//  - file/function/class level
// TODO: Some major line - we can still send them individually to ensure focused attention.
export async function analyzeCode(parsedDiff: ParsedDiff[], prDetails: PRDetails) {
  const comments: Array<{ body: string; path: string; line: number }> = [];
  for (const file of parsedDiff) {
    if (file.file === "/dev/null") continue;
    for (const change of file.changes) {
      // Only create prompts for added lines, skip deleted lines if not necessary
      if (change.type === "deleted") {
        continue; 
        // Example: continue; 
      }

      const prompt = createPrompt(file.file, change, prDetails);
      const aiResponse = await getAIResponse(prompt);
      if (aiResponse) {
        for (const response of aiResponse) {
          const newComment = { body: response.reviewComment, path: file.file, line: change.line };
          comments.push(newComment);
        }
      }
    }
  }
  return comments;
}


export function createPrompt(
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
- Provide the response in the following JSON format: {"lineNumber": <line_number>, "reviewComment": "<review comment>"}
- Provide suggestions only if there's something to improve.

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

export async function getAIResponse(prompt: string): Promise<{ lineNumber: string; reviewComment: string }[] | any> {
  const disclaimer = "📌 **Note**: This is an AI-generated comment.";
  const queryConfig = {
    model: OPENAI_API_MODEL,
    temperature: 0.15,
    max_tokens: 1000,
    top_p: 0.95,
    frequency_penalty: 0.2,
    presence_penalty: 0,
  };

  try {
    const completion = await openai.chat.completions.create({
      ...queryConfig,
      messages: [
        { role: "system", content: "You are a helpful assistant for reviewing github Pull Request code changes." },
        { role: "user", content: prompt },
      ],
    });

    const responseContent = completion.choices[0].message?.content?.trim() || "{}";
    const parsedResponse = JSON.parse(responseContent);

    // Ensure the response is in the expected format
    if (Array.isArray(parsedResponse.reviews)) {
      // Prepend the disclaimer to each review comment
      return parsedResponse.reviews.map((review: { reviewComment: any; }) => ({
        ...review,
        reviewComment: `${disclaimer}\n\n${review.reviewComment}`,
      }));
    } else {
      console.warn("Unexpected response format:", responseContent);
      return responseContent;
    }
  } catch (error) {
    console.error("OpenAI API error:", error);
    return null;
  }
}

async function createReviewComment(owner: string, repo: string, pull_number: number, comments: Array<{ body: string; path: string; line: number }>) {
  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number,
    event: "COMMENT",
    comments,
  });
}

async function main() {
  try {
    const prDetails = await getPRDetails();
    const diffText = await getDiff(prDetails.owner, prDetails.repo, prDetails.pull_number);
    if (!diffText) {
      console.log("No diff found");
      return;
    }

    const parsedDiff = parseDiff(diffText);
    const excludePatterns = core.getInput("exclude").split(",").map((s) => s.trim());
    const filteredDiff = parsedDiff.filter((file) => !excludePatterns.some((pattern) => minimatch(file.file, pattern)));

    const comments = await analyzeCode(filteredDiff, prDetails);
    if (comments.length > 0) {
      await createReviewComment(prDetails.owner, prDetails.repo, prDetails.pull_number, comments);
    }
  } catch (error) {
    console.error("Error in processing:", error);
    process.exit(1);
  }
}

main();
