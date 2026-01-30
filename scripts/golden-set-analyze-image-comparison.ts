/**
 * Golden Set Analyze-Image Comparison Script
 * 
 * Compares GPT-4o vs Claude Sonnet 4.5 for the analyze-image prompt
 * (Confidence Engine signals).
 * 
 * Run with: npx tsx scripts/golden-set-analyze-image-comparison.ts
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
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not found');
  process.exit(1);
}

// ANALYSIS PROMPT (from supabase/functions/analyze-image/index.ts)
const ANALYSIS_PROMPT = `Analyze this image and respond ONLY with a valid JSON object (no markdown, no explanation).

The JSON must have exactly this structure:
{
  "isFashionItem": true | false,
  "category": "tops" | "bottoms" | "dresses" | "skirts" | "outerwear" | "shoes" | "bags" | "accessories" | "unknown",
  "descriptiveLabel": "a short 2-4 word description",
  "colors": [{"hex": "#hexcode", "name": "Color Name"}],
  "styleTags": ["style1", "style2"],
  "styleNotes": ["note1", "note2"],
  "contextSufficient": true | false,
  "itemSignals": { ... category-specific signals ... },
  "confidenceSignals": {
    "color_profile": {
      "is_neutral": true | false,
      "dominant_hue": 0-360 (omit if neutral),
      "saturation": "low" | "med" | "high",
      "value": "low" | "med" | "high"
    },
    "style_family": "minimal" | "classic" | "street" | "athleisure" | "romantic" | "edgy" | "boho" | "preppy" | "formal" | "unknown",
    "formality_level": 1 | 2 | 3 | 4 | 5,
    "texture_type": "smooth" | "textured" | "soft" | "structured" | "mixed" | "unknown"
  }
}

FIRST, determine if this is a wearable fashion item:
- isFashionItem: true for clothing, shoes, bags, jewelry, scarves, belts, hats, watches
- isFashionItem: false for mugs, cups, electronics, food, plants, pets, furniture, vehicles, etc.
- If isFashionItem is false, set category to "unknown" and use empty arrays for styleTags/styleNotes/colors

Category rules (only apply if isFashionItem is true):
- tops: shirts, blouses, t-shirts, sweaters, tank tops
- bottoms: pants, trousers, jeans, shorts
- dresses: full dresses (not separates)
- skirts: skirts only (not pants)
- outerwear: jackets, coats, blazers, cardigans worn as outer layer
- shoes: all footwear
- bags: handbags, backpacks, totes
- accessories: jewelry, scarves, belts, hats, watches
- unknown: use ONLY when isFashionItem is false

styleTags (REQUIRED - must include 1-3 tags from this list):
- "casual": relaxed, everyday, comfortable
- "minimal": clean lines, simple, understated
- "office": professional, work-appropriate
- "street": urban, streetwear-influenced
- "feminine": soft, romantic, delicate details
- "sporty": athletic-inspired, active

confidenceSignals:
- color_profile.is_neutral: true for black, white, gray, beige, tan, cream, navy
- color_profile.dominant_hue: 0=red, 30=orange, 60=yellow, 120=green, 180=cyan, 240=blue, 300=magenta
- style_family: minimal, classic, street, athleisure, romantic, edgy, boho, preppy, formal
- formality_level: 1=athleisure, 2=casual, 3=smart casual, 4=business, 5=formal
- texture_type: smooth, textured, soft, structured, mixed

Respond with ONLY the JSON object.`;

interface ConfidenceSignals {
  color_profile: {
    is_neutral: boolean;
    dominant_hue?: number;
    saturation: string;
    value: string;
  };
  style_family: string;
  formality_level: number;
  texture_type: string;
}

interface AnalysisResult {
  isFashionItem: boolean;
  category: string;
  descriptiveLabel: string;
  colors: Array<{ hex: string; name: string }>;
  styleTags: string[];
  styleNotes: string[];
  contextSufficient: boolean;
  confidenceSignals: ConfidenceSignals;
  itemSignals?: Record<string, unknown>;
}

interface GoldenSetEntry {
  filename: string;
  imageUrl: string;
}

interface GoldenSetBaseline {
  version: number;
  entries: GoldenSetEntry[];
}

interface ComparisonResult {
  filename: string;
  gpt4o: AnalysisResult | null;
  claude: AnalysisResult | null;
  gpt4oLatencyMs: number;
  claudeLatencyMs: number;
  gpt4oError?: string;
  claudeError?: string;
  matches: {
    category: boolean;
    style_family: boolean;
    formality_level: boolean;
    texture_type: boolean;
    is_neutral: boolean;
  };
  matchCount: number;
}

async function analyzeWithGPT4o(imageUrl: string): Promise<{ result: AnalysisResult | null; error?: string; latencyMs: number }> {
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
            { type: 'text', text: ANALYSIS_PROMPT }
          ]
        }],
        max_tokens: 1000,
        temperature: 0,
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
    
    const result = JSON.parse(responseText.trim()) as AnalysisResult;
    return { result, latencyMs };
  } catch (error) {
    return { result: null, error: String(error).slice(0, 100), latencyMs: Date.now() - startTime };
  }
}

async function analyzeWithClaude(imageUrl: string): Promise<{ result: AnalysisResult | null; error?: string; latencyMs: number }> {
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
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: contentType, data: base64Data } },
            { type: 'text', text: ANALYSIS_PROMPT }
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
    
    const result = JSON.parse(responseText.trim()) as AnalysisResult;
    return { result, latencyMs };
  } catch (error) {
    return { result: null, error: String(error).slice(0, 100), latencyMs: Date.now() - startTime };
  }
}

function compareResults(gpt4o: AnalysisResult, claude: AnalysisResult): ComparisonResult['matches'] {
  return {
    category: gpt4o.category === claude.category,
    style_family: gpt4o.confidenceSignals?.style_family === claude.confidenceSignals?.style_family,
    formality_level: gpt4o.confidenceSignals?.formality_level === claude.confidenceSignals?.formality_level,
    texture_type: gpt4o.confidenceSignals?.texture_type === claude.confidenceSignals?.texture_type,
    is_neutral: gpt4o.confidenceSignals?.color_profile?.is_neutral === claude.confidenceSignals?.color_profile?.is_neutral,
  };
}

async function main(): Promise<void> {
  console.log('\n🔬 Golden Set Analyze-Image Comparison: GPT-4o vs Claude Sonnet 4.5');
  console.log('='.repeat(70));
  
  // Load baseline (just for image URLs)
  const baselinePath = path.join(__dirname, '..', 'test-assets', 'golden-set-baseline.json');
  const baseline: GoldenSetBaseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  
  console.log(`\n📦 Loaded ${baseline.entries.length} golden set images`);
  console.log('⏳ Running both GPT-4o and Claude on all images...\n');
  
  const results: ComparisonResult[] = [];
  let gpt4oTotalLatency = 0;
  let claudeTotalLatency = 0;
  let gpt4oSuccessCount = 0;
  let claudeSuccessCount = 0;
  
  for (let i = 0; i < baseline.entries.length; i++) {
    const entry = baseline.entries[i];
    const shortName = entry.filename.split('/').pop() || entry.filename;
    
    console.log(`[${i + 1}/${baseline.entries.length}] ${shortName}`);
    
    // Run both models in parallel
    const [gpt4oResult, claudeResult] = await Promise.all([
      analyzeWithGPT4o(entry.imageUrl),
      analyzeWithClaude(entry.imageUrl)
    ]);
    
    gpt4oTotalLatency += gpt4oResult.latencyMs;
    claudeTotalLatency += claudeResult.latencyMs;
    
    if (gpt4oResult.result) gpt4oSuccessCount++;
    if (claudeResult.result) claudeSuccessCount++;
    
    let matches: ComparisonResult['matches'] = { category: false, style_family: false, formality_level: false, texture_type: false, is_neutral: false };
    let matchCount = 0;
    
    if (gpt4oResult.result && claudeResult.result) {
      matches = compareResults(gpt4oResult.result, claudeResult.result);
      matchCount = Object.values(matches).filter(Boolean).length;
    }
    
    results.push({
      filename: shortName,
      gpt4o: gpt4oResult.result,
      claude: claudeResult.result,
      gpt4oLatencyMs: gpt4oResult.latencyMs,
      claudeLatencyMs: claudeResult.latencyMs,
      gpt4oError: gpt4oResult.error,
      claudeError: claudeResult.error,
      matches,
      matchCount
    });
    
    const gpt4oStatus = gpt4oResult.result ? `✅ ${gpt4oResult.latencyMs}ms` : `❌ ${gpt4oResult.error}`;
    const claudeStatus = claudeResult.result ? `✅ ${claudeResult.latencyMs}ms` : `❌ ${claudeResult.error}`;
    console.log(`   GPT-4o: ${gpt4oStatus}`);
    console.log(`   Claude: ${claudeStatus}`);
    if (gpt4oResult.result && claudeResult.result) {
      console.log(`   Match: ${matchCount}/5 fields`);
    }
    
    // Small delay between requests
    if (i < baseline.entries.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  
  // Generate report
  console.log('\n' + '='.repeat(80));
  console.log('📊 ANALYZE-IMAGE COMPARISON REPORT: GPT-4o vs Claude Sonnet 4.5');
  console.log('='.repeat(80));
  
  const bothSuccessful = results.filter(r => r.gpt4o && r.claude);
  const total = bothSuccessful.length;
  
  // Field-level agreement
  const fieldAgreement = {
    category: bothSuccessful.filter(r => r.matches.category).length,
    style_family: bothSuccessful.filter(r => r.matches.style_family).length,
    formality_level: bothSuccessful.filter(r => r.matches.formality_level).length,
    texture_type: bothSuccessful.filter(r => r.matches.texture_type).length,
    is_neutral: bothSuccessful.filter(r => r.matches.is_neutral).length,
  };
  
  console.log('\n🎯 FIELD-LEVEL AGREEMENT (GPT-4o vs Claude):');
  console.log('─'.repeat(60));
  console.log(`│ category         │ ${fieldAgreement.category}/${total} (${Math.round(fieldAgreement.category/total*100)}%) │ ${fieldAgreement.category/total >= 0.8 ? '✅ HIGH' : '⚠️ REVIEW'} │`);
  console.log(`│ style_family     │ ${fieldAgreement.style_family}/${total} (${Math.round(fieldAgreement.style_family/total*100)}%) │ ${fieldAgreement.style_family/total >= 0.8 ? '✅ HIGH' : '⚠️ REVIEW'} │`);
  console.log(`│ formality_level  │ ${fieldAgreement.formality_level}/${total} (${Math.round(fieldAgreement.formality_level/total*100)}%) │ ${fieldAgreement.formality_level/total >= 0.8 ? '✅ HIGH' : '⚠️ REVIEW'} │`);
  console.log(`│ texture_type     │ ${fieldAgreement.texture_type}/${total} (${Math.round(fieldAgreement.texture_type/total*100)}%) │ ${fieldAgreement.texture_type/total >= 0.8 ? '✅ HIGH' : '⚠️ REVIEW'} │`);
  console.log(`│ is_neutral       │ ${fieldAgreement.is_neutral}/${total} (${Math.round(fieldAgreement.is_neutral/total*100)}%) │ ${fieldAgreement.is_neutral/total >= 0.8 ? '✅ HIGH' : '⚠️ REVIEW'} │`);
  console.log('─'.repeat(60));
  
  // Critical CE fields (category + style_family + formality_level)
  const criticalMatch = bothSuccessful.filter(r => r.matches.category && r.matches.style_family && r.matches.formality_level).length;
  console.log(`\n🔥 CRITICAL CE FIELDS (category + style_family + formality): ${criticalMatch}/${total} (${Math.round(criticalMatch/total*100)}%)`);
  
  // Latency comparison
  const avgGpt4oLatency = gpt4oTotalLatency / results.length;
  const avgClaudeLatency = claudeTotalLatency / results.length;
  
  console.log('\n⏱️  LATENCY COMPARISON:');
  console.log(`   GPT-4o average:  ${avgGpt4oLatency.toFixed(0)}ms`);
  console.log(`   Claude average:  ${avgClaudeLatency.toFixed(0)}ms`);
  console.log(`   Speedup:         ${(avgGpt4oLatency / avgClaudeLatency).toFixed(2)}x ${avgClaudeLatency < avgGpt4oLatency ? '(Claude faster)' : '(GPT-4o faster)'}`);
  
  // Success rates
  console.log('\n📈 SUCCESS RATES:');
  console.log(`   GPT-4o:  ${gpt4oSuccessCount}/${results.length} (${Math.round(gpt4oSuccessCount/results.length*100)}%)`);
  console.log(`   Claude:  ${claudeSuccessCount}/${results.length} (${Math.round(claudeSuccessCount/results.length*100)}%)`);
  
  // Overall agreement
  const avgMatchCount = bothSuccessful.reduce((sum, r) => sum + r.matchCount, 0) / total;
  console.log(`\n🤝 OVERALL AGREEMENT: ${(avgMatchCount/5*100).toFixed(1)}% (${avgMatchCount.toFixed(1)}/5 fields)`);
  
  // Perfect matches
  const perfectMatches = bothSuccessful.filter(r => r.matchCount === 5);
  console.log(`   Perfect agreement (5/5): ${perfectMatches.length}/${total} (${Math.round(perfectMatches.length/total*100)}%)`);
  
  // Items with low agreement
  const lowAgreement = bothSuccessful.filter(r => r.matchCount <= 2).sort((a, b) => a.matchCount - b.matchCount);
  if (lowAgreement.length > 0) {
    console.log('\n⚠️  ITEMS WITH LOW AGREEMENT (≤2/5):');
    for (const item of lowAgreement.slice(0, 10)) {
      const diffs = [];
      if (!item.matches.category) diffs.push(`cat:${item.gpt4o?.category}→${item.claude?.category}`);
      if (!item.matches.style_family) diffs.push(`style:${item.gpt4o?.confidenceSignals?.style_family}→${item.claude?.confidenceSignals?.style_family}`);
      if (!item.matches.formality_level) diffs.push(`form:${item.gpt4o?.confidenceSignals?.formality_level}→${item.claude?.confidenceSignals?.formality_level}`);
      console.log(`   ${item.filename}: ${item.matchCount}/5 [${diffs.join(', ')}]`);
    }
  }
  
  // Cost comparison
  const gpt4oCostPerCall = (1000 * 2.50 / 1_000_000) + (500 * 10.00 / 1_000_000);
  const claudeCostPerCall = (1500 * 3.00 / 1_000_000) + (500 * 15.00 / 1_000_000);
  
  console.log('\n💰 COST COMPARISON:');
  console.log(`   GPT-4o per call:  $${gpt4oCostPerCall.toFixed(6)}`);
  console.log(`   Claude per call:  $${claudeCostPerCall.toFixed(6)}`);
  console.log(`   GPT-4o per 1000:  $${(gpt4oCostPerCall * 1000).toFixed(2)}`);
  console.log(`   Claude per 1000:  $${(claudeCostPerCall * 1000).toFixed(2)}`);
  
  // Final verdict
  console.log('\n' + '='.repeat(80));
  const criticalPct = criticalMatch / total;
  const categoryPct = fieldAgreement.category / total;
  
  if (categoryPct >= 0.95 && criticalPct >= 0.80) {
    console.log('✅ VERDICT: Claude is a VIABLE REPLACEMENT for analyze-image');
    console.log('   Category agreement ≥95%, Critical fields agreement ≥80%');
    console.log(`   Speed: ${avgClaudeLatency < avgGpt4oLatency ? 'Claude is faster' : 'Similar latency'}`);
  } else if (categoryPct >= 0.85) {
    console.log('⚠️  VERDICT: Claude is MOSTLY COMPATIBLE for analyze-image');
    console.log('   Some differences in interpretation, but generally aligned');
  } else {
    console.log('❌ VERDICT: Models show SIGNIFICANT DIFFERENCES');
    console.log('   Consider keeping GPT-4o for analyze-image');
  }
  console.log('='.repeat(80));
  
  // Save results
  const outputPath = path.join(__dirname, '..', 'test-assets', 'golden-set', 'runs', `analyze-image-comparison-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({ 
    generatedAt: new Date().toISOString(),
    models: ['gpt-4o', 'claude-sonnet-4-5-20250929'],
    summary: { 
      total, 
      gpt4oSuccess: gpt4oSuccessCount,
      claudeSuccess: claudeSuccessCount,
      avgAgreement: avgMatchCount/5, 
      avgGpt4oLatencyMs: avgGpt4oLatency,
      avgClaudeLatencyMs: avgClaudeLatency,
      criticalAgreement: criticalPct,
      gpt4oCostPerCall,
      claudeCostPerCall
    },
    fieldAgreement,
    results: results.map(r => ({ 
      filename: r.filename, 
      matchCount: r.matchCount, 
      matches: r.matches, 
      gpt4oLatencyMs: r.gpt4oLatencyMs,
      claudeLatencyMs: r.claudeLatencyMs,
      gpt4oError: r.gpt4oError,
      claudeError: r.claudeError,
      gpt4oCategory: r.gpt4o?.category,
      claudeCategory: r.claude?.category,
      gpt4oStyleFamily: r.gpt4o?.confidenceSignals?.style_family,
      claudeStyleFamily: r.claude?.confidenceSignals?.style_family,
    }))
  }, null, 2));
  console.log(`\n💾 Results saved to: ${outputPath}`);
}

main().catch(console.error);
