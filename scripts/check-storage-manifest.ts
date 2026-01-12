#!/usr/bin/env npx ts-node
/**
 * Storage Manifest Check Script
 *
 * Verifies that all Mode B packs have their required files in Supabase Storage.
 * Run with: npx ts-node scripts/check-storage-manifest.ts
 *
 * Checks for:
 * - boards/<packId>/default/do.webp
 * - boards/<packId>/default/dont.webp
 * - boards/<packId>/default/try.webp
 *
 * Note: hero.webp is no longer required - "do" board serves as visual lead.
 */

import { createClient } from "@supabase/supabase-js";

// Configuration
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const BUCKET = "library-item";
const BOARDS_PATH = "boards";
// No hero.webp needed - "do" board serves as visual lead
const REQUIRED_FILES = ["do.webp", "dont.webp", "try.webp"];

// Mode B pack IDs (extracted from TIP_PACKS)
const MODE_B_PACKS = [
  "B_formality_tension",
  "B_style_tension",
  "B_color_tension",
  "B_usage_mismatch",
  "B_shoes_confidence_dampen",
  "B_missing_key_signal",
];

interface CheckResult {
  packId: string;
  variant: string;
  file: string;
  exists: boolean;
  error?: string;
}

async function checkStorageManifest(): Promise<void> {
  console.log("🔍 Storage Manifest Check\n");
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Path: ${BOARDS_PATH}/<packId>/default/`);
  console.log(`Required files: ${REQUIRED_FILES.join(", ")}\n`);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing environment variables:");
    console.error("   EXPO_PUBLIC_SUPABASE_URL");
    console.error("   EXPO_PUBLIC_SUPABASE_ANON_KEY");
    console.error("\nSet them in your .env file or environment.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const results: CheckResult[] = [];
  let missingCount = 0;

  console.log("Checking packs...\n");

  for (const packId of MODE_B_PACKS) {
    const variant = "default";
    const folderPath = `${BOARDS_PATH}/${packId}/${variant}`;

    console.log(`📦 ${packId}`);

    // List files in the folder
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET)
      .list(folderPath);

    if (listError) {
      console.log(`   ❌ Error listing folder: ${listError.message}`);
      REQUIRED_FILES.forEach((file) => {
        results.push({
          packId,
          variant,
          file,
          exists: false,
          error: listError.message,
        });
        missingCount++;
      });
      continue;
    }

    const existingFiles = new Set(files?.map((f) => f.name) ?? []);

    for (const requiredFile of REQUIRED_FILES) {
      const exists = existingFiles.has(requiredFile);
      results.push({ packId, variant, file: requiredFile, exists });

      if (exists) {
        console.log(`   ✅ ${requiredFile}`);
      } else {
        console.log(`   ❌ ${requiredFile} MISSING`);
        missingCount++;
      }
    }

    console.log();
  }

  // Summary
  console.log("─".repeat(50));
  console.log("\n📊 Summary\n");

  const total = MODE_B_PACKS.length * REQUIRED_FILES.length;
  const found = total - missingCount;

  console.log(`Total files expected: ${total}`);
  console.log(`Found: ${found}`);
  console.log(`Missing: ${missingCount}`);

  if (missingCount === 0) {
    console.log("\n✅ All Mode B storage files are present!");
  } else {
    console.log("\n❌ Missing files detected. Upload them to Supabase Storage:");
    console.log();

    const missing = results.filter((r) => !r.exists);
    missing.forEach((r) => {
      console.log(`   ${BOARDS_PATH}/${r.packId}/${r.variant}/${r.file}`);
    });

    process.exit(1);
  }
}

// Run
checkStorageManifest().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});

