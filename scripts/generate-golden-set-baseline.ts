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

// Hardcoded list of golden set images (bucket listing is restricted)
const GOLDEN_SET_FILES = [
  'MIN-01_black_leather_ankle_boots.webp',
  'MIN-02_white_crewneck_tee.webp',
  'MIN-03_black_straight_leg_trousers.webp',
  'CLA-01_beige_trench_coat.webp',
  'CLA-02_navy_blazer.webp',
  'CLA-03_structured_leather_tote.webp',
  'AMB-01_simple_black_slip_dress.webp',
  'AMB-02_tailored_black_blazer.webp',
  'AMB-03_dark_skinny_jeans.webp',
  'AMB-04_white_sneakers.webp',
  'WRK-01_blue_denim_jacket.webp',
  'WRK-02_olive_utility_jacket.webp',
  'WRK-03_straight_dark_denim_jeans.webp',
  'GLM-01_sequin_camisole.webp',
  'GLM-02_metalic_clutch.webp',
  'GLM-03_stiletto_heels.webp',
  'ROM-01_puff_sleeve_blouse.webp',
  'ROM-02_satin_midi_slip_skirt.webp',
  'ROM-03_pearl_necklace.webp',
  'EDG-01_leather_moto_jacket.webp',
  'EDG-02_combat_boots.webp',
  'EDG-03_silver_chain_necklace.webp',
  'BOH-01_flora_maxi_dress.webp',
  'BOH-02_fringe_suede_bag.webp',
  'BOH-03_wide_brim_felt_hat.webp',
  'STR-01_oversized_graphic_tee.webp',
  'STR-02_baggy_cargo_pants.webp',
  'STR-03_chunky_sneakers.webp',
  'PRP-01_cable_knit_sweater.webp',
  'PRP-02_pleated_mini_skirt.webp',
  'PRP-03_loafers.webp',
  'SPT-01_gray_cropped_sweatshirt.webp',
  'SPT-02_black_leggins.webp',
  'SPT-03_running_shoes.webp',
  'WES-01_white_cowboy_boots.webp',
  'WES-02_western_belt_buckle.webp',
  'WES-03_denim_shirt_with_yoke.webp',
  'OUT-01_technical_shell_jacket.webp',
  'OUT-02_trail_sneakers.webp',
  'OUT-03_nylon_crossbody.webp',
];

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

  // Use hardcoded file list (bucket listing is restricted)
  console.log(`📁 Processing ${GOLDEN_SET_FILES.length} images from ${BUCKET_NAME}/${SUBFOLDER}/\n`);

  // 2. Process each image
  const entries: GoldenSetEntry[] = [];

  for (let i = 0; i < GOLDEN_SET_FILES.length; i++) {
    const filename = GOLDEN_SET_FILES[i];
    const fullPath = `${SUBFOLDER}/${filename}`;
    console.log(`[${i + 1}/${GOLDEN_SET_FILES.length}] Processing: ${filename}`);

    // Get public URL for display
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fullPath);

    const imageUrl = urlData.publicUrl;

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
    if (i < GOLDEN_SET_FILES.length - 1) {
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
  console.log(`\n✅ Done! Processed ${entries.length}/${GOLDEN_SET_FILES.length} images`);
  console.log('\n📝 Next steps:');
  console.log('   1. Review the generated signals in the JSON file');
  console.log('   2. Correct any incorrect values');
  console.log('   3. Set "approved: true" for entries you\'ve verified');
  console.log('   4. Run the test harness to compare future outputs');
}

main().catch(console.error);
