/** Jest config for mobile-app tests (TypeScript via ts-jest) */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
        tsconfig: 'tsconfig.json',
        }],
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        'expo-sqlite': '<rootDir>/__mocks__/expo-sqlite.js',
        '^@/(.*)$': '<rootDir>/$1',
    },
};
