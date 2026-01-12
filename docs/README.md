# Documentation Index

This folder contains technical documentation for the app's core systems.

## Available Documentation

| Document | Description |
|----------|-------------|
| [Results Screen States](./results-screen-states.md) | UI state rules, section visibility, and empty state handling |
| [Outfit Selection Pipeline](./outfit-selection-pipeline.md) | How outfits are filtered, ranked, and displayed |
| [Empty State Messaging](./empty-state-messaging.md) | Blocking vs weak slot classification for empty states |
| [Tailor Suggestions Roadmap](./tailor-suggestions-roadmap.md) | Store preferences feature: Phase 1 + future phases |
| [Tailor Suggestions Redesign](./tailor-suggestions-redesign.md) | Clean, minimal UI redesign for store preferences card |
| [Typography System V2](./typography-system-v2.md) | Poppins + Inter dual-font system, usage guidelines |
| [Typography Migration Example](./typography-migration-example.md) | Before/after example with implementation code |
| [Typography Pitfalls](./typography-pitfalls.md) | **Critical:** 5 production pitfalls & fixes |
| [Typography Visual Guide](./typography-visual-guide.md) | Visual hierarchy and decision trees |
| [Hybrid Schema](./HYBRID_SCHEMA.md) | Data schema documentation |
| [Style-Aware Suggestions Spec](./STYLE_AWARE_SUGGESTIONS_SPEC.md) | Styling suggestions system |

## Quick Links

### Outfit Selection Pipeline

The outfit selection pipeline transforms raw outfit combinations into a curated list for users:

1. **Coherence Filter** — Removes incoherent combos (sport pants + heels)
2. **Tier Split** — HIGH → "Wear now", MEDIUM → "Worth trying"
3. **Ranking** — Penalty → mediumCount → avgScore
4. **Diversity Picker** — Ensures variety (unique shoes/bottoms)
5. **Display Caps** — Max 3-5 outfits per tab

[Read full documentation →](./outfit-selection-pipeline.md)

### Empty State Messaging

When outfits can't be formed, the app distinguishes between:

- **Missing Core** — User doesn't have items in a category → "Add bottoms..."
- **Blocking** — User has items but 0 match → "None of your bottoms match..."
- **Weak** — User has low-quality matches → Mentioned as "close" options

This prevents misleading "add items" messages when users have items that just don't style-match.

[Read full documentation →](./empty-state-messaging.md)

### Results Screen States

The results screen displays different content based on match tiers and wardrobe state:

| Wardrobe | Matches | What Shows |
|----------|---------|------------|
| Empty | None | "Build your wardrobe" CTA + Mode A |
| Has items | HIGH | Matches + "Complete the look" |
| Has items | NEAR only | "Worth trying" + Mode B tips |
| Has items | None | Mode A suggestions (or Rescan CTA) |

[Read full documentation →](./results-screen-states.md)

### Tailor Suggestions (Store Preferences)

Users can pick up to 5 favorite stores for future shopping suggestions:

- **Phase 1 (shipped):** Card + modal + persistence + analytics
- **Phase 2 triggers:** Search (if users can't find stores), Notify toggle (if high engagement)

[Read full roadmap →](./tailor-suggestions-roadmap.md)

