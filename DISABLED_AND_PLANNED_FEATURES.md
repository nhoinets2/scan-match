# Disabled and Planned Features

This document lists all features that are implemented but disabled, or planned for future versions.

---

## Currently Disabled Features

### 1. V (Silhouette) Feature - v2

**Status:** ✅ Fully implemented, ❌ Disabled via feature flag

**Location:**
- `src/lib/confidence-engine/config.ts` - Feature flag and weights
- `src/lib/confidence-engine/signals.ts` - Implementation
- `src/lib/confidence-engine/types.ts` - Type definitions

**Feature Flag:**
```typescript
FEATURE_FLAGS = {
  silhouette_enabled: false,  // v2
}
```

**Weight:**
- `V: 0.00` in all weight configurations (disabled)

**What It Does:**
- Evaluates silhouette/volume compatibility between items
- Scores based on volume combinations:
  - Fitted + Oversized = +2 (classic balance)
  - Regular + Anything = +1 (versatile)
  - Same Volume = 0 (neutral)

**Why Disabled:**
- Silhouette data not yet available for items
- Waiting for v2 rollout

**How to Enable:**
1. Set `FEATURE_FLAGS.silhouette_enabled: true`
2. Add weight to `V` in weight configurations (e.g., `V: 0.10`)
3. Ensure items have `silhouette_profile` data

---

### 2. Shoes Explanations

**Status:** ✅ Implemented, ❌ Disabled via feature flag

**Location:**
- `src/lib/confidence-engine/config.ts` - Feature flag
- `src/lib/confidence-engine/explanations.ts` - Forbidden rule check

**Feature Flag:**
```typescript
FEATURE_FLAGS = {
  explanations_allow_shoes: false,
}
```

**What It Does:**
- Prevents explanations from being shown for shoe pairings
- Shoes are considered "contentious" - too subjective to explain

**Why Disabled:**
- Shoes are highly subjective
- Explanations for shoes can be misleading
- Better to stay silent than provide potentially wrong guidance

**Forbidden Rule:**
- `SHOES_CONTENTIOUS` - Blocks explanations when shoes are involved

**How to Enable:**
- Set `FEATURE_FLAGS.explanations_allow_shoes: true`
- Explanations will then be allowed for shoe pairings (if other rules pass)

---

## Planned/Future Features

### 3. MEDIUM Confidence Explanations

**Status:** 🔮 Planned for future

**Location:**
- `src/lib/confidence-engine/explanations.ts` - Comment in code
- `src/lib/confidence-engine/config.ts` - Config structure supports it

**Current Behavior:**
```typescript
// Currently we only allow HIGH, but config can extend to MEDIUM in future
if (evaluation.confidence_tier !== 'HIGH') {
  return { eligible: false, reason: 'confidence_too_low' };
}
```

**Config:**
```typescript
FEATURE_FLAGS = {
  explanations_min_confidence: 'HIGH' as const,
}
```

**What It Would Do:**
- Allow explanations for MEDIUM confidence matches (not just HIGH)
- Would provide styling guidance for near-matches

**Why Not Enabled:**
- Currently only HIGH matches are considered confident enough to explain
- MEDIUM matches might be too uncertain to provide explanations

**How to Enable:**
- Change `explanations_min_confidence: 'MEDIUM'` in config
- Update eligibility check to allow MEDIUM tier

---

### 4. Pair-Specific Signal Logic

**Status:** 🔮 Reserved for future

**Location:**
- `src/lib/confidence-engine/signals.ts` - Reserved parameter

**Current Code:**
```typescript
export function computeFeatureSignals(
  itemA: ConfidenceItem,
  itemB: ConfidenceItem,
  _pairType: PairType // Reserved for future pair-specific logic
): FeatureSignals
```

**What It Would Do:**
- Allow different signal computation logic based on pair type
- Could adjust feature weights or rules per pair type
- Example: Different color rules for `tops_bottoms` vs `tops_shoes`

**Why Not Implemented:**
- Current system uses pair-specific weights, not pair-specific signals
- Signals are computed the same way for all pairs
- May be needed for future optimizations

**Status:**
- Parameter exists but unused (prefixed with `_`)
- No implementation yet

---

### 5. Analytics Service Integration

**Status:** 🔮 TODO - Planned for production

**Location:**
- `src/lib/analytics.ts` - TODO comment
- `src/lib/confidence-engine/analytics.ts` - Event tracking structure

**Current Code:**
```typescript
// TODO: Send to analytics service in production
// Example: mixpanel.track(name, properties);
// Example: amplitude.logEvent(name, properties);
```

**What It Would Do:**
- Send confidence engine events to analytics service
- Track evaluation behavior for optimization
- Monitor feature usage and performance

**Current Behavior:**
- Events are logged to console in development
- No production analytics service connected

**Why Not Implemented:**
- Waiting for analytics service selection
- Currently in development/testing phase

**How to Enable:**
- Choose analytics service (Mixpanel, Amplitude, etc.)
- Implement service integration
- Replace console.log with service calls

---

## Summary Table

| Feature | Status | Type | Location | Enable Method |
|---------|--------|------|----------|---------------|
| **V (Silhouette)** | Disabled | Feature Flag | `config.ts`, `signals.ts` | Set `silhouette_enabled: true` + add weight |
| **Shoes Explanations** | Disabled | Feature Flag | `config.ts`, `explanations.ts` | Set `explanations_allow_shoes: true` |
| **MEDIUM Explanations** | Planned | Config Extension | `explanations.ts` | Change `explanations_min_confidence: 'MEDIUM'` |
| **Pair-Specific Signals** | Reserved | Future Logic | `signals.ts` | Implement pair-specific computation |
| **Analytics Integration** | TODO | Production Feature | `analytics.ts` | Connect to analytics service |

---

## Feature Flag Reference

**Current Feature Flags:**
```typescript
export const FEATURE_FLAGS = {
  explanations_enabled: true,              // ✅ Enabled
  explanations_min_confidence: 'HIGH',    // ✅ Enabled (HIGH only)
  explanations_allow_shoes: false,         // ❌ Disabled
  mode_b_strong_medium_fallback: true,    // ✅ Enabled
  silhouette_enabled: false,              // ❌ Disabled (v2)
} as const;
```

---

## Notes

- **Disabled features** are fully implemented but turned off via flags
- **Planned features** have code structure/placeholders but no implementation
- **Reserved features** have parameters/space reserved for future use
- All disabled features can be enabled by changing configuration flags
- Planned features require additional implementation work

