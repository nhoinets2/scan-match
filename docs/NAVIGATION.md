# Documentation Navigation

Complete index of all project documentation, organized by category.

---

## 📚 Quick Links

### Getting Started
- [**Main README**](../README.md) - Project overview and tech stack
- [**Comprehensive System Documentation**](../COMPREHENSIVE_SYSTEM_DOCUMENTATION.md) - Complete system guide

### For Developers
- [**Confidence Engine**](specs/CONFIDENCE_ENGINE.md) - How the matching engine works
- [**Testing Strategy**](guides/TESTING_STRATEGY.md) - Testing approach and tools
- [**Known Issues**](KNOWN_ISSUES.md) - Known issues and limitations

### For Designers
- [**Style-Aware Suggestions Spec**](STYLE_AWARE_SUGGESTIONS_SPEC.md) - UI copy and messaging
- [**Empty State Messaging**](empty-state-messaging.md) - Empty state patterns

---

## 📁 Documentation Structure

```
docs/
├── current/              # Active feature documentation
│   ├── debug-system.md
│   ├── empty-state-messaging.md
│   ├── image-analysis-caching.md
│   ├── match-count-performance.md
│   ├── outfit-selection-pipeline.md
│   ├── results-screen-states.md
│   ├── scan-retention.md
│   ├── tailor-suggestions-roadmap.md
│   ├── wardrobe-images-storage-setup.md
│   ├── winback-retention-system.md
│   ├── HYBRID_SCHEMA.md
│   └── STYLE_AWARE_SUGGESTIONS_SPEC.md
│
├── historical/           # Completed fixes and old architecture
│   ├── CRITICAL_FIX_STORE_PREFERENCES.md
│   ├── STORE_CHIP_TRUNCATION_FIX.md
│   ├── LOCAL_IOS_FIX.md
│   └── METRO_BUNDLER_FIX.md
│
├── guides/              # Setup and workflow guides
│   ├── MAESTRO_BUILD_TYPES.md
│   ├── MAESTRO_SETUP.md
│   ├── MULTIPLE_SIMULATORS.md
│   ├── TESTING_STRATEGY.md
│   └── XCODE_UPDATE_WORKFLOW.md
│
├── specs/               # Technical specifications
│   ├── CONFIDENCE_ENGINE.md
│   └── DISABLED_AND_PLANNED_FEATURES.md
│
├── handoff/             # Implementation notes and handoffs
│   ├── wardrobe-retry-badge-no-flicker.md
│   └── ...
│
├── KNOWN_ISSUES.md      # Known issues and limitations
└── NAVIGATION.md        # This file - documentation index

Root documentation:
├── README.md                               # Project overview
├── CHANGELOG.md                            # Version history
├── COMPREHENSIVE_SYSTEM_DOCUMENTATION.md   # Complete system guide
└── REFUND_POLICY.md                        # App Store refund policy
```

---

## 🎯 Documentation by Topic

### Architecture & System Design

| Document | Description |
|----------|-------------|
| [Comprehensive System Documentation](../COMPREHENSIVE_SYSTEM_DOCUMENTATION.md) | Complete guide to Confidence Engine and Results Screen |
| [Confidence Engine](specs/CONFIDENCE_ENGINE.md) | Complete engine documentation: architecture, scoring, integration guide |
| [Hybrid Schema](HYBRID_SCHEMA.md) | Database schema and data model |

### Features & Specifications

| Document | Description |
|----------|-------------|
| [Disabled & Planned Features](specs/DISABLED_AND_PLANNED_FEATURES.md) | Feature flags and roadmap |
| [Style-Aware Suggestions](STYLE_AWARE_SUGGESTIONS_SPEC.md) | Mode A/B suggestions with style-aware copy |
| [Tailor Suggestions Roadmap](tailor-suggestions-roadmap.md) | Store preferences feature phases |
| [Scan Retention](scan-retention.md) | Recent scans persistence |
| [Winback Retention System](winback-retention-system.md) | User re-engagement strategy |
| [Paywall App Review Compliance](paywall-app-review-compliance.md) | RevenueCat paywall states and App Store submission guide |

### UI & UX

| Document | Description |
|----------|-------------|
| [Results Screen States](results-screen-states.md) | UI state machine and rendering rules |
| [Empty State Messaging](empty-state-messaging.md) | Empty state patterns and copy |
| [Outfit Selection Pipeline](outfit-selection-pipeline.md) | How outfits are assembled |

### Performance & Optimization

| Document | Description |
|----------|-------------|
| [Match Count Performance](match-count-performance.md) | Query optimization |
| [Image Analysis Caching](image-analysis-caching.md) | AI response caching strategy |

### Infrastructure

| Document | Description |
|----------|-------------|
| [Wardrobe Images Storage](wardrobe-images-storage-setup.md) | Supabase Storage configuration |

### Testing

| Document | Description |
|----------|-------------|
| [Testing Strategy](guides/TESTING_STRATEGY.md) | Overall testing approach |
| [Maestro Setup](guides/MAESTRO_SETUP.md) | E2E test framework setup |
| [Maestro Build Types](guides/MAESTRO_BUILD_TYPES.md) | iOS build configurations |
| [Match Count Performance](match-count-performance.md) | Includes test coverage section |

### Troubleshooting & Issues

| Document | Description |
|----------|-------------|
| [Known Issues](KNOWN_ISSUES.md) | Active issues, limitations, and workarounds |
| [Debug System](debug-system.md) | Development debugging tools |

### Handoff & Implementation Notes

| Document | Description |
|----------|-------------|
| [Wardrobe Retry Badge (No Flicker)](handoff/wardrobe-retry-badge-no-flicker.md) | Retry badge UX fix and implementation notes |

### Setup & Workflows

| Document | Description |
|----------|-------------|
| [Xcode Update Workflow](guides/XCODE_UPDATE_WORKFLOW.md) | Xcode version updates |
| [Multiple Simulators](guides/MULTIPLE_SIMULATORS.md) | Testing on multiple devices |

### Historical Reference

| Document | Description |
|----------|-------------|
| [Critical Fix: Store Preferences](historical/CRITICAL_FIX_STORE_PREFERENCES.md) | User-scoped storage bug fix |
| [Store Chip Truncation Fix](historical/STORE_CHIP_TRUNCATION_FIX.md) | UI truncation issue |
| [Local iOS Fix](historical/LOCAL_IOS_FIX.md) | iOS build issue resolution |
| [Metro Bundler Fix](historical/METRO_BUNDLER_FIX.md) | Build system fix |

---

## 🔍 Finding Documentation

### By Role

**Backend Developer:**
- Start with [Hybrid Schema](HYBRID_SCHEMA.md)
- Then [Confidence Engine](specs/CONFIDENCE_ENGINE.md)
- Review [Image Analysis Caching](image-analysis-caching.md)

**Frontend Developer:**
- Start with [Comprehensive System Documentation](../COMPREHENSIVE_SYSTEM_DOCUMENTATION.md)
- Then [Results Screen States](results-screen-states.md)
- Review [Style-Aware Suggestions](STYLE_AWARE_SUGGESTIONS_SPEC.md)

**QA Engineer:**
- Start with [Testing Strategy](guides/TESTING_STRATEGY.md)
- Then [Maestro Setup](guides/MAESTRO_SETUP.md)
- Review [Maestro Build Types](guides/MAESTRO_BUILD_TYPES.md)

**Product Manager:**
- Start with [README](../README.md)
- Then [Tailor Suggestions Roadmap](tailor-suggestions-roadmap.md)
- Review [Disabled & Planned Features](specs/DISABLED_AND_PLANNED_FEATURES.md)

### By Task

**Setting up the project:**
1. [README](../README.md)
2. [Comprehensive System Documentation](../COMPREHENSIVE_SYSTEM_DOCUMENTATION.md)
3. [Testing Strategy](guides/TESTING_STRATEGY.md)

**Understanding the matching system:**
1. [Comprehensive System Documentation](../COMPREHENSIVE_SYSTEM_DOCUMENTATION.md)
2. [Confidence Engine](specs/CONFIDENCE_ENGINE.md)
3. [Style-Aware Suggestions](STYLE_AWARE_SUGGESTIONS_SPEC.md)

**Adding new features:**
1. [Comprehensive System Documentation](../COMPREHENSIVE_SYSTEM_DOCUMENTATION.md)
2. [Results Screen States](results-screen-states.md)
3. [Disabled & Planned Features](specs/DISABLED_AND_PLANNED_FEATURES.md)

**Debugging issues:**
1. [Known Issues](KNOWN_ISSUES.md)
2. [Debug System](debug-system.md)
3. [Historical fixes](historical/) folder
4. [Testing Strategy](guides/TESTING_STRATEGY.md)

**Performance optimization:**
1. [Match Count Performance](match-count-performance.md)
2. [Image Analysis Caching](image-analysis-caching.md)
3. [Outfit Selection Pipeline](outfit-selection-pipeline.md)

---

## 📝 Documentation Conventions

### File Naming
- **Guides:** `UPPERCASE_WITH_UNDERSCORES.md`
- **Specs:** `UPPERCASE_WITH_UNDERSCORES.md`
- **Current docs:** `lowercase-with-dashes.md`
- **Historical:** `UPPERCASE_WITH_UNDERSCORES.md`

### Document Structure
All documentation should include:
1. **Title** - Clear, descriptive heading
2. **Overview** - Brief summary of the document
3. **Table of Contents** - For longer docs (optional)
4. **Main Content** - Well-organized with headings
5. **Examples** - Code snippets and scenarios where applicable
6. **Related Links** - Cross-references to other docs

### Code Examples
- Use triple backticks with language identifiers
- Include line numbers for references where helpful
- Show both correct and incorrect patterns when explaining rules

### Status Indicators
- ✅ Implemented/Complete
- ⚠️ Needs attention/Outdated
- 🔄 In progress
- 🧪 Experimental/Temporary
- ❌ Deprecated/Removed

---

## 🔄 Keeping Documentation Current

### When to Update
- **Immediately:** When architectural changes affect documented behavior
- **With feature:** When adding/removing features
- **Weekly:** Review for outdated information
- **Monthly:** Check for missing documentation

### How to Update
1. Identify affected documents using this navigation guide
2. Update content, code examples, and cross-references
3. Add entry to [CHANGELOG.md](../CHANGELOG.md)
4. Update this navigation guide if structure changes

### Deprecation Process
1. Add deprecation notice at top of document
2. Move to `docs/historical/` after 1 month
3. Update cross-references in other documents
4. Add removal note to CHANGELOG.md

---

## 📧 Questions or Suggestions?

If you can't find what you're looking for:
1. Check the [README](../README.md) for high-level overview
2. Search across all docs using your editor's global search
3. Review [CHANGELOG.md](../CHANGELOG.md) for recent changes
4. Ask the team or create an issue for missing documentation

---

**Last Updated:** January 30, 2026
