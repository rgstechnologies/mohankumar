/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Environment variables + test database are prepared before any test runs.
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  testTimeout: 30000,
  // E2E spec boots the whole Nest app — run files serially to avoid
  // voucher-number races between parallel workers sharing one test DB.
  maxWorkers: 1,
};
