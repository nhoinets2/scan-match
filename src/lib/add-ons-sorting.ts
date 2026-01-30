import { isAddOnCategory, type AddOnCategory, type AddOnItem, type ElevateBullet } from "./types";

/** Synonym groups - any variant maps to the whole group */
const ATTR_GROUPS = {
  gold: ["gold", "golden", "brass"],
  tan: ["tan", "camel", "beige", "khaki"],
  structured: ["structured", "boxy", "rigid"],
  minimal: ["minimal", "simple", "clean"],
  leather: ["leather", "faux_leather", "vegan_leather"],
  neutral: ["neutral", "nude", "cream", "ivory"],
} as const;

/** Bidirectional lookup: any variant → its whole group */
const ATTR_LOOKUP = new Map<string, readonly string[]>(
  Object.values(ATTR_GROUPS).flatMap((list) => list.map((v) => [v, list] as const))
);

/** Tokenize text for whole-token matching (prevents "tan" matching "tangerine") */
function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

interface ScoredAddOn {
  item: AddOnItem;
  score: number;
  originalIndex: number;
}

export function scoreAndSortAddOns(
  addOns: AddOnItem[],
  toElevate: ElevateBullet[] | undefined
): AddOnItem[] {
  // 1. Extract AI recommendations (deduplicated, priority preserved)
  const wantedCategories: AddOnCategory[] = [];
  const wantedAttrs = new Set<string>();

  if (toElevate) {
    toElevate.forEach((bullet) => {
      if (bullet.recommend.type !== "consider_adding") return;
      const cat = bullet.recommend.category;
      // Deduplicate: only add if not already present AND is add-on category
      if (isAddOnCategory(cat) && !wantedCategories.includes(cat)) {
        wantedCategories.push(cat);
      }
      // Expand attributes with bidirectional synonyms
      bullet.recommend.attributes.forEach((attr) => {
        const normalized = attr.toLowerCase().trim();
        const group = ATTR_LOOKUP.get(normalized);
        if (group) {
          group.forEach((syn) => wantedAttrs.add(syn));
        } else if (normalized) {
          wantedAttrs.add(normalized);
        }
      });
    });
  }

  // 2. Score each add-on
  const scored: ScoredAddOn[] = addOns.map((item, originalIndex) => {
    let score = 0;

    // Category match: +100 base, +40/20/0 for priority (simpler formula)
    const categoryIdx = wantedCategories.indexOf(item.category);
    if (categoryIdx !== -1) {
      score += 100;
      score += Math.max(0, 40 - categoryIdx * 20);
    }

    // Attribute match: tokenize to prevent false positives, +10 per match, cap at +30
    const tokens = new Set(tokenize(getMatchableText(item)));
    let attrMatches = 0;
    wantedAttrs.forEach((attr) => {
      if (tokens.has(attr)) {
        attrMatches += 1;
      }
    });
    score += Math.min(attrMatches * 10, 30);

    return { item, score, originalIndex };
  });

  // 3. Sort by score descending, then originalIndex ascending (deterministic tiebreaker)
  return scored
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
    .map((s) => s.item);
}

function getMatchableText(item: AddOnItem): string {
  // Combine searchable fields (local only, never sent to model)
  const parts: string[] = [];
  if (item.colors?.[0]?.name) {
    parts.push(item.colors[0].name);
  }
  if (item.detectedLabel) {
    parts.push(item.detectedLabel);
  }
  if (item.userStyleTags?.length) {
    parts.push(...item.userStyleTags);
  }
  return parts.join(" ");
}
