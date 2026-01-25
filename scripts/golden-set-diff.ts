/**
 * Golden Set Diff Script
 * 
 * Compares a run output against the approved baseline.
 * Computes metrics and determines pass/fail status.
 * 
 * Usage:
 *   bun run scripts/golden-set-diff.ts [run-file]
 * 
 * If no run-file specified, uses the latest run in runs/
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIG
// ============================================

const BASELINE_FILE = 'test-assets/golden-set-baseline.json';
const RUNS_DIR = 'test-assets/golden-set/runs';

// Thresholds (MVP defaults)
const THRESHOLDS = {
  // Hard metrics (FAIL)
  primary_flip_rate: 0.10,      // 10%
  formality_flip_rate: 0.10,   // 10%
  unknown_primary_rate: 0.20,  // 20%
  schema_valid_rate: 1.0,      // 100%
  
  // Soft metrics (WARN)
  avg_confidence_delta: 0.20,  // 0.20
};

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

interface BaselineEntry {
  filename: string;
  signals: StyleSignalsV1;
  approved: boolean;
  notes: string;
  // Optional: allow alternates
  allow_primary?: string[];  // e.g., ["classic", "minimalist"]
  allow_formality?: string[]; // e.g., ["casual", "smart_casual"]
}

interface Baseline {
  version: number;
  promptVersion: number;
  entries: BaselineEntry[];
}

interface RunEntry {
  id: string;
  filename: string;
  style_signals_v1: StyleSignalsV1 | null;
  prompt_version: number;
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

interface DiffEntry {
  filename: string;
  primary_match: boolean;
  formality_match: boolean;
  primary_baseline: string;
  primary_run: string;
  formality_baseline: string;
  formality_run: string;
  confidence_delta: number;
  is_unknown: boolean;
  schema_valid: boolean;
  notes: string;
}

interface DiffResult {
  run_id: string;
  baseline_version: number;
  run_prompt_version: number;
  diff_date: string;
  
  // Hard metrics
  primary_flip_rate: number;
  formality_flip_rate: number;
  unknown_primary_rate: number;
  schema_valid_rate: number;
  
  // Soft metrics
  avg_primary_confidence_delta: number;
  avg_formality_confidence_delta: number;
  secondary_change_rate: number;
  
  // Summary
  total_compared: number;
  primary_flips: number;
  formality_flips: number;
  unknown_count: number;
  schema_invalid_count: number;
  
  // Status
  hard_pass: boolean;
  soft_pass: boolean;
  overall_status: 'PASS' | 'WARN' | 'FAIL';
  
  // Details
  entries: DiffEntry[];
  failures: string[];
  warnings: string[];
}

// ============================================
// VALIDATION
// ============================================

const VALID_ARCHETYPES = [
  'minimalist', 'classic', 'workwear', 'romantic', 'boho', 'western',
  'street', 'sporty', 'edgy', 'glam', 'preppy', 'outdoor_utility', 'unknown', 'none'
];

const VALID_FORMALITY = [
  'athleisure', 'casual', 'smart_casual', 'office', 'formal', 'evening', 'unknown'
];

function isSchemaValid(signals: StyleSignalsV1 | null): boolean {
  if (!signals) return false;
  if (signals.version !== 1) return false;
  if (!signals.aesthetic?.primary) return false;
  if (!signals.formality?.band) return false;
  if (!VALID_ARCHETYPES.includes(signals.aesthetic.primary)) return false;
  if (!VALID_FORMALITY.includes(signals.formality.band)) return false;
  return true;
}

// ============================================
// DIFF LOGIC
// ============================================

function isPrimaryMatch(
  baseline: BaselineEntry,
  runSignals: StyleSignalsV1
): boolean {
  const baselinePrimary = baseline.signals.aesthetic.primary;
  const runPrimary = runSignals.aesthetic.primary;
  
  // Exact match
  if (baselinePrimary === runPrimary) return true;
  
  // Check allowed alternates (parsed from notes or explicit field)
  const allowedAlternates = parseAllowedAlternates(baseline.notes, 'primary');
  if (allowedAlternates.includes(runPrimary)) return true;
  
  if (baseline.allow_primary?.includes(runPrimary)) return true;
  
  return false;
}

function isFormalityMatch(
  baseline: BaselineEntry,
  runSignals: StyleSignalsV1
): boolean {
  const baselineFormality = baseline.signals.formality.band;
  const runFormality = runSignals.formality.band;
  
  // Exact match
  if (baselineFormality === runFormality) return true;
  
  // Check allowed alternates
  const allowedAlternates = parseAllowedAlternates(baseline.notes, 'formality');
  if (allowedAlternates.includes(runFormality)) return true;
  
  if (baseline.allow_formality?.includes(runFormality)) return true;
  
  return false;
}

function parseAllowedAlternates(notes: string, field: 'primary' | 'formality'): string[] {
  // Parse notes like:
  // "Expected primary=minimalist; allow primary=classic"
  // "Formality is boundary; expected=office but allow smart_casual"
  
  const alternates: string[] = [];
  const lowerNotes = notes.toLowerCase();
  
  if (field === 'primary') {
    // Match patterns like "allow primary=classic" or "allow minimalist or glam"
    const allowMatch = lowerNotes.match(/allow\s+(?:primary[=:]?\s*)?(\w+)/g);
    if (allowMatch) {
      for (const match of allowMatch) {
        const value = match.replace(/allow\s+(?:primary[=:]?\s*)?/, '').trim();
        if (VALID_ARCHETYPES.includes(value)) {
          alternates.push(value);
        }
      }
    }
  } else if (field === 'formality') {
    // Match patterns like "allow formality=smart_casual" or "allow casual"
    const allowMatch = lowerNotes.match(/allow\s+(?:formality[=:]?\s*)?(\w+)/g);
    if (allowMatch) {
      for (const match of allowMatch) {
        const value = match.replace(/allow\s+(?:formality[=:]?\s*)?/, '').trim();
        if (VALID_FORMALITY.includes(value)) {
          alternates.push(value);
        }
      }
    }
  }
  
  return alternates;
}

function computeDiff(baseline: Baseline, run: RunOutput): DiffResult {
  const entries: DiffEntry[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];
  
  let primaryFlips = 0;
  let formalityFlips = 0;
  let unknownCount = 0;
  let schemaInvalidCount = 0;
  let totalCompared = 0;
  
  let primaryConfidenceDeltaSum = 0;
  let formalityConfidenceDeltaSum = 0;
  let secondaryChanges = 0;
  
  // Create lookup for run entries
  const runMap = new Map<string, RunEntry>();
  for (const entry of run.entries) {
    runMap.set(entry.filename, entry);
  }
  
  // Compare each baseline entry
  for (const baselineEntry of baseline.entries) {
    if (!baselineEntry.approved) continue; // Skip unapproved
    
    const runEntry = runMap.get(baselineEntry.filename);
    
    if (!runEntry || !runEntry.style_signals_v1) {
      // Missing in run
      entries.push({
        filename: baselineEntry.filename,
        primary_match: false,
        formality_match: false,
        primary_baseline: baselineEntry.signals.aesthetic.primary,
        primary_run: 'MISSING',
        formality_baseline: baselineEntry.signals.formality.band,
        formality_run: 'MISSING',
        confidence_delta: 0,
        is_unknown: false,
        schema_valid: false,
        notes: runEntry?.error || 'Missing from run',
      });
      schemaInvalidCount++;
      totalCompared++;
      continue;
    }
    
    const runSignals = runEntry.style_signals_v1;
    const schemaValid = isSchemaValid(runSignals);
    const primaryMatch = isPrimaryMatch(baselineEntry, runSignals);
    const formalityMatch = isFormalityMatch(baselineEntry, runSignals);
    const isUnknown = runSignals.aesthetic.primary === 'unknown';
    
    // Confidence deltas
    const primaryConfDelta = Math.abs(
      runSignals.aesthetic.primary_confidence - baselineEntry.signals.aesthetic.primary_confidence
    );
    const formalityConfDelta = Math.abs(
      runSignals.formality.confidence - baselineEntry.signals.formality.confidence
    );
    
    // Secondary changes
    if (runSignals.aesthetic.secondary !== baselineEntry.signals.aesthetic.secondary) {
      secondaryChanges++;
    }
    
    // Update counters
    if (!primaryMatch) primaryFlips++;
    if (!formalityMatch) formalityFlips++;
    if (isUnknown) unknownCount++;
    if (!schemaValid) schemaInvalidCount++;
    
    primaryConfidenceDeltaSum += primaryConfDelta;
    formalityConfidenceDeltaSum += formalityConfDelta;
    totalCompared++;
    
    entries.push({
      filename: baselineEntry.filename,
      primary_match: primaryMatch,
      formality_match: formalityMatch,
      primary_baseline: baselineEntry.signals.aesthetic.primary,
      primary_run: runSignals.aesthetic.primary,
      formality_baseline: baselineEntry.signals.formality.band,
      formality_run: runSignals.formality.band,
      confidence_delta: primaryConfDelta,
      is_unknown: isUnknown,
      schema_valid: schemaValid,
      notes: baselineEntry.notes,
    });
  }
  
  // Compute rates
  const primaryFlipRate = totalCompared > 0 ? primaryFlips / totalCompared : 0;
  const formalityFlipRate = totalCompared > 0 ? formalityFlips / totalCompared : 0;
  const unknownPrimaryRate = totalCompared > 0 ? unknownCount / totalCompared : 0;
  const schemaValidRate = totalCompared > 0 ? (totalCompared - schemaInvalidCount) / totalCompared : 0;
  
  const avgPrimaryConfDelta = totalCompared > 0 ? primaryConfidenceDeltaSum / totalCompared : 0;
  const avgFormalityConfDelta = totalCompared > 0 ? formalityConfidenceDeltaSum / totalCompared : 0;
  const secondaryChangeRate = totalCompared > 0 ? secondaryChanges / totalCompared : 0;
  
  // Check thresholds
  let hardPass = true;
  let softPass = true;
  
  if (primaryFlipRate > THRESHOLDS.primary_flip_rate) {
    hardPass = false;
    failures.push(`Primary flip rate ${(primaryFlipRate * 100).toFixed(1)}% > ${THRESHOLDS.primary_flip_rate * 100}%`);
  }
  
  if (formalityFlipRate > THRESHOLDS.formality_flip_rate) {
    hardPass = false;
    failures.push(`Formality flip rate ${(formalityFlipRate * 100).toFixed(1)}% > ${THRESHOLDS.formality_flip_rate * 100}%`);
  }
  
  if (unknownPrimaryRate > THRESHOLDS.unknown_primary_rate) {
    hardPass = false;
    failures.push(`Unknown primary rate ${(unknownPrimaryRate * 100).toFixed(1)}% > ${THRESHOLDS.unknown_primary_rate * 100}%`);
  }
  
  if (schemaValidRate < THRESHOLDS.schema_valid_rate) {
    hardPass = false;
    failures.push(`Schema valid rate ${(schemaValidRate * 100).toFixed(1)}% < 100%`);
  }
  
  if (avgPrimaryConfDelta > THRESHOLDS.avg_confidence_delta) {
    softPass = false;
    warnings.push(`Avg primary confidence delta ${avgPrimaryConfDelta.toFixed(3)} > ${THRESHOLDS.avg_confidence_delta}`);
  }
  
  const overallStatus: 'PASS' | 'WARN' | 'FAIL' = !hardPass ? 'FAIL' : !softPass ? 'WARN' : 'PASS';
  
  return {
    run_id: run.run_id,
    baseline_version: baseline.version,
    run_prompt_version: run.prompt_version,
    diff_date: new Date().toISOString(),
    
    primary_flip_rate: primaryFlipRate,
    formality_flip_rate: formalityFlipRate,
    unknown_primary_rate: unknownPrimaryRate,
    schema_valid_rate: schemaValidRate,
    
    avg_primary_confidence_delta: avgPrimaryConfDelta,
    avg_formality_confidence_delta: avgFormalityConfDelta,
    secondary_change_rate: secondaryChangeRate,
    
    total_compared: totalCompared,
    primary_flips: primaryFlips,
    formality_flips: formalityFlips,
    unknown_count: unknownCount,
    schema_invalid_count: schemaInvalidCount,
    
    hard_pass: hardPass,
    soft_pass: softPass,
    overall_status: overallStatus,
    
    entries,
    failures,
    warnings,
  };
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🔍 Golden Set Diff\n');
  
  // Load baseline
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(`❌ Baseline file not found: ${BASELINE_FILE}`);
    process.exit(1);
  }
  
  const baseline: Baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
  console.log(`📋 Baseline: ${baseline.entries.filter(e => e.approved).length} approved entries`);
  
  // Find run file
  let runFile = process.argv[2];
  
  if (!runFile) {
    // Use latest run
    if (!fs.existsSync(RUNS_DIR)) {
      console.error(`❌ No runs directory found: ${RUNS_DIR}`);
      console.error('   Run "bun run scripts/golden-set-run.ts" first');
      process.exit(1);
    }
    
    const runs = fs.readdirSync(RUNS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();
    
    if (runs.length === 0) {
      console.error('❌ No run files found');
      console.error('   Run "bun run scripts/golden-set-run.ts" first');
      process.exit(1);
    }
    
    runFile = path.join(RUNS_DIR, runs[0]);
  }
  
  console.log(`📄 Run file: ${runFile}\n`);
  
  const run: RunOutput = JSON.parse(fs.readFileSync(runFile, 'utf-8'));
  
  // Compute diff
  const diff = computeDiff(baseline, run);
  
  // Print results
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  GOLDEN SET DIFF REPORT`);
  console.log(`  Run: ${diff.run_id}`);
  console.log(`  Date: ${diff.diff_date}`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log('📊 HARD METRICS (must pass for CI)');
  console.log('───────────────────────────────────────────────────────');
  console.log(`  Primary flip rate:    ${(diff.primary_flip_rate * 100).toFixed(1)}% (threshold: ≤${THRESHOLDS.primary_flip_rate * 100}%)`);
  console.log(`  Formality flip rate:  ${(diff.formality_flip_rate * 100).toFixed(1)}% (threshold: ≤${THRESHOLDS.formality_flip_rate * 100}%)`);
  console.log(`  Unknown primary rate: ${(diff.unknown_primary_rate * 100).toFixed(1)}% (threshold: ≤${THRESHOLDS.unknown_primary_rate * 100}%)`);
  console.log(`  Schema valid rate:    ${(diff.schema_valid_rate * 100).toFixed(1)}% (threshold: 100%)`);
  console.log('');
  
  console.log('📈 SOFT METRICS (warnings)');
  console.log('───────────────────────────────────────────────────────');
  console.log(`  Avg primary conf Δ:   ${diff.avg_primary_confidence_delta.toFixed(3)} (threshold: ≤${THRESHOLDS.avg_confidence_delta})`);
  console.log(`  Avg formality conf Δ: ${diff.avg_formality_confidence_delta.toFixed(3)}`);
  console.log(`  Secondary change rate: ${(diff.secondary_change_rate * 100).toFixed(1)}%`);
  console.log('');
  
  console.log('📋 SUMMARY');
  console.log('───────────────────────────────────────────────────────');
  console.log(`  Total compared:    ${diff.total_compared}`);
  console.log(`  Primary flips:     ${diff.primary_flips}`);
  console.log(`  Formality flips:   ${diff.formality_flips}`);
  console.log(`  Unknown count:     ${diff.unknown_count}`);
  console.log(`  Schema invalid:    ${diff.schema_invalid_count}`);
  console.log('');
  
  if (diff.failures.length > 0) {
    console.log('❌ FAILURES');
    console.log('───────────────────────────────────────────────────────');
    for (const failure of diff.failures) {
      console.log(`  • ${failure}`);
    }
    console.log('');
  }
  
  if (diff.warnings.length > 0) {
    console.log('⚠️  WARNINGS');
    console.log('───────────────────────────────────────────────────────');
    for (const warning of diff.warnings) {
      console.log(`  • ${warning}`);
    }
    console.log('');
  }
  
  // Print flipped items
  const flippedEntries = diff.entries.filter(e => !e.primary_match || !e.formality_match);
  if (flippedEntries.length > 0) {
    console.log('🔄 FLIPPED ITEMS');
    console.log('───────────────────────────────────────────────────────');
    for (const entry of flippedEntries) {
      console.log(`  ${entry.filename}`);
      if (!entry.primary_match) {
        console.log(`    primary: ${entry.primary_baseline} → ${entry.primary_run}`);
      }
      if (!entry.formality_match) {
        console.log(`    formality: ${entry.formality_baseline} → ${entry.formality_run}`);
      }
    }
    console.log('');
  }
  
  console.log('═══════════════════════════════════════════════════════');
  if (diff.overall_status === 'PASS') {
    console.log('  ✅ STATUS: PASS');
  } else if (diff.overall_status === 'WARN') {
    console.log('  ⚠️  STATUS: WARN (soft metrics exceeded)');
  } else {
    console.log('  ❌ STATUS: FAIL');
  }
  console.log('═══════════════════════════════════════════════════════');
  
  // Save diff report
  const diffFile = runFile.replace('.json', '-diff.json');
  fs.writeFileSync(diffFile, JSON.stringify(diff, null, 2));
  console.log(`\n📄 Diff report saved: ${diffFile}`);
  
  // Exit with appropriate code
  if (diff.overall_status === 'FAIL') {
    process.exit(1);
  }
}

main().catch(console.error);
