/**
 * Jest Setup File
 *
 * Runs before each test file is loaded.
 * Sets up environment variables and global mocks.
 */

// Set Supabase URL for tests (required by tipsheets.ts)
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

// Export for expo/virtual/env mock
module.exports = {
  env: process.env,
};

