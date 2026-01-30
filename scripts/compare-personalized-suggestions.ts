/**
 * Personalized Suggestions Model Comparison
 * 
 * Compares GPT-4o-mini (current) vs Claude for personalized-suggestions.
 * Tests output quality, format compliance, and latency.
 * 
 * Run with: npx tsx scripts/compare-personalized-suggestions.ts
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
  }
} catch (e) {}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

if (!OPENAI_API_KEY || !ANTHROPIC_API_KEY) {
  console.error('❌ Missing API keys');
  process.exit(1);
}

// Test cases representing different scenarios
const TEST_CASES = [
  {
    name: 'PAIRED: Casual tops + jeans',
    mode: 'paired',
    scan_category: 'tops',
    scan_signals: {
      version: 1,
      aesthetic: { primary: 'minimalist', primary_confidence: 0.9, secondary: 'none', secondary_confidence: 0 },
      formality: { band: 'casual', confidence: 0.9 },
      statement: { level: 'low', confidence: 0.85 },
      season: { heaviness: 'light', confidence: 0.9 },
      palette: { colors: ['white', 'cream'], confidence: 0.95 },
      pattern: { level: 'solid', confidence: 0.95 },
      material: { family: 'cotton', confidence: 0.9 }
    },
    top_matches: [
      { id: 'match-1', category: 'bottoms', dominant_color: 'denim_blue', aesthetic: 'minimalist', label: 'Dark skinny jeans' },
      { id: 'match-2', category: 'shoes', dominant_color: 'white', aesthetic: 'minimalist', label: 'White sneakers' }
    ],
    wardrobe_summary: { total: 25, by_category: { tops: 8, bottoms: 6, shoes: 5, outerwear: 3, accessories: 3 }, dominant_aesthetics: ['minimalist', 'classic'], updated_at: '2024-01-01' }
  },
  {
    name: 'PAIRED: Statement dress + heels',
    mode: 'paired',
    scan_category: 'dresses',
    scan_signals: {
      version: 1,
      aesthetic: { primary: 'glam', primary_confidence: 0.85, secondary: 'romantic', secondary_confidence: 0.6 },
      formality: { band: 'evening', confidence: 0.9 },
      statement: { level: 'high', confidence: 0.9 },
      season: { heaviness: 'light', confidence: 0.85 },
      palette: { colors: ['black', 'metallic'], confidence: 0.9 },
      pattern: { level: 'subtle', confidence: 0.8 },
      material: { family: 'silk_satin', confidence: 0.85 }
    },
    top_matches: [
      { id: 'match-3', category: 'shoes', dominant_color: 'black', aesthetic: 'glam', label: 'Stiletto heels' },
      { id: 'match-4', category: 'bags', dominant_color: 'metallic', aesthetic: 'glam', label: 'Metallic clutch' }
    ],
    wardrobe_summary: { total: 30, by_category: { tops: 10, bottoms: 8, dresses: 4, shoes: 4, bags: 2, accessories: 2 }, dominant_aesthetics: ['classic', 'glam'], updated_at: '2024-01-01' }
  },
  {
    name: 'SOLO: Leather jacket (no matches)',
    mode: 'solo',
    scan_category: 'outerwear',
    scan_signals: {
      version: 1,
      aesthetic: { primary: 'edgy', primary_confidence: 0.9, secondary: 'street', secondary_confidence: 0.5 },
      formality: { band: 'casual', confidence: 0.85 },
      statement: { level: 'high', confidence: 0.9 },
      season: { heaviness: 'mid', confidence: 0.8 },
      palette: { colors: ['black'], confidence: 0.95 },
      pattern: { level: 'solid', confidence: 0.95 },
      material: { family: 'leather', confidence: 0.95 }
    },
    top_matches: [],
    wardrobe_summary: { total: 5, by_category: { tops: 2, bottoms: 2, shoes: 1 }, dominant_aesthetics: ['sporty'], updated_at: '2024-01-01' }
  },
  {
    name: 'NEAR: Western boots with casual wardrobe',
    mode: 'near',
    scan_category: 'shoes',
    scan_signals: {
      version: 1,
      aesthetic: { primary: 'western', primary_confidence: 0.9, secondary: 'boho', secondary_confidence: 0.4 },
      formality: { band: 'casual', confidence: 0.8 },
      statement: { level: 'high', confidence: 0.9 },
      season: { heaviness: 'mid', confidence: 0.85 },
      palette: { colors: ['brown', 'tan'], confidence: 0.9 },
      pattern: { level: 'subtle', confidence: 0.8 },
      material: { family: 'leather', confidence: 0.95 }
    },
    top_matches: [],
    near_matches: [
      { id: 'near-1', category: 'bottoms', dominant_color: 'denim_blue', aesthetic: 'classic', label: 'Blue jeans', cap_reasons: ['aesthetic_gap'] },
      { id: 'near-2', category: 'tops', dominant_color: 'white', aesthetic: 'minimalist', label: 'White tee', cap_reasons: ['statement_mismatch'] }
    ],
    wardrobe_summary: { total: 20, by_category: { tops: 7, bottoms: 5, shoes: 4, outerwear: 2, accessories: 2 }, dominant_aesthetics: ['minimalist', 'classic'], updated_at: '2024-01-01' }
  }
];

// Build prompts (same as Edge Function)
function buildPairedPrompt(scanSignals: any, scanCategory: string, topMatches: any[], wardrobeSummary: any): string {
  const validIds = topMatches.map(m => m.id);
  const validIdsList = validIds.join(', ');
  const scanSummary = `aesthetic:${scanSignals.aesthetic?.primary ?? 'unknown'}; formality:${scanSignals.formality?.band ?? 'unknown'}; statement:${scanSignals.statement?.level ?? 'unknown'}; season:${scanSignals.season?.heaviness ?? 'unknown'}; pattern:${scanSignals.pattern?.level ?? 'unknown'}; colors:${scanSignals.palette?.colors?.join('/') ?? 'unknown'}`;
  const matchesSummary = topMatches.map(m => `${m.id}|${m.category}|${m.dominant_color}|${m.aesthetic}`).join(',');
  const wardrobeOverview = `total:${wardrobeSummary.total}; categories:${Object.entries(wardrobeSummary.by_category).map(([k, v]) => `${k}:${v}`).join(',')}; aesthetics:${wardrobeSummary.dominant_aesthetics?.join('/') ?? 'varied'}`;

  return `You are a personal stylist. Output ONLY JSON.

CONTEXT:
intent:own_item
scanned_item:category=${scanCategory}
scan:${scanSummary}
matches:${matchesSummary}
wardrobe:${wardrobeOverview}

OUTPUT FORMAT (strict JSON only):
{
  "why_it_works": [
    { "text": "why this wardrobe item pairs well with the scanned ${scanCategory}", "mentions": ["ITEM_ID"] },
    { "text": "why this wardrobe item pairs well with the scanned ${scanCategory}", "mentions": ["ITEM_ID"] }
  ],
  "to_elevate": [
    { "text": "why this would help complete the outfit with the ${scanCategory}", "recommend": { "type": "consider_adding", "category": "CATEGORY", "attributes": ["attr1", "attr2"] } },
    { "text": "why this would help complete the outfit with the ${scanCategory}", "recommend": { "type": "consider_adding", "category": "CATEGORY", "attributes": ["attr1", "attr2"] } }
  ]
}

STRICT RULES:
1. "mentions" array MUST ONLY contain IDs from: [${validIdsList}]
2. Keep "text" concise (aim for 60-80 characters, max 100)
3. "attributes" must be natural language
Respond with ONLY the JSON object.`;
}

function buildSoloPrompt(scanSignals: any, scannedCategory: string, wardrobeSummary: any): string {
  const scanSummary = `aesthetic:${scanSignals.aesthetic?.primary ?? 'unknown'}; formality:${scanSignals.formality?.band ?? 'unknown'}; statement:${scanSignals.statement?.level ?? 'unknown'}; season:${scanSignals.season?.heaviness ?? 'unknown'}; pattern:${scanSignals.pattern?.level ?? 'unknown'}; colors:${scanSignals.palette?.colors?.join('/') ?? 'unknown'}`;
  const wardrobeOverview = `total:${wardrobeSummary.total}; categories:${Object.entries(wardrobeSummary.by_category).map(([k, v]) => `${k}:${v}`).join(',')}; aesthetics:${wardrobeSummary.dominant_aesthetics?.join('/') ?? 'varied'}`;

  return `You are a personal stylist. Output ONLY JSON.

CONTEXT:
intent:own_item
scanned_item:category=${scannedCategory}
scan:${scanSummary}
wardrobe:${wardrobeOverview}
matches:[] (solo mode - no pairings)

OUTPUT FORMAT (strict JSON only):
{
  "why_it_works": [
    { "text": "specific styling tip for this ${scannedCategory}", "mentions": [] },
    { "text": "complementary styling approach for this item", "mentions": [] }
  ],
  "to_elevate": [
    { "text": "why this would help", "recommend": { "type": "consider_adding", "category": "CATEGORY", "attributes": ["attr1", "attr2"] } },
    { "text": "why this would help", "recommend": { "type": "consider_adding", "category": "CATEGORY", "attributes": ["attr1", "attr2"] } }
  ]
}

STRICT RULES:
1. "mentions" MUST be an empty array for all bullets
2. Keep "text" concise (60-80 chars, max 100)
Respond with ONLY the JSON object.`;
}

function buildNearPrompt(scanSignals: any, scanCategory: string, nearMatches: any[], wardrobeSummary: any): string {
  const topNearMatches = nearMatches.slice(0, 3);
  const validIds = topNearMatches.map(m => m.id);
  const validIdsList = validIds.join(', ');
  const scanSummary = `aesthetic:${scanSignals.aesthetic?.primary ?? 'unknown'}; formality:${scanSignals.formality?.band ?? 'unknown'}; statement:${scanSignals.statement?.level ?? 'unknown'}`;
  const matchesSummary = topNearMatches.map(m => {
    const capReasons = (m.cap_reasons ?? []).slice(0, 2).join('+') || 'style_gap';
    return `${m.id}|${m.category}|${m.dominant_color}|${m.aesthetic}|cap:${capReasons}`;
  }).join(',');
  const wardrobeOverview = `total:${wardrobeSummary.total}; aesthetics:${wardrobeSummary.dominant_aesthetics?.join('/') ?? 'varied'}`;

  return `You are a personal stylist. Output ONLY JSON.

CONTEXT:
intent:own_item
scanned_item:category=${scanCategory}
scan:${scanSummary}
near_matches:${matchesSummary}
wardrobe:${wardrobeOverview}
note: These items are CLOSE matches but not perfect. Focus on HOW to make them work with the scanned ${scanCategory}.

OUTPUT FORMAT (strict JSON only):
{
  "why_it_works": [
    { "text": "why this wardrobe item could pair with the scanned ${scanCategory}", "mentions": ["ITEM_ID"] },
    { "text": "why this wardrobe item could pair with the scanned ${scanCategory}", "mentions": ["ITEM_ID"] }
  ],
  "to_elevate": [
    { "text": "styling tip for wearing the ${scanCategory} with these items", "recommend": { "type": "styling_tip", "tip": "specific styling advice", "tags": ["tag1"] } },
    { "text": "styling tip for wearing the ${scanCategory} with these items", "recommend": { "type": "styling_tip", "tip": "specific styling advice", "tags": ["tag1"] } }
  ]
}

STRICT RULES:
1. "mentions" array MUST ONLY contain IDs from: [${validIdsList}]
2. "to_elevate" MUST use type: "styling_tip" (NOT "consider_adding")
3. Keep "text" concise (60-80 chars, max 100)
Respond with ONLY the JSON object.`;
}

async function callGPT4oMini(prompt: string): Promise<{ result: any; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });
    const latencyMs = Date.now() - start;
    const data = await response.json();
    if (!response.ok) return { result: null, latencyMs, error: JSON.stringify(data.error).slice(0, 100) };
    const text = data.choices?.[0]?.message?.content ?? '';
    return { result: JSON.parse(text), latencyMs };
  } catch (e) {
    return { result: null, latencyMs: Date.now() - start, error: String(e).slice(0, 100) };
  }
}

async function callClaudeHaiku(prompt: string): Promise<{ result: any; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const latencyMs = Date.now() - start;
    const data = await response.json();
    if (!response.ok) return { result: null, latencyMs, error: JSON.stringify(data.error).slice(0, 100) };
    let text = data.content?.[0]?.text ?? '';
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    return { result: JSON.parse(text.trim()), latencyMs };
  } catch (e) {
    return { result: null, latencyMs: Date.now() - start, error: String(e).slice(0, 100) };
  }
}

async function callClaudeSonnet(prompt: string): Promise<{ result: any; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const latencyMs = Date.now() - start;
    const data = await response.json();
    if (!response.ok) return { result: null, latencyMs, error: JSON.stringify(data.error).slice(0, 100) };
    let text = data.content?.[0]?.text ?? '';
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    return { result: JSON.parse(text.trim()), latencyMs };
  } catch (e) {
    return { result: null, latencyMs: Date.now() - start, error: String(e).slice(0, 100) };
  }
}

function validateOutput(result: any, mode: string, validIds: string[]): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (!result?.why_it_works || !Array.isArray(result.why_it_works)) {
    issues.push('Missing why_it_works array');
  } else {
    if (result.why_it_works.length !== 2) issues.push(`why_it_works has ${result.why_it_works.length} items (expected 2)`);
    for (const bullet of result.why_it_works) {
      if (!bullet.text) issues.push('why_it_works missing text');
      if (bullet.text && bullet.text.length > 100) issues.push(`why_it_works text too long: ${bullet.text.length} chars`);
      if (!Array.isArray(bullet.mentions)) issues.push('why_it_works missing mentions array');
      if (mode === 'solo' && bullet.mentions?.length > 0) issues.push('Solo mode should have empty mentions');
      if (mode !== 'solo' && bullet.mentions) {
        for (const id of bullet.mentions) {
          if (!validIds.includes(id)) issues.push(`Invalid mention ID: ${id}`);
        }
      }
    }
  }
  
  if (!result?.to_elevate || !Array.isArray(result.to_elevate)) {
    issues.push('Missing to_elevate array');
  } else {
    if (result.to_elevate.length !== 2) issues.push(`to_elevate has ${result.to_elevate.length} items (expected 2)`);
    for (const bullet of result.to_elevate) {
      if (!bullet.text) issues.push('to_elevate missing text');
      if (bullet.text && bullet.text.length > 100) issues.push(`to_elevate text too long: ${bullet.text.length} chars`);
      if (!bullet.recommend) issues.push('to_elevate missing recommend');
      if (mode === 'near' && bullet.recommend?.type !== 'styling_tip') {
        issues.push(`Near mode should use styling_tip, got ${bullet.recommend?.type}`);
      }
      if (mode !== 'near' && bullet.recommend?.type !== 'consider_adding') {
        issues.push(`${mode} mode should use consider_adding, got ${bullet.recommend?.type}`);
      }
    }
  }
  
  return { valid: issues.length === 0, issues };
}

async function main(): Promise<void> {
  console.log('\n🔬 Personalized Suggestions Comparison: GPT-4o-mini vs Claude');
  console.log('='.repeat(70));
  
  const results: any[] = [];
  
  for (const testCase of TEST_CASES) {
    console.log(`\n📋 ${testCase.name}`);
    console.log('─'.repeat(60));
    
    // Build prompt based on mode
    let prompt: string;
    let validIds: string[] = [];
    if (testCase.mode === 'solo') {
      prompt = buildSoloPrompt(testCase.scan_signals, testCase.scan_category, testCase.wardrobe_summary);
    } else if (testCase.mode === 'near') {
      validIds = (testCase.near_matches || []).map(m => m.id);
      prompt = buildNearPrompt(testCase.scan_signals, testCase.scan_category, testCase.near_matches || [], testCase.wardrobe_summary);
    } else {
      validIds = testCase.top_matches.map(m => m.id);
      prompt = buildPairedPrompt(testCase.scan_signals, testCase.scan_category, testCase.top_matches, testCase.wardrobe_summary);
    }
    
    // Run all three models in parallel
    const [gpt4oMini, claudeHaiku, claudeSonnet] = await Promise.all([
      callGPT4oMini(prompt),
      callClaudeHaiku(prompt),
      callClaudeSonnet(prompt)
    ]);
    
    // Validate outputs
    const gpt4oMiniValidation = gpt4oMini.result ? validateOutput(gpt4oMini.result, testCase.mode, validIds) : { valid: false, issues: ['No result'] };
    const claudeHaikuValidation = claudeHaiku.result ? validateOutput(claudeHaiku.result, testCase.mode, validIds) : { valid: false, issues: ['No result'] };
    const claudeSonnetValidation = claudeSonnet.result ? validateOutput(claudeSonnet.result, testCase.mode, validIds) : { valid: false, issues: ['No result'] };
    
    console.log(`\n   GPT-4o-mini: ${gpt4oMini.result ? '✅' : '❌'} ${gpt4oMini.latencyMs}ms ${gpt4oMiniValidation.valid ? '(valid)' : `(${gpt4oMiniValidation.issues.length} issues)`}`);
    if (gpt4oMini.result) {
      console.log(`      why_it_works[0]: "${gpt4oMini.result.why_it_works?.[0]?.text?.slice(0, 60)}..."`);
    }
    if (!gpt4oMiniValidation.valid) console.log(`      Issues: ${gpt4oMiniValidation.issues.join(', ')}`);
    
    console.log(`\n   Claude Haiku: ${claudeHaiku.result ? '✅' : '❌'} ${claudeHaiku.latencyMs}ms ${claudeHaikuValidation.valid ? '(valid)' : `(${claudeHaikuValidation.issues.length} issues)`}`);
    if (claudeHaiku.result) {
      console.log(`      why_it_works[0]: "${claudeHaiku.result.why_it_works?.[0]?.text?.slice(0, 60)}..."`);
    }
    if (!claudeHaikuValidation.valid) console.log(`      Issues: ${claudeHaikuValidation.issues.join(', ')}`);
    
    console.log(`\n   Claude Sonnet: ${claudeSonnet.result ? '✅' : '❌'} ${claudeSonnet.latencyMs}ms ${claudeSonnetValidation.valid ? '(valid)' : `(${claudeSonnetValidation.issues.length} issues)`}`);
    if (claudeSonnet.result) {
      console.log(`      why_it_works[0]: "${claudeSonnet.result.why_it_works?.[0]?.text?.slice(0, 60)}..."`);
    }
    if (!claudeSonnetValidation.valid) console.log(`      Issues: ${claudeSonnetValidation.issues.join(', ')}`);
    
    results.push({
      name: testCase.name,
      mode: testCase.mode,
      gpt4oMini: { latencyMs: gpt4oMini.latencyMs, valid: gpt4oMiniValidation.valid, issues: gpt4oMiniValidation.issues, error: gpt4oMini.error },
      claudeHaiku: { latencyMs: claudeHaiku.latencyMs, valid: claudeHaikuValidation.valid, issues: claudeHaikuValidation.issues, error: claudeHaiku.error },
      claudeSonnet: { latencyMs: claudeSonnet.latencyMs, valid: claudeSonnetValidation.valid, issues: claudeSonnetValidation.issues, error: claudeSonnet.error }
    });
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 PERSONALIZED SUGGESTIONS COMPARISON SUMMARY');
  console.log('='.repeat(80));
  
  const gpt4oMiniStats = { totalLatency: 0, validCount: 0, totalIssues: 0 };
  const claudeHaikuStats = { totalLatency: 0, validCount: 0, totalIssues: 0 };
  const claudeSonnetStats = { totalLatency: 0, validCount: 0, totalIssues: 0 };
  
  for (const r of results) {
    gpt4oMiniStats.totalLatency += r.gpt4oMini.latencyMs;
    gpt4oMiniStats.validCount += r.gpt4oMini.valid ? 1 : 0;
    gpt4oMiniStats.totalIssues += r.gpt4oMini.issues.length;
    
    claudeHaikuStats.totalLatency += r.claudeHaiku.latencyMs;
    claudeHaikuStats.validCount += r.claudeHaiku.valid ? 1 : 0;
    claudeHaikuStats.totalIssues += r.claudeHaiku.issues.length;
    
    claudeSonnetStats.totalLatency += r.claudeSonnet.latencyMs;
    claudeSonnetStats.validCount += r.claudeSonnet.valid ? 1 : 0;
    claudeSonnetStats.totalIssues += r.claudeSonnet.issues.length;
  }
  
  const total = results.length;
  
  console.log('\n⏱️  LATENCY:');
  console.log(`   GPT-4o-mini:   ${Math.round(gpt4oMiniStats.totalLatency / total)}ms avg`);
  console.log(`   Claude Haiku:  ${Math.round(claudeHaikuStats.totalLatency / total)}ms avg`);
  console.log(`   Claude Sonnet: ${Math.round(claudeSonnetStats.totalLatency / total)}ms avg`);
  
  console.log('\n✅ FORMAT COMPLIANCE:');
  console.log(`   GPT-4o-mini:   ${gpt4oMiniStats.validCount}/${total} valid (${gpt4oMiniStats.totalIssues} total issues)`);
  console.log(`   Claude Haiku:  ${claudeHaikuStats.validCount}/${total} valid (${claudeHaikuStats.totalIssues} total issues)`);
  console.log(`   Claude Sonnet: ${claudeSonnetStats.validCount}/${total} valid (${claudeSonnetStats.totalIssues} total issues)`);
  
  console.log('\n💰 COST (per 1000 calls):');
  console.log(`   GPT-4o-mini:   ~$0.15`);
  console.log(`   Claude Haiku:  ~$0.25`);
  console.log(`   Claude Sonnet: ~$3.00`);
  
  console.log('\n' + '='.repeat(80));
  
  // Save results
  const outputPath = path.join(__dirname, '..', 'test-assets', 'golden-set', 'runs', `personalized-suggestions-comparison-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\n💾 Results saved to: ${outputPath}`);
}

main().catch(console.error);
