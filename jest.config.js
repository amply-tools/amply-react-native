module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native)/)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  moduleNameMapper: {
    '^react-native$': '<rootDir>/jest/mocks/reactNative.js',
    '^react$': '<rootDir>/jest/mocks/react.js',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/example/',
    '/dist/',
  ],
  testMatch: ['**/src/**/__tests__/**/*.test.ts'],
};
