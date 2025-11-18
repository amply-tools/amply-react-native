module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@expo|expo(nent)?|@unimodules|unimodules|sentry-expo)/)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^react-native$': '<rootDir>/jest/mocks/reactNative.js',
  },
};
