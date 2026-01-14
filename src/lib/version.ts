/**
 * Version information for the app
 *
 * This file contains build-time version info including the git commit hash.
 * The COMMIT_HASH is updated before each build.
 */

import Constants from 'expo-constants';

// Git commit hash (7 characters) - update this before building
// Run: git rev-parse --short=7 HEAD
export const COMMIT_HASH = '305c14a';

// Build timestamp (for tracking when the build was created)
export const BUILD_TIMESTAMP = '2025-01-14T12:00:00Z';

/**
 * Get the full version string including commit hash
 * Format: "1.0.0 (42) #c58d494"
 */
export function getFullVersion(): string {
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber ||
                      Constants.expoConfig?.android?.versionCode ||
                      '1';

  return `${appVersion} (${buildNumber}) #${COMMIT_HASH}`;
}

/**
 * Get just the app version from expo config
 */
export function getAppVersion(): string {
  return Constants.expoConfig?.version || '1.0.0';
}

/**
 * Get the build number from expo config
 */
export function getBuildNumber(): string {
  return Constants.expoConfig?.ios?.buildNumber ||
         Constants.expoConfig?.android?.versionCode?.toString() ||
         '1';
}

/**
 * Get version info object for diagnostics
 */
export function getVersionInfo() {
  return {
    version: getAppVersion(),
    buildNumber: getBuildNumber(),
    commitHash: COMMIT_HASH,
    fullVersion: getFullVersion(),
    buildTimestamp: BUILD_TIMESTAMP,
  };
}
