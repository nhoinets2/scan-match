/**
 * Model Comparison Script
 * 
 * Compares GPT-4o vs GPT-4o-mini for clothing image analysis.
 * Run with: npx ts-node scripts/compare-models.ts [image-url-or-path]
 * 
 * Examples:
 *   npx ts-node scripts/compare-models.ts https://example.com/shirt.jpg
 *   npx ts-node scripts/compare-models.ts ./test-images/dress.png
 * 
 * Set OPENAI_API_KEY in your environment or .env file.
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env if available
try {
  // Try multiple possible locations for .env
  const possiblePaths = [
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), '.env'),
    '/home/user/workspace/.env',
  ];
  
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        // Skip comments and empty lines
        if (line.startsWith('#') || !line.trim()) return;
        const eqIndex = line.indexOf('=');
        if (eqIndex > 0) {
          const key = line.slice(0, eqIndex).trim();
          const value = line.slice(eqIndex + 1).trim();
          if (key && value) {
            process.env[key] = value;
          }
        }
      });
      console.log(`✅ Loaded environment from ${envPath}`);
      break;
    }
  }
} catch (e) {
  // Ignore .env loading errors
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_OPENAI_API_KEY || process.env.EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY not found in environment');
  console.error('   Set it in your .env file or export it in your shell');
  process.exit(1);
}

// Same prompt used in production (from analyze-image Edge Function)
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

IMPORTANT: styleTags must NEVER be empty. Always include at least one tag.

contextSufficient: Set to false if photo is blurry, item is partially visible, or item type is ambiguous.

confidenceSignals:
- color_profile.is_neutral: true for black, white, gray, beige, tan, cream, navy
- color_profile.dominant_hue: 0=red, 30=orange, 60=yellow, 120=green, 180=cyan, 240=blue, 300=magenta
- style_family: minimal, classic, street, athleisure, romantic, edgy, boho, preppy, formal
- formality_level: 1=athleisure, 2=casual, 3=smart casual, 4=business, 5=formal
- texture_type: smooth, textured, soft, structured, mixed

itemSignals (include ONLY fields relevant to category):

For tops:
  "silhouetteVolume": "fitted" | "relaxed" | "oversized"
  "lengthCategory": "cropped" | "mid" | "long"
  "layeringFriendly": true | false
  "stylingRisk": "low" | "medium" | "high"

For bottoms:
  "legShape": "slim" | "straight" | "wide"
  "rise": "low" | "mid" | "high"
  "balanceRequirement": "low" | "medium" | "high"
  "stylingRisk": "low" | "medium" | "high"

For skirts:
  "lengthCategory": "mini" | "midi" | "long"
  "skirtVolume": "straight" | "flowy"
  "stylingRisk": "low" | "medium" | "high"

For dresses:
  "dressSilhouette": "fitted" | "relaxed" | "structured"
  "lengthCategory": "mini" | "midi" | "long"
  "stylingRisk": "low" | "medium" | "high"

For outerwear:
  "structure": "soft" | "structured"
  "bulk": "low" | "medium" | "high"
  "layeringDependency": "low" | "medium" | "high"
  "stylingRisk": "low" | "medium" | "high"

For shoes:
  "styleVersatility": "high" | "medium" | "low"
  "statementLevel": "neutral" | "bold"
  "stylingRisk": "low" | "medium" | "high"

For bags/accessories:
  "styleVersatility": "high" | "medium" | "low"
  "stylingRisk": "low"

stylingRisk: "low" = versatile, "medium" = needs thought, "high" = statement piece

Respond with ONLY the JSON object.`;

interface AnalysisResult {
  isFashionItem: boolean;
  category: string;
  descriptiveLabel: string;
  colors: Array<{ hex: string; name: string }>;
  styleTags: string[];
  styleNotes: string[];
  contextSufficient: boolean;
  itemSignals: Record<string, unknown>;
  confidenceSignals: {
    color_profile: {
      is_neutral: boolean;
      dominant_hue?: number;
      saturation: string;
      value: string;
    };
    style_family: string;
    formality_level: number;
    texture_type: string;
  };
}

interface ModelResult {
  model: string;
  result: AnalysisResult | null;
  error: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

async function analyzeWithModel(model: string, imageDataUrl: string): Promise<ModelResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: ANALYSIS_PROMPT },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0,
      }),
    });

    const latencyMs = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        model,
        result: null,
        error: `HTTP ${response.status}: ${errorText}`,
        latencyMs,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content ?? '';
    
    // Parse JSON (handle markdown code blocks)
    let cleanedResponse = responseText.trim();
    if (cleanedResponse.startsWith('```json')) cleanedResponse = cleanedResponse.slice(7);
    if (cleanedResponse.startsWith('```')) cleanedResponse = cleanedResponse.slice(3);
    if (cleanedResponse.endsWith('```')) cleanedResponse = cleanedResponse.slice(0, -3);
    cleanedResponse = cleanedResponse.trim();

    const result = JSON.parse(cleanedResponse) as AnalysisResult;
    
    return {
      model,
      result,
      error: null,
      latencyMs,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  } catch (error) {
    return {
      model,
      result: null,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startTime,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

async function loadImage(imagePath: string): Promise<string> {
  // If it's already a data URL, return as-is
  if (imagePath.startsWith('data:')) {
    return imagePath;
  }
  
  // If it's a URL, fetch and convert to data URL
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    const response = await fetch(imagePath);
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${base64}`;
  }
  
  // Otherwise, read from local file
  const absolutePath = path.isAbsolute(imagePath) 
    ? imagePath 
    : path.join(process.cwd(), imagePath);
  
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  
  const buffer = fs.readFileSync(absolutePath);
  const base64 = buffer.toString('base64');
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  
  return `data:${mimeType};base64,${base64}`;
}

function compareResults(gpt4o: AnalysisResult, gpt4oMini: AnalysisResult): void {
  console.log('\n' + '='.repeat(70));
  console.log('📊 COMPARISON RESULTS');
  console.log('='.repeat(70));
  
  const comparisons: Array<{ field: string; gpt4o: string; gpt4oMini: string; match: boolean }> = [];
  
  // Core fields
  comparisons.push({
    field: 'isFashionItem',
    gpt4o: String(gpt4o.isFashionItem),
    gpt4oMini: String(gpt4oMini.isFashionItem),
    match: gpt4o.isFashionItem === gpt4oMini.isFashionItem,
  });
  
  comparisons.push({
    field: 'category',
    gpt4o: gpt4o.category,
    gpt4oMini: gpt4oMini.category,
    match: gpt4o.category === gpt4oMini.category,
  });
  
  comparisons.push({
    field: 'descriptiveLabel',
    gpt4o: gpt4o.descriptiveLabel,
    gpt4oMini: gpt4oMini.descriptiveLabel,
    match: gpt4o.descriptiveLabel.toLowerCase() === gpt4oMini.descriptiveLabel.toLowerCase(),
  });
  
  // Colors (compare first color)
  const color4o = gpt4o.colors?.[0];
  const colorMini = gpt4oMini.colors?.[0];
  comparisons.push({
    field: 'primaryColor',
    gpt4o: color4o ? `${color4o.name} (${color4o.hex})` : 'N/A',
    gpt4oMini: colorMini ? `${colorMini.name} (${colorMini.hex})` : 'N/A',
    match: color4o?.name?.toLowerCase() === colorMini?.name?.toLowerCase(),
  });
  
  // Style tags
  const tags4o = (gpt4o.styleTags || []).sort().join(', ');
  const tagsMini = (gpt4oMini.styleTags || []).sort().join(', ');
  comparisons.push({
    field: 'styleTags',
    gpt4o: tags4o || 'N/A',
    gpt4oMini: tagsMini || 'N/A',
    match: tags4o === tagsMini,
  });
  
  // Confidence signals
  comparisons.push({
    field: 'style_family',
    gpt4o: gpt4o.confidenceSignals?.style_family || 'N/A',
    gpt4oMini: gpt4oMini.confidenceSignals?.style_family || 'N/A',
    match: gpt4o.confidenceSignals?.style_family === gpt4oMini.confidenceSignals?.style_family,
  });
  
  comparisons.push({
    field: 'formality_level',
    gpt4o: String(gpt4o.confidenceSignals?.formality_level ?? 'N/A'),
    gpt4oMini: String(gpt4oMini.confidenceSignals?.formality_level ?? 'N/A'),
    match: gpt4o.confidenceSignals?.formality_level === gpt4oMini.confidenceSignals?.formality_level,
  });
  
  comparisons.push({
    field: 'texture_type',
    gpt4o: gpt4o.confidenceSignals?.texture_type || 'N/A',
    gpt4oMini: gpt4oMini.confidenceSignals?.texture_type || 'N/A',
    match: gpt4o.confidenceSignals?.texture_type === gpt4oMini.confidenceSignals?.texture_type,
  });
  
  // Item signals - stylingRisk
  const risk4o = (gpt4o.itemSignals as Record<string, unknown>)?.stylingRisk;
  const riskMini = (gpt4oMini.itemSignals as Record<string, unknown>)?.stylingRisk;
  comparisons.push({
    field: 'stylingRisk',
    gpt4o: String(risk4o ?? 'N/A'),
    gpt4oMini: String(riskMini ?? 'N/A'),
    match: risk4o === riskMini,
  });
  
  // Print comparison table
  console.log('\n┌─────────────────────┬────────────────────────┬────────────────────────┬─────────┐');
  console.log('│ Field               │ GPT-4o                 │ GPT-4o-mini            │ Match   │');
  console.log('├─────────────────────┼────────────────────────┼────────────────────────┼─────────┤');
  
  for (const comp of comparisons) {
    const field = comp.field.padEnd(19);
    const v4o = comp.gpt4o.slice(0, 22).padEnd(22);
    const vMini = comp.gpt4oMini.slice(0, 22).padEnd(22);
    const matchIcon = comp.match ? '✅' : '⚠️';
    console.log(`│ ${field} │ ${v4o} │ ${vMini} │ ${matchIcon}      │`);
  }
  
  console.log('└─────────────────────┴────────────────────────┴────────────────────────┴─────────┘');
  
  // Summary
  const matchCount = comparisons.filter(c => c.match).length;
  const matchPercent = Math.round((matchCount / comparisons.length) * 100);
  
  console.log(`\n📈 Match Rate: ${matchCount}/${comparisons.length} fields (${matchPercent}%)`);
  
  if (matchPercent >= 80) {
    console.log('✅ High agreement - GPT-4o-mini likely suitable for this use case');
  } else if (matchPercent >= 60) {
    console.log('⚠️  Moderate agreement - review differences carefully');
  } else {
    console.log('❌ Low agreement - GPT-4o may be providing better results');
  }
}

function printCostComparison(gpt4o: ModelResult, gpt4oMini: ModelResult): void {
  console.log('\n' + '='.repeat(70));
  console.log('💰 COST & PERFORMANCE COMPARISON');
  console.log('='.repeat(70));
  
  // Pricing (as of late 2025) - per 1M tokens
  const pricing = {
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
  };
  
  const cost4o = (gpt4o.inputTokens * pricing['gpt-4o'].input / 1_000_000) + 
                 (gpt4o.outputTokens * pricing['gpt-4o'].output / 1_000_000);
  const costMini = (gpt4oMini.inputTokens * pricing['gpt-4o-mini'].input / 1_000_000) + 
                   (gpt4oMini.outputTokens * pricing['gpt-4o-mini'].output / 1_000_000);
  
  console.log('\n┌──────────────────┬─────────────────┬─────────────────┐');
  console.log('│ Metric           │ GPT-4o          │ GPT-4o-mini     │');
  console.log('├──────────────────┼─────────────────┼─────────────────┤');
  console.log(`│ Latency          │ ${String(gpt4o.latencyMs + 'ms').padEnd(15)} │ ${String(gpt4oMini.latencyMs + 'ms').padEnd(15)} │`);
  console.log(`│ Input Tokens     │ ${String(gpt4o.inputTokens).padEnd(15)} │ ${String(gpt4oMini.inputTokens).padEnd(15)} │`);
  console.log(`│ Output Tokens    │ ${String(gpt4o.outputTokens).padEnd(15)} │ ${String(gpt4oMini.outputTokens).padEnd(15)} │`);
  console.log(`│ Cost (this call) │ ${('$' + cost4o.toFixed(6)).padEnd(15)} │ ${('$' + costMini.toFixed(6)).padEnd(15)} │`);
  console.log('└──────────────────┴─────────────────┴─────────────────┘');
  
  const savings = ((cost4o - costMini) / cost4o * 100).toFixed(1);
  const speedup = ((gpt4o.latencyMs - gpt4oMini.latencyMs) / gpt4o.latencyMs * 100).toFixed(1);
  
  console.log(`\n📊 GPT-4o-mini is ${savings}% cheaper and ${speedup}% faster for this request`);
  
  // Extrapolate to 1000 requests
  const monthly4o = cost4o * 1000;
  const monthlyMini = costMini * 1000;
  console.log(`\n📅 Projected monthly cost (1000 scans):`);
  console.log(`   GPT-4o:      $${monthly4o.toFixed(2)}`);
  console.log(`   GPT-4o-mini: $${monthlyMini.toFixed(2)}`);
  console.log(`   Savings:     $${(monthly4o - monthlyMini).toFixed(2)}/month`);
}

async function main(): Promise<void> {
  const imagePath = process.argv[2];
  
  if (!imagePath) {
    console.log('🔍 Model Comparison Tool for Clothing Analysis');
    console.log('='.repeat(50));
    console.log('\nUsage:');
    console.log('  npx ts-node scripts/compare-models.ts <image-path-or-url>');
    console.log('\nExamples:');
    console.log('  npx ts-node scripts/compare-models.ts https://example.com/shirt.jpg');
    console.log('  npx ts-node scripts/compare-models.ts ./my-test-image.jpg');
    console.log('  npx ts-node scripts/compare-models.ts /absolute/path/to/dress.png');
    console.log('\nSupported formats: .jpg, .jpeg, .png, .webp');
    console.log('\nTip: Test with 5-10 different clothing images to get a good comparison.');
    process.exit(0);
  }
  
  console.log('🔍 Model Comparison Tool for Clothing Analysis');
  console.log('='.repeat(50));
  console.log(`\nImage: ${imagePath}`);
  console.log('\nLoading image...');
  
  let imageDataUrl: string;
  try {
    imageDataUrl = await loadImage(imagePath);
    const sizeKb = Math.round(imageDataUrl.length * 0.75 / 1024); // Approximate decoded size
    console.log(`✅ Image loaded (~${sizeKb}KB)`);
  } catch (error) {
    console.error(`❌ Failed to load image: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  
  console.log('\n⏳ Running analysis with both models (this may take 10-20 seconds)...\n');
  
  // Run both models in parallel
  const [gpt4oResult, gpt4oMiniResult] = await Promise.all([
    analyzeWithModel('gpt-4o', imageDataUrl),
    analyzeWithModel('gpt-4o-mini', imageDataUrl),
  ]);
  
  // Check for errors
  if (gpt4oResult.error) {
    console.error(`❌ GPT-4o error: ${gpt4oResult.error}`);
  }
  if (gpt4oMiniResult.error) {
    console.error(`❌ GPT-4o-mini error: ${gpt4oMiniResult.error}`);
  }
  
  if (!gpt4oResult.result || !gpt4oMiniResult.result) {
    console.error('\n❌ Cannot compare - one or both models failed');
    process.exit(1);
  }
  
  // Print raw results
  console.log('─'.repeat(70));
  console.log('GPT-4o Result:');
  console.log(JSON.stringify(gpt4oResult.result, null, 2));
  console.log('\n' + '─'.repeat(70));
  console.log('GPT-4o-mini Result:');
  console.log(JSON.stringify(gpt4oMiniResult.result, null, 2));
  
  // Compare results
  compareResults(gpt4oResult.result, gpt4oMiniResult.result);
  
  // Cost comparison
  printCostComparison(gpt4oResult, gpt4oMiniResult);
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Comparison complete!');
  console.log('='.repeat(70));
}

main().catch(console.error);
