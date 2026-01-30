# Versioning Guide

This document explains the versioning strategy for the Scan & Match app.

---

## Three Version Types

### 1. App Version (`x.y.z`)
**Location:** `app.json` → `expo.version`  
**Current:** `1.0.0`  
**Purpose:** User-facing version displayed in App Store  
**Update When:** Major releases or significant feature additions

### 2. Build Number (integer)
**Location:** EAS auto-increment  
**Purpose:** Internal build identifier for release management  
**Update When:** Automatic (managed by EAS Build)

### 3. Schema/Behavior Versions (integers in code)
**Location:** Constants in relevant service files  
**Purpose:** Cache invalidation when prompts, schemas, or behaviors change  
**Update When:** AI prompt changes, cache key format changes, or output schema changes

---

## When to Update What

| Change Type | Action |
|-------------|--------|
| Small code change / fix | Add entry to `CHANGELOG.md` |
| Behavior change affecting outputs/caches | Bump relevant version constant in code + add note below |
| Architecture/UI state change | Update `COMPREHENSIVE_SYSTEM_DOCUMENTATION.md` |

---

## Current Schema/Behavior Versions

Quick reference for version constants in the codebase:

| System | Constant | Current Value | File |
|--------|----------|---------------|------|
| Analysis Cache | `ANALYSIS_CACHE_VERSION` | `v1` | `src/lib/analysis-cache.ts` |
| Analysis Cache | `PROMPT_VERSION` | `2026-01-25-rev` | `src/lib/analysis-cache.ts` |
| Style Signals | `CURRENT_PROMPT_VERSION` | `1` | `src/lib/style-signals-service.ts` |
| Style Signals | `STYLE_SIGNALS_MODEL_VERSION` | `claude-sonnet-4.5` | `src/lib/style-signals-service.ts` |
| AI Safety | `AI_SAFETY_POLICY_VERSION` | `1` | `src/lib/ai-safety/client.ts` |
| Personalized Suggestions | `PROMPT_VERSION` | `3` | `src/lib/personalized-suggestions-service.ts` |
| Personalized Suggestions | `SCHEMA_VERSION` | `2` | `src/lib/personalized-suggestions-service.ts` |
| Trust Filter | `trust_filter_version` | `1` | `src/lib/trust-filter/config.ts` |
| Tipsheet Telemetry | `SCHEMA_VERSION` | `1` | `src/lib/inspiration/tipsheetTelemetry.ts` |

**How to use this table:**
- When you bump a version constant in code, update the corresponding row here
- Add a brief note in the "Version History" section below explaining why

---

## Version History

### 2026-01-25
- Bumped `PROMPT_VERSION` in `analysis-cache.ts` to `2026-01-25-rev`
- Reason: Prompt refinement for improved clothing analysis

### 2026-01
- Initial schema/behavior versions set to `1` for all systems
- App version `1.0.0` released to production
