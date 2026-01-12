/**
 * Jest Configuration
 */
module.exports = {
  // Use the setup file to set environment variables
  setupFiles: ['<rootDir>/jest.setup.js'],

  // Transform TypeScript files
  transform: {
    '^.+\\.(ts|tsx)$': 'babel-jest',
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Module name mapper for path aliases and mocks
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Mock the Expo virtual env module to avoid ESM issues in Jest
    '^expo/virtual/env$': '<rootDir>/jest.setup.js',
  },

  // Ignore patterns for transformations
  transformIgnorePatterns: [
    'node_modules/(?!(expo|@expo|expo-.*|react-native|@react-native|@react-navigation)/)',
  ],

  // Test environment
  testEnvironment: 'node',
};

