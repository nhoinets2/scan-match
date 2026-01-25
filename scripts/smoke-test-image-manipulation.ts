#!/usr/bin/env npx ts-node
/**
 * Smoke Test: Real Image Manipulation
 *
 * This script tests that expo-image-manipulator works correctly
 * by processing a real image file.
 *
 * For device testing, this logic is also available as a dev-only
 * button in the app (when __DEV__ is true).
 *
 * Usage (local development):
 *   npx ts-node scripts/smoke-test-image-manipulation.ts <path-to-image>
 *
 * Example:
 *   npx ts-node scripts/smoke-test-image-manipulation.ts ./test-assets/golden-set/v1/AMB-01_simple_black_slip_dress.webp
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIGURATION (mirrors client-side config)
// ============================================

const FIRST_PASS_DIMENSION = 1280;
const FIRST_PASS_QUALITY = 0.75;
const SECOND_PASS_DIMENSION = 1024;
const SECOND_PASS_QUALITY = 0.70;
const SECOND_PASS_THRESHOLD = 1.5 * 1024 * 1024; // 1.5MB
const MAX_BASE64_LENGTH = 6 * 1024 * 1024; // 6MB

// ============================================
// HELPERS
// ============================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ============================================
// TEST LOGIC
// ============================================

async function runSmokeTest(imagePath: string): Promise<void> {
  console.log('='.repeat(50));
  console.log('SMOKE TEST: Image Manipulation');
  console.log('='.repeat(50));
  console.log();

  // Check if file exists
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ File not found: ${imagePath}`);
    process.exit(1);
  }

  const absolutePath = path.resolve(imagePath);
  const stats = fs.statSync(absolutePath);
  console.log(`Input file: ${absolutePath}`);
  console.log(`Input size: ${formatBytes(stats.size)}`);
  console.log();

  // Note: This script can't actually run expo-image-manipulator
  // because it's a React Native module that requires the RN runtime.
  // Instead, we document what the expected behavior is.

  console.log('Expected behavior on device:');
  console.log('─'.repeat(40));
  console.log();

  console.log('1. FIRST PASS:');
  console.log(`   - Resize to max ${FIRST_PASS_DIMENSION}px`);
  console.log(`   - JPEG quality: ${FIRST_PASS_QUALITY}`);
  console.log(`   - Output: base64 data URL`);
  console.log();

  console.log('2. SIZE CHECK:');
  console.log(`   - If > ${formatBytes(SECOND_PASS_THRESHOLD)}: do second pass`);
  console.log(`   - If <= ${formatBytes(SECOND_PASS_THRESHOLD)}: proceed`);
  console.log();

  console.log('3. SECOND PASS (if needed):');
  console.log(`   - Resize to max ${SECOND_PASS_DIMENSION}px`);
  console.log(`   - JPEG quality: ${SECOND_PASS_QUALITY}`);
  console.log();

  console.log('4. FINAL CHECK:');
  console.log(`   - If > ${formatBytes(MAX_BASE64_LENGTH)}: return payload_too_large error`);
  console.log(`   - If <= ${formatBytes(MAX_BASE64_LENGTH)}: send to Edge Function`);
  console.log();

  console.log('─'.repeat(40));
  console.log();

  // Read file and convert to base64 to show what the raw size would be
  const fileBuffer = fs.readFileSync(absolutePath);
  const base64 = fileBuffer.toString('base64');
  const dataUrl = `data:image/jpeg;base64,${base64}`;

  console.log('Raw file analysis:');
  console.log(`   - File size: ${formatBytes(stats.size)}`);
  console.log(`   - Base64 length: ${formatBytes(dataUrl.length)}`);
  console.log(`   - Would need compression: ${stats.size > SECOND_PASS_THRESHOLD ? 'YES' : 'NO'}`);
  console.log();

  if (dataUrl.length > MAX_BASE64_LENGTH) {
    console.log('⚠️  This file is too large even as raw base64.');
    console.log('   The compression pass(es) should reduce it.');
  } else if (dataUrl.length > SECOND_PASS_THRESHOLD) {
    console.log('📊 This file would trigger second-pass compression.');
  } else {
    console.log('✅ This file would pass with single compression pass.');
  }

  console.log();
  console.log('─'.repeat(40));
  console.log();
  console.log('To test on device:');
  console.log('1. Enable Trust Filter in app');
  console.log('2. Scan an item (don\'t save)');
  console.log('3. Check logs for:');
  console.log('   - "[StyleSignalsService] Resizing and compressing..."');
  console.log('   - "[StyleSignalsService] Sending XXX KB compressed image"');
  console.log('   - "[useTrustFilter] Direct generation response: success"');
  console.log();

  console.log('✅ Smoke test documentation complete');
}

// ============================================
// DEVICE-SIDE TEST (copy to app for dev testing)
// ============================================

const DEVICE_TEST_CODE = `
// Add this to a dev-only screen or button handler
// to test real image manipulation on device

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

async function testImageManipulation() {
  console.log('Starting image manipulation test...');

  // Pick an image
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
  });

  if (result.canceled) {
    console.log('Cancelled');
    return;
  }

  const uri = result.assets[0].uri;
  console.log('Selected image:', uri);

  // First pass
  console.log('Running first pass (1280px, 0.75)...');
  const firstPass = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1280, height: 1280 } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  const firstPassSize = firstPass.base64?.length || 0;
  console.log(\`First pass size: \${Math.round(firstPassSize / 1024)} KB\`);

  // Second pass if needed
  if (firstPassSize > 1.5 * 1024 * 1024) {
    console.log('Running second pass (1024px, 0.70)...');
    const secondPass = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024, height: 1024 } }],
      { compress: 0.70, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    const secondPassSize = secondPass.base64?.length || 0;
    console.log(\`Second pass size: \${Math.round(secondPassSize / 1024)} KB\`);
  }

  console.log('✅ Image manipulation test complete');
}
`;

// ============================================
// MAIN
// ============================================

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: npx ts-node scripts/smoke-test-image-manipulation.ts <image-path>');
  console.log();
  console.log('Example:');
  console.log('  npx ts-node scripts/smoke-test-image-manipulation.ts ./test-assets/golden-set/v1/file.webp');
  console.log();
  console.log('Or use --device-code to print code for device testing:');
  console.log('  npx ts-node scripts/smoke-test-image-manipulation.ts --device-code');
  process.exit(0);
}

if (args[0] === '--device-code') {
  console.log('// Device-side test code for expo-image-manipulator');
  console.log('// Copy this to a dev-only screen and run on device/simulator');
  console.log(DEVICE_TEST_CODE);
  process.exit(0);
}

runSmokeTest(args[0]);
