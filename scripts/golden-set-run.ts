/**
 * Golden Set Run Script
 * 
 * Runs style-signals pipeline against all golden set images
 * and saves the output for comparison against baseline.
 * 
 * Usage:
 *   bun run scripts/golden-set-run.ts
 * 
 * Output:
 *   test-assets/golden-set/runs/run-YYYY-MM-DD_v{promptVersion}.json
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIG
// ============================================

const BUCKET_NAME = 'golden_set';
const SUBFOLDER = 'v1';
const BASELINE_FILE = 'test-assets/golden-set-baseline.json';
const RUNS_DIR = 'test-assets/golden-set/runs';

// ============================================
// SETUP
// ============================================

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

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

interface RunEntry {
  id: string;
  filename: string;
  style_signals_v1: StyleSignalsV1 | null;
  prompt_version: number;
  input_hash: string;
  timing_ms: number;
  cache_hit: boolean;
  error?: string;
}

interface RunOutput {
  run_id: string;
  run_date: string;
  prompt_version: number;
  total_images: number;
  successful: number;
  failed: number;
  entries: RunEntry[];
}

interface BaselineEntry {
  filename: string;
  signals: StyleSignalsV1;
  approved: boolean;
  notes: string;
}

interface Baseline {
  version: number;
  promptVersion: number;
  entries: BaselineEntry[];
}

// ============================================
// EDGE FUNCTION CALL
// ============================================

async function analyzeImage(imageName: string): Promise<{
  signals: StyleSignalsV1 | null;
  timing_ms: number;
  cache_hit: boolean;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/style-signals`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'golden_set', imageName }),
    });

    const result = await response.json();
    const timing_ms = Date.now() - startTime;

    if (!result.ok) {
      return {
        signals: null,
        timing_ms,
        cache_hit: false,
        error: result.error?.message || 'Unknown error',
      };
    }

    return {
      signals: result.data,
      timing_ms,
      cache_hit: result.cached || false,
    };
  } catch (error) {
    return {
      signals: null,
      timing_ms: Date.now() - startTime,
      cache_hit: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function computeInputHash(filename: string): string {
  let hash = 0;
  for (let i = 0; i < filename.length; i++) {
    const char = filename.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🎯 Golden Set Run\n');
  
  // Load baseline to get list of images
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(`❌ Baseline file not found: ${BASELINE_FILE}`);
    process.exit(1);
  }

  const baseline: Baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
  const promptVersion = baseline.promptVersion || 1;
  
  console.log(`📋 Baseline: ${baseline.entries.length} images, prompt v${promptVersion}`);
  console.log(`📡 Edge Function: ${supabaseUrl}/functions/v1/style-signals\n`);

  // Create runs directory
  if (!fs.existsSync(RUNS_DIR)) {
    fs.mkdirSync(RUNS_DIR, { recursive: true });
  }

  // Generate run ID
  const today = new Date().toISOString().split('T')[0];
  const runId = `run-${today}_v${promptVersion}`;
  
  console.log(`🏃 Run ID: ${runId}\n`);

  // Process each image
  const entries: RunEntry[] = [];
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < baseline.entries.length; i++) {
    const baselineEntry = baseline.entries[i];
    const filename = baselineEntry.filename;
    
    console.log(`[${i + 1}/${baseline.entries.length}] ${filename}`);

    const result = await analyzeImage(filename);

    const entry: RunEntry = {
      id: filename.replace(/[^a-zA-Z0-9]/g, '_'),
      filename,
      style_signals_v1: result.signals,
      prompt_version: promptVersion,
      input_hash: computeInputHash(filename),
      timing_ms: result.timing_ms,
      cache_hit: result.cache_hit,
    };

    if (result.error) {
      entry.error = result.error;
      failed++;
      console.log(`  ❌ Error: ${result.error}`);
    } else if (result.signals) {
      successful++;
      console.log(`  ✅ ${result.signals.aesthetic.primary} | ${result.timing_ms}ms${result.cache_hit ? ' (cached)' : ''}`);
    }

    entries.push(entry);

    // Rate limiting
    if (i < baseline.entries.length - 1 && !result.cache_hit) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Build output
  const output: RunOutput = {
    run_id: runId,
    run_date: new Date().toISOString(),
    prompt_version: promptVersion,
    total_images: baseline.entries.length,
    successful,
    failed,
    entries,
  };

  // Save run
  const outputFile = path.join(RUNS_DIR, `${runId}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

  console.log(`\n📄 Run saved: ${outputFile}`);
  console.log(`\n✅ Complete: ${successful} successful, ${failed} failed`);
  console.log(`\n📝 Next: Run 'bun run scripts/golden-set-diff.ts' to compare against baseline`);
}

main().catch(console.error);
