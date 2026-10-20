/** @type {import('jest').Config} */
const shared = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }] },
  testEnvironment: 'node',
  rootDir: '.',
};

module.exports = {
  projects: [
    { ...shared, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/cli/**', '!src/**/*.module.ts'],
};
