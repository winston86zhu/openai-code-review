import { readFileSync } from "fs";
import * as core from "@actions/core";
import OpenAI from "openai";
import { Octokit } from "@octokit/core";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import minimatch from "minimatch";
import { PRDetails } from "./model/pr_detail";
import { createPromptFileByFile, createPromptForAllFiles, createPromptLineByLine } from "./prompt";

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
  const eventData = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH || "", "utf8"),
  );

  const { repository } = eventData;
  const pullRequest = eventData.pull_request;
  const pull_number = pullRequest.number;

  const prResponse = await octokit.rest.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number,
  });

  return {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number,
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

export async function analyzeCode(
  parsedDiff: ParsedDiff[],
  prDetails: PRDetails,
  getAIResponseFn = getAIResponse,
) {
  const comments: Array<{ body: string; path: string; line: number; side: 'LEFT' | 'RIGHT' }> = [];
  const MAX_CHANGES = 100; // Set the maximum allowed changes per file
  const MAX_TOTAL_CHANGES = 500; // Set the maximum total changes

  // Filter and prepare diffs
  const filteredDiffs = parsedDiff.filter((file) => {
    if (file.file === "/dev/null") return false;

    // deleted files are not analyzed
    const changes = file.changes;
    if (changes.length === 0) return false;
    if (changes.length > MAX_CHANGES) return false;
    file.changes = changes;
    return true;
  });

  // Limit total changes to avoid exceeding context length
  let totalChanges = filteredDiffs.reduce(
    (acc, file) => acc + file.changes.length,
    0,
  );
  if (totalChanges > MAX_TOTAL_CHANGES) {
    console.warn("Total changes exceed the maximum allowed. Adjusting...");
    // Implement logic to reduce changes (e.g., prioritize files)
    // For simplicity, limit the number of files
    filteredDiffs.splice(MAX_TOTAL_CHANGES);
  }

  if (filteredDiffs.length === 0) {
    console.log("No files to analyze after filtering.");
    return comments;
  }

  const prompt = createPromptForAllFiles(filteredDiffs, prDetails);
  const aiResponse = await getAIResponseFn(prompt);

  if (aiResponse && Array.isArray(aiResponse)) {
    for (const response of aiResponse) {
      const newComment: { body: string; path: string; line: number; side: 'LEFT' | 'RIGHT' } = {
        body: response.reviewComment,
        path: response.filePath,
        line: response.lineNumber,
        side: response.changeType === 'deleted' ? 'LEFT' : 'RIGHT',
      };
      comments.push(newComment);
    }
  }
  return comments;
}

export async function getAIResponse(
  prompt: string,
): Promise<
  { filePath: string; lineNumber: number; reviewComment: string }[] | any
> {
  const disclaimer = "📌 **Note**: This is an AI-generated comment.";
  const isO1Model = OPENAI_API_MODEL.includes("o1");
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
    // Only O1 models can take the system message
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      ...(!isO1Model
        ? [
            {
              role: "system" as const,
              content:
                "You are a helpful assistant for reviewing GitHub Pull Request code changes.",
            },
          ]
        : []),
      { role: "user" as const, content: prompt },
    ];

    const completion = await openai.chat.completions.create({
      ...queryConfig,
      messages,
    });

    const responseContent =
      completion.choices[0].message?.content?.trim() || "{}";

    // Parse the JSON directly since we've instructed the AI not to include code fences
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch (error) {
      console.error("Failed to parse JSON:", error);
      console.error("Response content:", responseContent);
      return null;
    }

    // Ensure the response is in the expected format
    if (Array.isArray(parsedResponse.reviews)) {
      // Prepend the disclaimer to each review comment
      return parsedResponse.reviews.map(
        (review: {
          filePath: string;
          reviewComment: string;
          lineNumber: number;
        }) => ({
          ...review,
          reviewComment: `${disclaimer}\n\n${review.reviewComment}`,
        }),
      );
    } else {
      console.warn("Unexpected response format:", responseContent);
      return null;
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
  comments: Array<{ body: string; path: string; line: number; side: 'LEFT' | 'RIGHT' }>,
) {
  console.log("The following comments will be posted:", comments);
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
    } else {
      console.log("No comments generated by AI.");
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
