// Mock for expo-sqlite - prevents Jest from trying to parse the native Expo module which uses ESM syntax Jest can't handle
module.exports = {
    openDatabaseAsync: jest.fn(),
    SQLiteDatabase: jest.fn(),
};