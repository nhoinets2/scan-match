/**
 * Golden Set Claude Comparison Script
 * 
 * Compares Claude Sonnet 4.5 results against the approved GPT-4o baseline
 * from the golden set.
 * 
 * Run with: npx tsx scripts/golden-set-claude-comparison.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      if (line.startsWith('#') || !line.trim()) return;
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        if (key && value) process.env[key] = value;
      }
    });
    console.log(`✅ Loaded environment from ${envPath}`);
  }
} catch (e) {}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not found');
  process.exit(1);
}

// Style Signals prompt (same as Edge Function)
const STYLE_SIGNALS_PROMPT = `Analyze this clothing item image and respond ONLY with a valid JSON object (no markdown, no explanation).

The JSON must have EXACTLY this structure with ALL keys present:
{
  "version": 1,
  "aesthetic": {
    "primary": "<archetype>",
    "primary_confidence": <0.0-1.0>,
    "secondary": "<archetype|none>",
    "secondary_confidence": <0.0-1.0>
  },
  "formality": {
    "band": "<formality_band>",
    "confidence": <0.0-1.0>
  },
  "statement": {
    "level": "<statement_level>",
    "confidence": <0.0-1.0>
  },
  "season": {
    "heaviness": "<season_heaviness>",
    "confidence": <0.0-1.0>
  },
  "palette": {
    "colors": ["<color1>", "<color2>"],
    "confidence": <0.0-1.0>
  },
  "pattern": {
    "level": "<pattern_level>",
    "confidence": <0.0-1.0>
  },
  "material": {
    "family": "<material_family>",
    "confidence": <0.0-1.0>
  }
}

AESTHETIC ARCHETYPES: minimalist, classic, workwear, romantic, boho, western, street, sporty, edgy, glam, preppy, outdoor_utility
FORMALITY BANDS: athleisure, casual, smart_casual, office, formal, evening
STATEMENT LEVEL: low, medium, high
SEASON HEAVINESS: light, mid, heavy
PALETTE COLORS: black, white, cream, gray, brown, tan, beige, navy, denim_blue, blue, red, pink, green, olive, yellow, orange, purple, metallic, multicolor
PATTERN LEVEL: solid, subtle, bold
MATERIAL FAMILY: denim, knit, leather, silk_satin, cotton, wool, synthetic_tech, other

Use "unknown" and 0.0 confidence if uncertain. Respond with ONLY JSON.`;

interface StyleSignalsV1 {
  version: 1;
  aesthetic: { primary: string; primary_confidence: number; secondary: string; secondary_confidence: number };
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
  signals: StyleSignalsV1;
  approved: boolean;
  notes?: string;
}

interface GoldenSetBaseline {
  version: number;
  entries: GoldenSetEntry[];
}

interface ComparisonResult {
  filename: string;
  baseline: StyleSignalsV1;
  claude: StyleSignalsV1 | null;
  error?: string;
  latencyMs: number;
  matches: {
    aesthetic: boolean;
    formality: boolean;
    statement: boolean;
    season: boolean;
    pattern: boolean;
    material: boolean;
  };
  matchCount: number;
}

async function analyzeWithClaude(imageUrl: string): Promise<{ result: StyleSignalsV1 | null; error?: string; latencyMs: number }> {
  const startTime = Date.now();
  
  try {
    // Fetch image and convert to base64
    const imageResponse = await fetch(imageUrl);
    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const contentType = imageResponse.headers.get('content-type') || 'image/webp';
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: contentType, data: base64Data } },
            { type: 'text', text: STYLE_SIGNALS_PROMPT }
          ]
        }]
      }),
    });

    const latencyMs = Date.now() - startTime;
    const data = await response.json();
    
    if (!response.ok) {
      return { result: null, error: JSON.stringify(data.error || data).slice(0, 100), latencyMs };
    }

    let responseText = data.content?.[0]?.text ?? '';
    if (responseText.startsWith('```json')) responseText = responseText.slice(7);
    if (responseText.startsWith('```')) responseText = responseText.slice(3);
    if (responseText.endsWith('```')) responseText = responseText.slice(0, -3);
    
    const result = JSON.parse(responseText.trim()) as StyleSignalsV1;
    return { result, latencyMs };
  } catch (error) {
    return { result: null, error: String(error).slice(0, 100), latencyMs: Date.now() - startTime };
  }
}

function compareSignals(baseline: StyleSignalsV1, claude: StyleSignalsV1): ComparisonResult['matches'] {
  return {
    aesthetic: baseline.aesthetic.primary === claude.aesthetic.primary,
    formality: baseline.formality.band === claude.formality.band,
    statement: baseline.statement.level === claude.statement.level,
    season: baseline.season.heaviness === claude.season.heaviness,
    pattern: baseline.pattern.level === claude.pattern.level,
    material: baseline.material.family === claude.material.family,
  };
}

async function main(): Promise<void> {
  console.log('\n🔬 Golden Set Claude Sonnet 4.5 Comparison');
  console.log('='.repeat(60));
  
  // Load baseline
  const baselinePath = path.join(__dirname, '..', 'test-assets', 'golden-set-baseline.json');
  const baseline: GoldenSetBaseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  
  console.log(`\n📦 Loaded ${baseline.entries.length} golden set images`);
  console.log('⏳ Running Claude Sonnet 4.5 on all images...\n');
  
  const results: ComparisonResult[] = [];
  let totalLatency = 0;
  let successCount = 0;
  
  // Process images (Claude has higher rate limits)
  for (let i = 0; i < baseline.entries.length; i++) {
    const entry = baseline.entries[i];
    const shortName = entry.filename.split('/').pop() || entry.filename;
    
    process.stdout.write(`[${i + 1}/${baseline.entries.length}] ${shortName.padEnd(40)}`);
    
    const { result, error, latencyMs } = await analyzeWithClaude(entry.imageUrl);
    totalLatency += latencyMs;
    
    if (result) {
      successCount++;
      const matches = compareSignals(entry.signals, result);
      const matchCount = Object.values(matches).filter(Boolean).length;
      results.push({ filename: shortName, baseline: entry.signals, claude: result, latencyMs, matches, matchCount });
      console.log(`✅ ${latencyMs}ms (${matchCount}/6 match)`);
    } else {
      results.push({ filename: shortName, baseline: entry.signals, claude: null, error, latencyMs, matches: { aesthetic: false, formality: false, statement: false, season: false, pattern: false, material: false }, matchCount: 0 });
      console.log(`❌ ${error}`);
    }
    
    // Small delay between requests
    if (i < baseline.entries.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  
  // Generate report
  console.log('\n' + '='.repeat(80));
  console.log('📊 GOLDEN SET COMPARISON REPORT - Claude Sonnet 4.5');
  console.log('='.repeat(80));
  
  const successfulResults = results.filter(r => r.claude);
  
  // Field-level accuracy
  const fieldAccuracy = {
    aesthetic: successfulResults.filter(r => r.matches.aesthetic).length,
    formality: successfulResults.filter(r => r.matches.formality).length,
    statement: successfulResults.filter(r => r.matches.statement).length,
    season: successfulResults.filter(r => r.matches.season).length,
    pattern: successfulResults.filter(r => r.matches.pattern).length,
    material: successfulResults.filter(r => r.matches.material).length,
  };
  
  const total = successfulResults.length;
  
  console.log('\n🎯 FIELD-LEVEL ACCURACY (Claude vs GPT-4o Baseline):');
  console.log('─'.repeat(60));
  console.log(`│ aesthetic.primary  │ ${fieldAccuracy.aesthetic}/${total} (${Math.round(fieldAccuracy.aesthetic/total*100)}%) │ ${fieldAccuracy.aesthetic/total >= 0.8 ? '✅ PASS' : '⚠️ REVIEW'} │`);
  console.log(`│ formality.band     │ ${fieldAccuracy.formality}/${total} (${Math.round(fieldAccuracy.formality/total*100)}%) │ ${fieldAccuracy.formality/total >= 0.8 ? '✅ PASS' : '⚠️ REVIEW'} │`);
  console.log(`│ statement.level    │ ${fieldAccuracy.statement}/${total} (${Math.round(fieldAccuracy.statement/total*100)}%) │ ${fieldAccuracy.statement/total >= 0.8 ? '✅ PASS' : '⚠️ REVIEW'} │`);
  console.log(`│ season.heaviness   │ ${fieldAccuracy.season}/${total} (${Math.round(fieldAccuracy.season/total*100)}%) │ ${fieldAccuracy.season/total >= 0.8 ? '✅ PASS' : '⚠️ REVIEW'} │`);
  console.log(`│ pattern.level      │ ${fieldAccuracy.pattern}/${total} (${Math.round(fieldAccuracy.pattern/total*100)}%) │ ${fieldAccuracy.pattern/total >= 0.8 ? '✅ PASS' : '⚠️ REVIEW'} │`);
  console.log(`│ material.family    │ ${fieldAccuracy.material}/${total} (${Math.round(fieldAccuracy.material/total*100)}%) │ ${fieldAccuracy.material/total >= 0.8 ? '✅ PASS' : '⚠️ REVIEW'} │`);
  console.log('─'.repeat(60));
  
  // Critical TF fields (aesthetic + formality)
  const criticalMatch = successfulResults.filter(r => r.matches.aesthetic && r.matches.formality).length;
  console.log(`\n🔥 CRITICAL TF FIELDS (aesthetic + formality): ${criticalMatch}/${total} (${Math.round(criticalMatch/total*100)}%)`);
  
  // Overall stats
  const avgMatchCount = successfulResults.reduce((sum, r) => sum + r.matchCount, 0) / total;
  const avgLatency = totalLatency / results.length;
  
  console.log('\n📈 SUMMARY:');
  console.log(`   Total images: ${baseline.entries.length}`);
  console.log(`   Successful: ${successCount}/${baseline.entries.length}`);
  console.log(`   Avg match rate: ${(avgMatchCount/6*100).toFixed(1)}% (${avgMatchCount.toFixed(1)}/6 fields)`);
  console.log(`   Avg latency: ${avgLatency.toFixed(0)}ms`);
  
  // Perfect matches
  const perfectMatches = successfulResults.filter(r => r.matchCount === 6);
  console.log(`   Perfect matches (6/6): ${perfectMatches.length}/${total} (${Math.round(perfectMatches.length/total*100)}%)`);
  
  // Worst performers
  const worstPerformers = successfulResults.filter(r => r.matchCount <= 3).sort((a, b) => a.matchCount - b.matchCount);
  if (worstPerformers.length > 0) {
    console.log('\n⚠️  ITEMS WITH LOW MATCH (≤3/6):');
    for (const w of worstPerformers.slice(0, 10)) {
      const diffs = [];
      if (!w.matches.aesthetic) diffs.push(`aes:${w.baseline.aesthetic.primary}→${w.claude?.aesthetic.primary}`);
      if (!w.matches.formality) diffs.push(`form:${w.baseline.formality.band}→${w.claude?.formality.band}`);
      console.log(`   ${w.filename}: ${w.matchCount}/6 [${diffs.join(', ')}]`);
    }
  }
  
  // Cost calculation
  const avgInputTokens = 1500; // Approximate for image + prompt
  const avgOutputTokens = 400; // Approximate for JSON response
  const costPerCall = (avgInputTokens * 3.00 / 1_000_000) + (avgOutputTokens * 15.00 / 1_000_000);
  
  console.log('\n💰 COST ESTIMATE:');
  console.log(`   Per call: $${costPerCall.toFixed(6)}`);
  console.log(`   Per 1000 calls: $${(costPerCall * 1000).toFixed(2)}`);
  
  // Final verdict
  console.log('\n' + '='.repeat(80));
  const criticalPct = criticalMatch / total;
  if (criticalPct >= 0.85) {
    console.log('✅ VERDICT: Claude Sonnet 4.5 is SUITABLE for style-signals');
    console.log('   Critical TF fields (aesthetic + formality) match ≥85%');
  } else if (criticalPct >= 0.70) {
    console.log('⚠️  VERDICT: Claude Sonnet 4.5 may need prompt tuning');
    console.log('   Critical TF fields match 70-85%, some edge cases may differ');
  } else {
    console.log('❌ VERDICT: Claude Sonnet 4.5 NOT recommended for style-signals');
    console.log('   Critical TF fields match <70%, significant quality gap');
  }
  console.log('='.repeat(80));
  
  // Save results
  const outputPath = path.join(__dirname, '..', 'test-assets', 'golden-set', 'runs', `claude-comparison-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({ 
    generatedAt: new Date().toISOString(),
    model: 'claude-sonnet-4-5-20250929',
    summary: { total, successCount, avgMatchRate: avgMatchCount/6, avgLatencyMs: avgLatency, criticalMatchRate: criticalPct, costPerCall },
    fieldAccuracy,
    results: results.map(r => ({ filename: r.filename, matchCount: r.matchCount, matches: r.matches, latencyMs: r.latencyMs, error: r.error }))
  }, null, 2));
  console.log(`\n💾 Results saved to: ${outputPath}`);
}

main().catch(console.error);
