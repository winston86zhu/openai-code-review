// jest.config.cjs
module.exports = {
  transform: {
    "^.+\\.tsx?$": "babel-jest",       // Use babel-jest for transforming TypeScript files
  },
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "js", "json"],
  transformIgnorePatterns: [
    "/node_modules/(?!@octokit|@actions|minimatch)",  // Transform @octokit, @actions, and minimatch
  ],
};
