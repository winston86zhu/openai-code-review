module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    "^.+\\.(t|j)sx?$": "babel-jest"
  },
  transformIgnorePatterns: [
    "node_modules/(?!.*)"
  ],
};
