/**
 * Golden Set GPT-4o Comparison Script
 * 
 * Runs GPT-4o on all golden set images to get fresh latency data
 * and compare against the approved baseline.
 * 
 * Run with: npx tsx scripts/golden-set-gpt4o-comparison.ts
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found');
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
  gpt4o: StyleSignalsV1 | null;
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

async function analyzeWithGPT4o(imageUrl: string): Promise<{ result: StyleSignalsV1 | null; error?: string; latencyMs: number }> {
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
            { type: 'text', text: STYLE_SIGNALS_PROMPT }
          ]
        }],
        max_tokens: 800,
        temperature: 0.1,
      }),
    });

    const latencyMs = Date.now() - startTime;
    const data = await response.json();
    
    if (!response.ok) {
      return { result: null, error: JSON.stringify(data.error || data).slice(0, 100), latencyMs };
    }

    let responseText = data.choices?.[0]?.message?.content ?? '';
    if (responseText.startsWith('```json')) responseText = responseText.slice(7);
    if (responseText.startsWith('```')) responseText = responseText.slice(3);
    if (responseText.endsWith('```')) responseText = responseText.slice(0, -3);
    
    const result = JSON.parse(responseText.trim()) as StyleSignalsV1;
    return { result, latencyMs };
  } catch (error) {
    return { result: null, error: String(error).slice(0, 100), latencyMs: Date.now() - startTime };
  }
}

function compareSignals(baseline: StyleSignalsV1, gpt4o: StyleSignalsV1): ComparisonResult['matches'] {
  return {
    aesthetic: baseline.aesthetic.primary === gpt4o.aesthetic.primary,
    formality: baseline.formality.band === gpt4o.formality.band,
    statement: baseline.statement.level === gpt4o.statement.level,
    season: baseline.season.heaviness === gpt4o.season.heaviness,
    pattern: baseline.pattern.level === gpt4o.pattern.level,
    material: baseline.material.family === gpt4o.material.family,
  };
}

async function main(): Promise<void> {
  console.log('\n🔬 Golden Set GPT-4o Fresh Run');
  console.log('='.repeat(60));
  
  // Load baseline
  const baselinePath = path.join(__dirname, '..', 'test-assets', 'golden-set-baseline.json');
  const baseline: GoldenSetBaseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  
  console.log(`\n📦 Loaded ${baseline.entries.length} golden set images`);
  console.log('⏳ Running GPT-4o on all images...\n');
  
  const results: ComparisonResult[] = [];
  let totalLatency = 0;
  let successCount = 0;
  
  for (let i = 0; i < baseline.entries.length; i++) {
    const entry = baseline.entries[i];
    const shortName = entry.filename.split('/').pop() || entry.filename;
    
    process.stdout.write(`[${i + 1}/${baseline.entries.length}] ${shortName.padEnd(40)}`);
    
    const { result, error, latencyMs } = await analyzeWithGPT4o(entry.imageUrl);
    totalLatency += latencyMs;
    
    if (result) {
      successCount++;
      const matches = compareSignals(entry.signals, result);
      const matchCount = Object.values(matches).filter(Boolean).length;
      results.push({ filename: shortName, baseline: entry.signals, gpt4o: result, latencyMs, matches, matchCount });
      console.log(`✅ ${latencyMs}ms (${matchCount}/6 match)`);
    } else {
      results.push({ filename: shortName, baseline: entry.signals, gpt4o: null, error, latencyMs, matches: { aesthetic: false, formality: false, statement: false, season: false, pattern: false, material: false }, matchCount: 0 });
      console.log(`❌ ${error}`);
    }
    
    // Small delay between requests
    if (i < baseline.entries.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  // Generate report
  console.log('\n' + '='.repeat(80));
  console.log('📊 GOLDEN SET REPORT - GPT-4o Fresh Run');
  console.log('='.repeat(80));
  
  const successfulResults = results.filter(r => r.gpt4o);
  
  // Field-level accuracy (vs baseline)
  const fieldAccuracy = {
    aesthetic: successfulResults.filter(r => r.matches.aesthetic).length,
    formality: successfulResults.filter(r => r.matches.formality).length,
    statement: successfulResults.filter(r => r.matches.statement).length,
    season: successfulResults.filter(r => r.matches.season).length,
    pattern: successfulResults.filter(r => r.matches.pattern).length,
    material: successfulResults.filter(r => r.matches.material).length,
  };
  
  const total = successfulResults.length;
  
  console.log('\n🎯 CONSISTENCY WITH BASELINE (same model, different runs):');
  console.log('─'.repeat(60));
  console.log(`│ aesthetic.primary  │ ${fieldAccuracy.aesthetic}/${total} (${Math.round(fieldAccuracy.aesthetic/total*100)}%) │`);
  console.log(`│ formality.band     │ ${fieldAccuracy.formality}/${total} (${Math.round(fieldAccuracy.formality/total*100)}%) │`);
  console.log(`│ statement.level    │ ${fieldAccuracy.statement}/${total} (${Math.round(fieldAccuracy.statement/total*100)}%) │`);
  console.log(`│ season.heaviness   │ ${fieldAccuracy.season}/${total} (${Math.round(fieldAccuracy.season/total*100)}%) │`);
  console.log(`│ pattern.level      │ ${fieldAccuracy.pattern}/${total} (${Math.round(fieldAccuracy.pattern/total*100)}%) │`);
  console.log(`│ material.family    │ ${fieldAccuracy.material}/${total} (${Math.round(fieldAccuracy.material/total*100)}%) │`);
  console.log('─'.repeat(60));
  
  // Overall stats
  const avgMatchCount = successfulResults.reduce((sum, r) => sum + r.matchCount, 0) / total;
  const avgLatency = totalLatency / results.length;
  
  console.log('\n📈 SUMMARY:');
  console.log(`   Total images: ${baseline.entries.length}`);
  console.log(`   Successful: ${successCount}/${baseline.entries.length}`);
  console.log(`   Consistency rate: ${(avgMatchCount/6*100).toFixed(1)}% (${avgMatchCount.toFixed(1)}/6 fields)`);
  console.log(`   Avg latency: ${avgLatency.toFixed(0)}ms`);
  
  // Perfect matches
  const perfectMatches = successfulResults.filter(r => r.matchCount === 6);
  console.log(`   Perfect matches (6/6): ${perfectMatches.length}/${total} (${Math.round(perfectMatches.length/total*100)}%)`);
  
  // Latency stats
  const latencies = successfulResults.map(r => r.latencyMs).sort((a, b) => a - b);
  console.log(`\n⏱️  LATENCY STATS:`);
  console.log(`   Min: ${latencies[0]}ms`);
  console.log(`   Max: ${latencies[latencies.length - 1]}ms`);
  console.log(`   Median: ${latencies[Math.floor(latencies.length / 2)]}ms`);
  console.log(`   Average: ${avgLatency.toFixed(0)}ms`);
  
  // Items that changed from baseline
  const changedItems = successfulResults.filter(r => r.matchCount < 6);
  if (changedItems.length > 0) {
    console.log('\n⚠️  ITEMS THAT DIFFER FROM BASELINE:');
    for (const item of changedItems) {
      const diffs = [];
      if (!item.matches.aesthetic) diffs.push(`aes:${item.baseline.aesthetic.primary}→${item.gpt4o?.aesthetic.primary}`);
      if (!item.matches.formality) diffs.push(`form:${item.baseline.formality.band}→${item.gpt4o?.formality.band}`);
      if (!item.matches.statement) diffs.push(`stmt:${item.baseline.statement.level}→${item.gpt4o?.statement.level}`);
      if (!item.matches.season) diffs.push(`season:${item.baseline.season.heaviness}→${item.gpt4o?.season.heaviness}`);
      if (!item.matches.pattern) diffs.push(`pat:${item.baseline.pattern.level}→${item.gpt4o?.pattern.level}`);
      if (!item.matches.material) diffs.push(`mat:${item.baseline.material.family}→${item.gpt4o?.material.family}`);
      console.log(`   ${item.filename}: ${item.matchCount}/6 [${diffs.join(', ')}]`);
    }
  }
  
  // Cost calculation
  const avgInputTokens = 1000; // Image + prompt
  const avgOutputTokens = 400; // JSON response
  const costPerCall = (avgInputTokens * 2.50 / 1_000_000) + (avgOutputTokens * 10.00 / 1_000_000);
  
  console.log('\n💰 COST ESTIMATE:');
  console.log(`   Per call: $${costPerCall.toFixed(6)}`);
  console.log(`   Per 1000 calls: $${(costPerCall * 1000).toFixed(2)}`);
  
  console.log('\n' + '='.repeat(80));
  
  // Save results
  const outputPath = path.join(__dirname, '..', 'test-assets', 'golden-set', 'runs', `gpt4o-comparison-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({ 
    generatedAt: new Date().toISOString(),
    model: 'gpt-4o',
    summary: { total, successCount, avgConsistencyRate: avgMatchCount/6, avgLatencyMs: avgLatency, costPerCall },
    fieldAccuracy,
    results: results.map(r => ({ filename: r.filename, matchCount: r.matchCount, matches: r.matches, latencyMs: r.latencyMs, error: r.error }))
  }, null, 2));
  console.log(`\n💾 Results saved to: ${outputPath}`);
}

main().catch(console.error);
