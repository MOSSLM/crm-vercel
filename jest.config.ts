import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/setupTests.ts'],
  moduleNameMapper: {
    // Order matters: only the FIRST matching pattern is applied. The stylesheet
    // rule has to come before the '@/' alias, otherwise an aliased CSS import
    // ("@/components/.../theme.css") is rewritten to a real path and then fed
    // to the TS transform, which chokes on the first selector.
    '\\.(css|sass|scss)$': '<rootDir>/src/test-shims/style-mock.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^server-only$': '<rootDir>/src/test-shims/server-only.ts',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { module: 'commonjs', jsx: 'react-jsx' } }],
  },
};

export default config;
