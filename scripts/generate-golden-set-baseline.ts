/**
 * Golden Set Baseline Generator
 * 
 * This script:
 * 1. Lists all images in the golden_set Supabase bucket
 * 2. Calls the style-signals Edge Function for each
 * 3. Outputs results to test-assets/golden-set-baseline.json for review
 * 
 * Usage:
 *   bun run scripts/generate-golden-set-baseline.ts
 * 
 * Requirements:
 *   - EXPO_PUBLIC_SUPABASE_URL in .env
 *   - EXPO_PUBLIC_SUPABASE_ANON_KEY in .env
 *   - Authenticated Supabase session (or use service role key)
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIG
// ============================================

const BUCKET_NAME = 'golden_set';
const SUBFOLDER = 'v1'; // Images are in the v1 subfolder
const OUTPUT_FILE = 'test-assets/golden-set-baseline.json';

// ============================================
// SETUP
// ============================================

// Load env
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Use service role key for Edge Function call if available
const authKey = serviceRoleKey || supabaseKey;

// ============================================
// TYPES
// ============================================

interface StyleSignalsV1 {
  version: number;
  aesthetic: {
    primary: string;
    primary_confidence: number;
    secondary: string;
    secondary_confidence: number;
  };
  formality: { band: string; confidence: number };
  statement: { level: string; confidence: number };
  season: { heaviness: string; confidence: number };
  palette: { colors: string[]; confidence: number };
  pattern: { level: string; confidence: number };
  material: { family: string; confidence: number };
}

interface GoldenSetEntry {
  filename: string;
  imageUrl: string;
  generatedAt: string;
  signals: StyleSignalsV1;
  approved: boolean;
  notes: string;
}

interface GoldenSetBaseline {
  version: number;
  generatedAt: string;
  promptVersion: number;
  entries: GoldenSetEntry[];
}

// ============================================
// EDGE FUNCTION CALL
// ============================================

async function analyzeImageViaEdgeFunction(imageName: string): Promise<StyleSignalsV1 | null> {
  try {
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/style-signals`;
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'golden_set',
        imageName,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error(`  ❌ Edge Function error:`, result.error);
      return null;
    }

    return result.data as StyleSignalsV1;
  } catch (error) {
    console.error(`  ❌ Error:`, error);
    return null;
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🎯 Golden Set Baseline Generator\n');
  console.log(`📡 Using Edge Function at: ${supabaseUrl}/functions/v1/style-signals\n`);

  // 1. List images in bucket subfolder
  console.log(`📁 Listing images in "${BUCKET_NAME}/${SUBFOLDER}" ...`);
  
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET_NAME)
    .list(SUBFOLDER, { limit: 100 });

  if (listError) {
    console.error('❌ Error listing files:', listError.message);
    process.exit(1);
  }

  // Filter to image files only (exclude folders)
  const imageFiles = files?.filter(f => 
    f.id !== null && /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name)
  ) ?? [];

  if (imageFiles.length === 0) {
    console.log('⚠️  No images found in bucket');
    console.log('   Files found:', files?.map(f => f.name));
    process.exit(0);
  }

  console.log(`✅ Found ${imageFiles.length} images\n`);

  // 2. Process each image
  const entries: GoldenSetEntry[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const fullPath = `${SUBFOLDER}/${file.name}`;
    console.log(`[${i + 1}/${imageFiles.length}] Processing: ${fullPath}`);

    // Get signed URL for display (bucket is private)
    const { data: signedData } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(fullPath, 3600 * 24 * 7); // 7 days for review

    const imageUrl = signedData?.signedUrl || '';

    // Analyze via Edge Function (pass full path including subfolder)
    const signals = await analyzeImageViaEdgeFunction(fullPath);

    if (signals) {
      entries.push({
        filename: fullPath,
        imageUrl,
        generatedAt: new Date().toISOString(),
        signals,
        approved: false, // User needs to review and approve
        notes: '',
      });
      console.log(`  ✅ ${signals.aesthetic.primary} (${(signals.aesthetic.primary_confidence * 100).toFixed(0)}%) | formality: ${signals.formality.band} | statement: ${signals.statement.level}`);
    } else {
      console.log(`  ⚠️  Failed to analyze, skipping`);
    }

    // Small delay to avoid rate limits
    if (i < imageFiles.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // 3. Write output file
  const baseline: GoldenSetBaseline = {
    version: 1,
    generatedAt: new Date().toISOString(),
    promptVersion: 1,
    entries,
  };

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(baseline, null, 2));
  console.log(`\n📄 Results saved to: ${OUTPUT_FILE}`);
  console.log(`\n✅ Done! Processed ${entries.length}/${imageFiles.length} images`);
  console.log('\n📝 Next steps:');
  console.log('   1. Review the generated signals in the JSON file');
  console.log('   2. Correct any incorrect values');
  console.log('   3. Set "approved: true" for entries you\'ve verified');
  console.log('   4. Run the test harness to compare future outputs');
}

main().catch(console.error);
