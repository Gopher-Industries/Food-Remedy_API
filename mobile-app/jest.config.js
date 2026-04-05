/** Jest config for mobile-app tests (TypeScript via ts-jest) */
module.exports = {
    reset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
        tsconfig: 'tsconfig.json',
        }],
    },
    moduleNameMapper: {
        'expo-sqlite': '<rootDir>/__mocks__/expo-sqlite.js',
    },
};