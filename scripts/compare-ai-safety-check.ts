/**
 * AI Safety Check Model Comparison
 * 
 * Compares GPT-4o (current) vs Claude for ai-safety-check verdicts.
 * Tests output quality, format compliance, verdict accuracy, and latency.
 * 
 * Run with: npx tsx scripts/compare-ai-safety-check.ts
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

// AI Safety Prompt (from Edge Function)
const AI_SAFETY_PROMPT = `You are a wardrobe pairing validator. Given a SCAN item (what the user photographed) and MATCH candidates from their wardrobe, decide if each pairing makes visual/style sense.

For each pair, output:
- action: "keep" | "demote" | "hide"
- reason_code: one of ai_keep, ai_sanity_veto, ai_sanity_demote
- confidence: 0.0-1.0
- reason: 1 short sentence

Rules:
- "hide" (ai_sanity_veto): obvious clash that would embarrass the user (e.g., formal dress shoes + gym shorts)
- "demote" (ai_sanity_demote): questionable but possible outfit (e.g., statement boots + athleisure hoodie)
- "keep" (ai_keep): reasonable pairing, even if not obvious

Be CONSERVATIVE: only hide/demote if the clash is clear. When in doubt, keep.

Examples:
- western boots (statement high, casual) + black joggers (athleisure, sporty) → hide, ai_sanity_veto, 0.95, "Cowboy boots clash with athletic joggers."
- western boots (statement high, casual) + dark straight jeans (casual, classic) → keep, ai_keep, 0.9, "Both casual; classic denim anchors statement boots."
- silk blouse (office, romantic) + cargo shorts (casual, workwear) → hide, ai_sanity_veto, 0.9, "Dressy top inappropriate with casual cargo shorts."
- minimal white sneakers (casual, minimalist) + navy chinos (smart_casual, classic) → keep, ai_keep, 0.95, "Clean pairing; sneakers work with smart casual."

Respond ONLY with valid JSON array, no markdown:
[{"itemId":"<id>","action":"keep|demote|hide","reason_code":"ai_keep|ai_sanity_veto|ai_sanity_demote","confidence":<0-1>,"reason":"<short explanation>"}]`;

// Test cases with expected verdicts
const TEST_CASES = [
  {
    name: 'OBVIOUS CLASH: Stilettos + Gym Shorts',
    expectedVerdict: 'hide',
    scan: {
      signals: {
        aesthetic: { primary: 'glam', primary_confidence: 0.9 },
        formality: { band: 'evening', confidence: 0.9 },
        statement: { level: 'high', confidence: 0.9 },
        season: { heaviness: 'light', confidence: 0.8 },
        material: { family: 'leather', confidence: 0.9 }
      }
    },
    pairs: [
      {
        itemId: 'gym-shorts-1',
        pairType: 'shoes+bottoms',
        trust_filter_distance: 'far',
        match_signals: {
          aesthetic: { primary: 'sporty', primary_confidence: 0.95 },
          formality: { band: 'athleisure', confidence: 0.95 },
          statement: { level: 'low', confidence: 0.9 },
          season: { heaviness: 'light', confidence: 0.9 },
          material: { family: 'synthetic_tech', confidence: 0.9 }
        }
      }
    ]
  },
  {
    name: 'GOOD PAIRING: White Sneakers + Jeans',
    expectedVerdict: 'keep',
    scan: {
      signals: {
        aesthetic: { primary: 'minimalist', primary_confidence: 0.9 },
        formality: { band: 'casual', confidence: 0.9 },
        statement: { level: 'low', confidence: 0.9 },
        season: { heaviness: 'mid', confidence: 0.8 },
        material: { family: 'leather', confidence: 0.85 }
      }
    },
    pairs: [
      {
        itemId: 'dark-jeans-1',
        pairType: 'shoes+bottoms',
        trust_filter_distance: 'close',
        match_signals: {
          aesthetic: { primary: 'minimalist', primary_confidence: 0.85 },
          formality: { band: 'casual', confidence: 0.9 },
          statement: { level: 'low', confidence: 0.85 },
          season: { heaviness: 'mid', confidence: 0.85 },
          material: { family: 'denim', confidence: 0.95 }
        }
      }
    ]
  },
  {
    name: 'QUESTIONABLE: Western Boots + Athleisure Hoodie',
    expectedVerdict: 'demote',
    scan: {
      signals: {
        aesthetic: { primary: 'western', primary_confidence: 0.9 },
        formality: { band: 'casual', confidence: 0.8 },
        statement: { level: 'high', confidence: 0.9 },
        season: { heaviness: 'mid', confidence: 0.85 },
        material: { family: 'leather', confidence: 0.95 }
      }
    },
    pairs: [
      {
        itemId: 'athleisure-hoodie-1',
        pairType: 'shoes+tops',
        trust_filter_distance: 'medium',
        match_signals: {
          aesthetic: { primary: 'sporty', primary_confidence: 0.9 },
          formality: { band: 'athleisure', confidence: 0.95 },
          statement: { level: 'low', confidence: 0.85 },
          season: { heaviness: 'mid', confidence: 0.8 },
          material: { family: 'cotton', confidence: 0.9 }
        }
      }
    ]
  },
  {
    name: 'CLASH: Sequin Top + Cargo Pants',
    expectedVerdict: 'hide',
    scan: {
      signals: {
        aesthetic: { primary: 'glam', primary_confidence: 0.9 },
        formality: { band: 'evening', confidence: 0.85 },
        statement: { level: 'high', confidence: 0.95 },
        season: { heaviness: 'light', confidence: 0.8 },
        material: { family: 'synthetic_tech', confidence: 0.8 }
      }
    },
    pairs: [
      {
        itemId: 'cargo-pants-1',
        pairType: 'tops+bottoms',
        trust_filter_distance: 'far',
        match_signals: {
          aesthetic: { primary: 'workwear', primary_confidence: 0.9 },
          formality: { band: 'casual', confidence: 0.9 },
          statement: { level: 'medium', confidence: 0.8 },
          season: { heaviness: 'mid', confidence: 0.85 },
          material: { family: 'cotton', confidence: 0.9 }
        }
      }
    ]
  },
  {
    name: 'GOOD: Navy Blazer + Chinos',
    expectedVerdict: 'keep',
    scan: {
      signals: {
        aesthetic: { primary: 'classic', primary_confidence: 0.9 },
        formality: { band: 'smart_casual', confidence: 0.9 },
        statement: { level: 'low', confidence: 0.85 },
        season: { heaviness: 'mid', confidence: 0.85 },
        material: { family: 'wool', confidence: 0.8 }
      }
    },
    pairs: [
      {
        itemId: 'tan-chinos-1',
        pairType: 'outerwear+bottoms',
        trust_filter_distance: 'close',
        match_signals: {
          aesthetic: { primary: 'classic', primary_confidence: 0.85 },
          formality: { band: 'smart_casual', confidence: 0.9 },
          statement: { level: 'low', confidence: 0.9 },
          season: { heaviness: 'mid', confidence: 0.85 },
          material: { family: 'cotton', confidence: 0.9 }
        }
      }
    ]
  },
  {
    name: 'MULTIPLE PAIRS: Leather Jacket + Various',
    expectedVerdict: 'mixed',
    scan: {
      signals: {
        aesthetic: { primary: 'edgy', primary_confidence: 0.9 },
        formality: { band: 'casual', confidence: 0.85 },
        statement: { level: 'high', confidence: 0.9 },
        season: { heaviness: 'mid', confidence: 0.85 },
        material: { family: 'leather', confidence: 0.95 }
      }
    },
    pairs: [
      {
        itemId: 'black-jeans-1',
        pairType: 'outerwear+bottoms',
        trust_filter_distance: 'close',
        match_signals: {
          aesthetic: { primary: 'edgy', primary_confidence: 0.85 },
          formality: { band: 'casual', confidence: 0.9 },
          statement: { level: 'medium', confidence: 0.8 },
          season: { heaviness: 'mid', confidence: 0.85 },
          material: { family: 'denim', confidence: 0.95 }
        }
      },
      {
        itemId: 'pink-tutu-1',
        pairType: 'outerwear+skirts',
        trust_filter_distance: 'far',
        match_signals: {
          aesthetic: { primary: 'romantic', primary_confidence: 0.9 },
          formality: { band: 'evening', confidence: 0.8 },
          statement: { level: 'high', confidence: 0.95 },
          season: { heaviness: 'light', confidence: 0.9 },
          material: { family: 'other', confidence: 0.8 }
        }
      }
    ]
  }
];

function formatSignalsForPrompt(signals: any): string {
  return `aesthetic=${signals.aesthetic.primary}(${signals.aesthetic.primary_confidence.toFixed(2)}), ` +
    `formality=${signals.formality.band}, statement=${signals.statement.level}, ` +
    `season=${signals.season.heaviness}, material=${signals.material.family}`;
}

function buildPromptContent(scanSignals: any, pairs: any[]): string {
  const scanDesc = formatSignalsForPrompt(scanSignals);
  const pairsDesc = pairs.map((p, i) => {
    const matchDesc = formatSignalsForPrompt(p.match_signals);
    return `${i + 1}. itemId="${p.itemId}", pairType=${p.pairType}, distance=${p.trust_filter_distance}\n   Match: ${matchDesc}`;
  }).join("\n");
  return `SCAN ITEM:\n${scanDesc}\n\nMATCH CANDIDATES:\n${pairsDesc}\n\nEvaluate each pair and respond with JSON array.`;
}

async function callGPT4o(systemPrompt: string, content: string): Promise<{ result: any; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content }
        ],
        max_tokens: 500,
        temperature: 0
      })
    });
    const latencyMs = Date.now() - start;
    const data = await response.json();
    if (!response.ok) return { result: null, latencyMs, error: JSON.stringify(data.error).slice(0, 100) };
    let text = data.choices?.[0]?.message?.content ?? '';
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    return { result: JSON.parse(text.trim()), latencyMs };
  } catch (e) {
    return { result: null, latencyMs: Date.now() - start, error: String(e).slice(0, 100) };
  }
}

async function callClaudeSonnet(systemPrompt: string, content: string): Promise<{ result: any; latencyMs: number; error?: string }> {
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
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content }]
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

function validateVerdict(result: any, expectedItemIds: string[]): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (!Array.isArray(result)) {
    issues.push('Result is not an array');
    return { valid: false, issues };
  }
  
  const resultIds = result.map((r: any) => r.itemId);
  for (const expectedId of expectedItemIds) {
    if (!resultIds.includes(expectedId)) {
      issues.push(`Missing verdict for ${expectedId}`);
    }
  }
  
  for (const verdict of result) {
    if (!verdict.itemId) issues.push('Missing itemId');
    if (!['keep', 'demote', 'hide'].includes(verdict.action)) issues.push(`Invalid action: ${verdict.action}`);
    if (!['ai_keep', 'ai_sanity_veto', 'ai_sanity_demote'].includes(verdict.reason_code)) {
      issues.push(`Invalid reason_code: ${verdict.reason_code}`);
    }
    if (typeof verdict.confidence !== 'number' || verdict.confidence < 0 || verdict.confidence > 1) {
      issues.push(`Invalid confidence: ${verdict.confidence}`);
    }
    if (!verdict.reason || typeof verdict.reason !== 'string') {
      issues.push('Missing or invalid reason');
    }
  }
  
  return { valid: issues.length === 0, issues };
}

async function main(): Promise<void> {
  console.log('\n🔬 AI Safety Check Comparison: GPT-4o vs Claude Sonnet 4.5');
  console.log('='.repeat(70));
  
  const results: any[] = [];
  
  for (const testCase of TEST_CASES) {
    console.log(`\n📋 ${testCase.name}`);
    console.log(`   Expected: ${testCase.expectedVerdict}`);
    console.log('─'.repeat(60));
    
    const content = buildPromptContent(testCase.scan.signals, testCase.pairs);
    const expectedItemIds = testCase.pairs.map(p => p.itemId);
    
    // Run both models
    const [gpt4o, claudeSonnet] = await Promise.all([
      callGPT4o(AI_SAFETY_PROMPT, content),
      callClaudeSonnet(AI_SAFETY_PROMPT, content)
    ]);
    
    const gpt4oValidation = gpt4o.result ? validateVerdict(gpt4o.result, expectedItemIds) : { valid: false, issues: ['No result'] };
    const claudeValidation = claudeSonnet.result ? validateVerdict(claudeSonnet.result, expectedItemIds) : { valid: false, issues: ['No result'] };
    
    // Get verdicts
    const gpt4oVerdicts = Array.isArray(gpt4o.result) ? gpt4o.result : [];
    const claudeVerdicts = Array.isArray(claudeSonnet.result) ? claudeSonnet.result : [];
    
    console.log(`\n   GPT-4o: ${gpt4o.result ? '✅' : '❌'} ${gpt4o.latencyMs}ms`);
    for (const v of gpt4oVerdicts) {
      const icon = v.action === 'keep' ? '✓' : v.action === 'demote' ? '↓' : '✗';
      console.log(`      ${icon} ${v.itemId}: ${v.action} (${v.confidence.toFixed(2)}) - "${v.reason}"`);
    }
    if (!gpt4oValidation.valid) console.log(`      Issues: ${gpt4oValidation.issues.join(', ')}`);
    
    console.log(`\n   Claude Sonnet: ${claudeSonnet.result ? '✅' : '❌'} ${claudeSonnet.latencyMs}ms`);
    for (const v of claudeVerdicts) {
      const icon = v.action === 'keep' ? '✓' : v.action === 'demote' ? '↓' : '✗';
      console.log(`      ${icon} ${v.itemId}: ${v.action} (${v.confidence.toFixed(2)}) - "${v.reason}"`);
    }
    if (!claudeValidation.valid) console.log(`      Issues: ${claudeValidation.issues.join(', ')}`);
    
    // Compare verdicts
    const verdictMatch = gpt4oVerdicts.length === claudeVerdicts.length &&
      gpt4oVerdicts.every((gv: any) => {
        const cv = claudeVerdicts.find((c: any) => c.itemId === gv.itemId);
        return cv && cv.action === gv.action;
      });
    
    console.log(`\n   Verdict Agreement: ${verdictMatch ? '✅ Same' : '⚠️ Different'}`);
    
    results.push({
      name: testCase.name,
      expected: testCase.expectedVerdict,
      gpt4o: { latencyMs: gpt4o.latencyMs, valid: gpt4oValidation.valid, verdicts: gpt4oVerdicts, error: gpt4o.error },
      claudeSonnet: { latencyMs: claudeSonnet.latencyMs, valid: claudeValidation.valid, verdicts: claudeVerdicts, error: claudeSonnet.error },
      verdictMatch
    });
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 AI SAFETY CHECK COMPARISON SUMMARY');
  console.log('='.repeat(80));
  
  const total = results.length;
  const gpt4oValid = results.filter(r => r.gpt4o.valid).length;
  const claudeValid = results.filter(r => r.claudeSonnet.valid).length;
  const verdictMatches = results.filter(r => r.verdictMatch).length;
  
  const gpt4oAvgLatency = results.reduce((sum, r) => sum + r.gpt4o.latencyMs, 0) / total;
  const claudeAvgLatency = results.reduce((sum, r) => sum + r.claudeSonnet.latencyMs, 0) / total;
  
  console.log('\n⏱️  LATENCY:');
  console.log(`   GPT-4o:        ${Math.round(gpt4oAvgLatency)}ms avg`);
  console.log(`   Claude Sonnet: ${Math.round(claudeAvgLatency)}ms avg`);
  
  console.log('\n✅ FORMAT COMPLIANCE:');
  console.log(`   GPT-4o:        ${gpt4oValid}/${total} valid`);
  console.log(`   Claude Sonnet: ${claudeValid}/${total} valid`);
  
  console.log('\n🎯 VERDICT AGREEMENT:');
  console.log(`   Same verdicts: ${verdictMatches}/${total} (${Math.round(verdictMatches/total*100)}%)`);
  
  // Check expected verdicts
  let gpt4oMatchesExpected = 0;
  let claudeMatchesExpected = 0;
  for (const r of results) {
    if (r.expected !== 'mixed') {
      const gpt4oAction = r.gpt4o.verdicts?.[0]?.action;
      const claudeAction = r.claudeSonnet.verdicts?.[0]?.action;
      if (gpt4oAction === r.expected) gpt4oMatchesExpected++;
      if (claudeAction === r.expected) claudeMatchesExpected++;
    }
  }
  const singleVerdictCases = results.filter(r => r.expected !== 'mixed').length;
  
  console.log('\n🎯 MATCHES EXPECTED VERDICT:');
  console.log(`   GPT-4o:        ${gpt4oMatchesExpected}/${singleVerdictCases}`);
  console.log(`   Claude Sonnet: ${claudeMatchesExpected}/${singleVerdictCases}`);
  
  console.log('\n💰 COST (per 1000 calls):');
  console.log(`   GPT-4o:        ~$7.50`);
  console.log(`   Claude Sonnet: ~$12.00`);
  
  console.log('\n' + '='.repeat(80));
  
  // Save results
  const outputPath = path.join(__dirname, '..', 'test-assets', 'golden-set', 'runs', `ai-safety-check-comparison-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\n💾 Results saved to: ${outputPath}`);
}

main().catch(console.error);
