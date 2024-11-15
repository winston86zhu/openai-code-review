import { readFileSync } from "fs";
import * as core from "@actions/core";
import OpenAI from "openai";
import { Octokit } from "@octokit/core";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import minimatch from "minimatch";
import { PRDetails } from "./model/pr_detail";
import { createPromptLineByLine } from "./prompt";

const GITHUB_TOKEN: string = core.getInput("GITHUB_TOKEN");
const OPENAI_API_KEY: string = core.getInput("OPENAI_API_KEY");
const OPENAI_API_MODEL: string =
  core.getInput("OPENAI_API_MODEL") || "gpt-4o-mini";
const ANALYSIS_MODE: string = core.getInput("ANALYSIS_MODE") || "line_by_line";

const MyOctokit = Octokit.plugin(restEndpointMethods);
const octokit = new MyOctokit({ auth: GITHUB_TOKEN });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export interface ParsedDiff {
  file: string;
  changes: Array<{
    line: number;
    content: string;
    type: string;
  }>;
}

export async function getPRDetails(): Promise<PRDetails> {
  const { repository, number } = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH || "", "utf8"),
  );
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

export async function getFullFileContent(
  filePath: string,
  prDetails: PRDetails,
): Promise<string> {
  try {
    // Fetch the file content from the PR head branch
    const response = await octokit.rest.repos.getContent({
      owner: prDetails.owner,
      repo: prDetails.repo,
      path: filePath,
      ref: `refs/pull/${prDetails.pull_number}/head`,
    });

    if (Array.isArray(response.data)) {
      throw new Error(
        `Expected a file but found a directory at path: ${filePath}`,
      );
    }

    // Check if response.data is of type 'file'
    if (response.data.type !== "file") {
      throw new Error(
        `Expected a file but found type '${response.data.type}' at path: ${filePath}`,
      );
    }

    const content = Buffer.from(response.data.content, "base64").toString(
      "utf8",
    );
    return content;
  } catch (error) {
    console.error(`Error fetching file content for ${filePath}:`, error);
    throw error;
  }
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
export async function getDiff(
  owner: string,
  repo: string,
  pull_number: number,
): Promise<string | null> {
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
      .filter(
        (line) =>
          (line.startsWith("+") && !line.startsWith("+++")) ||
          (line.startsWith("-") && !line.startsWith("---")),
      )
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
export async function analyzeCode(
  parsedDiff: ParsedDiff[],
  prDetails: PRDetails,
  getAIResponseFn = getAIResponse, // Default to original function
) {
  const comments: Array<{ body: string; path: string; line: number }> = [];
  for (const file of parsedDiff) {
    if (file.file === "/dev/null") continue;
    for (const change of file.changes) {
      if (change.type === "deleted") continue;
      const prompt = createPromptLineByLine(file.file, change, prDetails);
      const aiResponse = await getAIResponseFn(prompt);
      if (aiResponse) {
        for (const response of aiResponse) {
          const newComment = {
            body: response.reviewComment,
            path: file.file,
            line: change.line,
          };
          comments.push(newComment);
        }
      }
    }
  }
  return comments;
}

export async function getAIResponse(
  prompt: string,
): Promise<{ lineNumber: string; reviewComment: string }[] | any> {
  const disclaimer = "📌 **Note**: This is an AI-generated comment.";
  // Determine if the model is an "o1" model (e.g., o1-mini)
  const isO1Model = OPENAI_API_MODEL.includes("o1");
  // Beta Limitation: https://platform.openai.com/docs/guides/reasoning?reasoning-prompt-examples=coding-planning#beta-limitations 
  const temperature = isO1Model ? 1 : 0.15;
  const top_p = isO1Model ? 1 : 0.95;
  const frequency_penalty = isO1Model ? 0 : 0.2;

  const queryConfig = {
    model: OPENAI_API_MODEL,
    temperature: temperature,
    max_completion_tokens: 1000,
    top_p: top_p,
    frequency_penalty: frequency_penalty,
    presence_penalty: 0,
  };

  try {

    // Conditionally build the messages array based on whether it's an "o1" model
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      ...(!isO1Model
        ? [
            {
              role: "system",
              content:
                "You are a helpful assistant for reviewing GitHub Pull Request code changes.",
            } as OpenAI.ChatCompletionMessageParam,
          ]
        : []),
      { role: "user", content: prompt } as OpenAI.ChatCompletionMessageParam,
    ];

    const completion = await openai.chat.completions.create({
      ...queryConfig,
      messages,
    });

    console.log('-----------------------------------------------');
    console.log(completion.choices[0].message?.content?.trim());

    const responseContent = completion.choices[0].message?.content?.trim() || "{}";
    const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/);

    let jsonString;
    if (jsonMatch && jsonMatch[1]) {
      jsonString = jsonMatch[1].trim();
    } else {
      // If no code fences are found, assume the entire content is JSON
      jsonString = responseContent;
    }
    const parsedResponse = JSON.parse(jsonString);

    // Ensure the response is in the expected format
    if (Array.isArray(parsedResponse.reviews)) {
      // Prepend the disclaimer to each review comment
      return parsedResponse.reviews.map((review: { reviewComment: any }) => ({
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

async function createReviewComment(
  owner: string,
  repo: string,
  pull_number: number,
  comments: Array<{ body: string; path: string; line: number }>,
) {
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
    const diffText = await getDiff(
      prDetails.owner,
      prDetails.repo,
      prDetails.pull_number,
    );
    if (!diffText) {
      console.log("No diff found");
      return;
    }

    const parsedDiff = parseDiff(diffText);
    const excludePatterns = core
      .getInput("exclude")
      .split(",")
      .map((s) => s.trim());
    const filteredDiff = parsedDiff.filter(
      (file) =>
        !excludePatterns.some((pattern) => minimatch(file.file, pattern)),
    );

    const comments = await analyzeCode(filteredDiff, prDetails);
    if (comments.length > 0) {
      await createReviewComment(
        prDetails.owner,
        prDetails.repo,
        prDetails.pull_number,
        comments,
      );
    }
  } catch (error) {
    console.error("Error in processing:", error);
    process.exit(1);
  }
}

// Run the main function if the script is executed directly, prevent unit tests from running it
if (require.main === module) {
  main();
}
