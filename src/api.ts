import { readFileSync } from "fs";
import * as core from "@actions/core";
import OpenAI from "openai";
import { Octokit } from "@octokit/core";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import minimatch from "minimatch";

const GITHUB_TOKEN: string = core.getInput("GITHUB_TOKEN");
const OPENAI_API_KEY: string = core.getInput("OPENAI_API_KEY");
const OPENAI_API_MODEL: string = core.getInput("OPENAI_API_MODEL");

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
  changes: Array<{ line: number; content: string }>;
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
  const files = diffText.split(/^diff --git/gm).slice(1);
  return files.map((fileDiff) => {
    const [fileHeader, ...contentLines] = fileDiff.split("\n");
    const filePath = fileHeader.match(/b\/(\S+)/)?.[1] ?? "";

    const changes = contentLines
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .map((line, index) => ({
        line: index + 1,
        content: line.slice(1),
      }));

    return { file: filePath, changes };
  });
}

export async function analyzeCode(parsedDiff: ParsedDiff[], prDetails: PRDetails) {
  const comments: Array<{ body: string; path: string; line: number }> = [];
  for (const file of parsedDiff) {
    if (file.file === "/dev/null") continue;
    for (const change of file.changes) {
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

export function createPrompt(filePath: string, change: { line: number; content: string }, prDetails: PRDetails): string {
  return `Your task is to review pull requests. Instructions:
- Provide the response in following JSON format: {"lineNumber":  <line_number>, "reviewComment": "<review comment>"}
- Provide suggestions only if there's something to improve.

Pull request title: ${prDetails.title}
Pull request description:

${prDetails.description}

Code diff to review in ${filePath}:

\`\`\`diff
${change.line} ${change.content}
\`\`\`
`;
}

export async function getAIResponse(prompt: string): Promise<{ lineNumber: string; reviewComment: string }[] | null> {
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
        { role: "system", content: "You are a helpful assistant for reviewing code changes." },
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
      return null;
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
