"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPRDetails = getPRDetails;
exports.getFullFileContent = getFullFileContent;
exports.getDiff = getDiff;
exports.parseDiff = parseDiff;
exports.analyzeCode = analyzeCode;
exports.createPrompt = createPrompt;
exports.getAIResponse = getAIResponse;
const fs_1 = require("fs");
const core = __importStar(require("@actions/core"));
const openai_1 = __importDefault(require("openai"));
const core_1 = require("@octokit/core");
const plugin_rest_endpoint_methods_1 = require("@octokit/plugin-rest-endpoint-methods");
const minimatch_1 = __importDefault(require("minimatch"));
const GITHUB_TOKEN = core.getInput("GITHUB_TOKEN");
const OPENAI_API_KEY = core.getInput("OPENAI_API_KEY");
const OPENAI_API_MODEL = core.getInput("OPENAI_API_MODEL") || "gpt-4o-mini";
const ANALYSIS_MODE = core.getInput("ANALYSIS_MODE") || "line_by_line";
const MyOctokit = core_1.Octokit.plugin(plugin_rest_endpoint_methods_1.restEndpointMethods);
const octokit = new MyOctokit({ auth: GITHUB_TOKEN });
const openai = new openai_1.default({ apiKey: OPENAI_API_KEY });
function getPRDetails() {
    return __awaiter(this, void 0, void 0, function* () {
        const { repository, number } = JSON.parse((0, fs_1.readFileSync)(process.env.GITHUB_EVENT_PATH || "", "utf8"));
        const prResponse = yield octokit.rest.pulls.get({
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
    });
}
function getFullFileContent(filePath, prDetails) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Fetch the file content from the PR head branch
            const response = yield octokit.rest.repos.getContent({
                owner: prDetails.owner,
                repo: prDetails.repo,
                path: filePath,
                ref: `refs/pull/${prDetails.pull_number}/head`,
            });
            if (Array.isArray(response.data)) {
                throw new Error(`Expected a file but found a directory at path: ${filePath}`);
            }
            // Check if response.data is of type 'file'
            if (response.data.type !== "file") {
                throw new Error(`Expected a file but found type '${response.data.type}' at path: ${filePath}`);
            }
            const content = Buffer.from(response.data.content, "base64").toString("utf8");
            return content;
        }
        catch (error) {
            console.error(`Error fetching file content for ${filePath}:`, error);
            throw error;
        }
    });
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
function getDiff(owner, repo, pull_number) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield octokit.rest.pulls.get({
            owner,
            repo,
            pull_number,
            mediaType: { format: "diff" },
        });
        // Octokit returns response data as string if media type is "diff"
        return String(response.data);
    });
}
function parseDiff(diffText) {
    // Removes the first element of the resulting array,
    // which is an empty string because the split operation creates an empty string
    const files = diffText.split(/^diff --git/gm).slice(1);
    return files.map((fileDiff) => {
        var _a, _b;
        const [fileHeader, ...contentLines] = fileDiff.split("\n");
        const filePath = (_b = (_a = fileHeader.match(/b\/(\S+)/)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : "";
        // TODO: I dont know if it is plausible to review both added and deleted lines, see `analyzeCode` function
        const changes = contentLines
            .filter((line) => (line.startsWith("+") && !line.startsWith("+++")) ||
            (line.startsWith("-") && !line.startsWith("---")))
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
function analyzeCode(parsedDiff_1, prDetails_1) {
    return __awaiter(this, arguments, void 0, function* (parsedDiff, prDetails, getAIResponseFn = getAIResponse) {
        const comments = [];
        for (const file of parsedDiff) {
            if (file.file === "/dev/null")
                continue;
            for (const change of file.changes) {
                if (change.type === "deleted")
                    continue;
                const prompt = createPrompt(file.file, change, prDetails);
                const aiResponse = yield getAIResponseFn(prompt);
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
    });
}
function createPrompt(filePath, change, prDetails) {
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
function getAIResponse(prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
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
            const completion = yield openai.chat.completions.create(Object.assign(Object.assign({}, queryConfig), { messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant for reviewing github Pull Request code changes.",
                    },
                    { role: "user", content: prompt },
                ] }));
            const responseContent = ((_b = (_a = completion.choices[0].message) === null || _a === void 0 ? void 0 : _a.content) === null || _b === void 0 ? void 0 : _b.trim()) || "{}";
            const parsedResponse = JSON.parse(responseContent);
            // Ensure the response is in the expected format
            if (Array.isArray(parsedResponse.reviews)) {
                // Prepend the disclaimer to each review comment
                return parsedResponse.reviews.map((review) => (Object.assign(Object.assign({}, review), { reviewComment: `${disclaimer}\n\n${review.reviewComment}` })));
            }
            else {
                console.warn("Unexpected response format:", responseContent);
                return responseContent;
            }
        }
        catch (error) {
            console.error("OpenAI API error:", error);
            return null;
        }
    });
}
function createReviewComment(owner, repo, pull_number, comments) {
    return __awaiter(this, void 0, void 0, function* () {
        yield octokit.rest.pulls.createReview({
            owner,
            repo,
            pull_number,
            event: "COMMENT",
            comments,
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const prDetails = yield getPRDetails();
            const diffText = yield getDiff(prDetails.owner, prDetails.repo, prDetails.pull_number);
            if (!diffText) {
                console.log("No diff found");
                return;
            }
            const parsedDiff = parseDiff(diffText);
            const excludePatterns = core
                .getInput("exclude")
                .split(",")
                .map((s) => s.trim());
            const filteredDiff = parsedDiff.filter((file) => !excludePatterns.some((pattern) => (0, minimatch_1.default)(file.file, pattern)));
            const comments = yield analyzeCode(filteredDiff, prDetails);
            if (comments.length > 0) {
                yield createReviewComment(prDetails.owner, prDetails.repo, prDetails.pull_number, comments);
            }
        }
        catch (error) {
            console.error("Error in processing:", error);
            process.exit(1);
        }
    });
}
// Run the main function if the script is executed directly, prevent unit tests from running it
if (require.main === module) {
    main();
}
