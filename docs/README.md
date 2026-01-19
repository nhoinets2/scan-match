# Documentation

Welcome to the project documentation! This directory contains detailed guides, specifications, and references organized by category.

## 🗺️ Start Here

**[📚 NAVIGATION.md](./NAVIGATION.md)** - Complete documentation index with guides for finding what you need by role or task.

---

## 📁 Directory Structure

```
docs/
├── NAVIGATION.md          # Complete documentation index (start here!)
├── current/              # Active feature documentation
├── historical/           # Completed fixes and legacy information
├── guides/              # Setup and workflow guides
└── specs/               # Technical specifications
```

---

## Quick Access

### Most Common Documents

- [**System Overview**](../COMPREHENSIVE_SYSTEM_DOCUMENTATION.md) - How everything works together
- [**Confidence Engine**](specs/CONFIDENCE_ENGINE_DOCUMENTATION.md) - Matching algorithm details
- [**Results Screen States**](results-screen-states.md) - UI state machine
- [**Testing Strategy**](guides/TESTING_STRATEGY.md) - How to test the app
- [**Fresh Setup**](guides/FRESH_SETUP.md) - Getting started

### By Category

| Category | Quick Links |
|----------|-------------|
| **Architecture** | [System Docs](../COMPREHENSIVE_SYSTEM_DOCUMENTATION.md) • [Engine](specs/CONFIDENCE_ENGINE_DOCUMENTATION.md) • [Schema](HYBRID_SCHEMA.md) |
| **Features** | [Suggestions](specs/MODE_A_SUGGESTIONS_EXPLAINED.md) • [Roadmap](specs/DISABLED_AND_PLANNED_FEATURES.md) • [Tailor](tailor-suggestions-roadmap.md) |
| **UI/UX** | [Results States](results-screen-states.md) • [Empty States](empty-state-messaging.md) • [Copy](STYLE_AWARE_SUGGESTIONS_SPEC.md) |
| **Testing** | [Strategy](guides/TESTING_STRATEGY.md) • [Maestro](guides/MAESTRO_SETUP.md) • [CI/CD](guides/CI_CD_GUIDE.md) |
| **Setup** | [Fresh Setup](guides/FRESH_SETUP.md) • [Workflows](guides/REMOTE_LOCAL_WORKFLOW.md) • [Xcode](guides/XCODE_GIT_WORKFLOW.md) |

---

## 🔍 Finding What You Need

### By Role
- **Backend Developer:** [Schema](HYBRID_SCHEMA.md) → [Engine](specs/CONFIDENCE_ENGINE_DOCUMENTATION.md) → [Caching](image-analysis-caching.md)
- **Frontend Developer:** [System Docs](../COMPREHENSIVE_SYSTEM_DOCUMENTATION.md) → [Results States](results-screen-states.md) → [Copy](STYLE_AWARE_SUGGESTIONS_SPEC.md)
- **QA Engineer:** [Testing Strategy](guides/TESTING_STRATEGY.md) → [Maestro](guides/MAESTRO_SETUP.md) → [CI/CD](guides/CI_CD_GUIDE.md)
- **Product Manager:** [README](../README.md) → [Roadmap](tailor-suggestions-roadmap.md) → [Features](specs/DISABLED_AND_PLANNED_FEATURES.md)

### By Task
- **Setting up:** [Fresh Setup](guides/FRESH_SETUP.md) → [README](../README.md) → [CI/CD](guides/CI_CD_GUIDE.md)
- **Understanding matching:** [System Docs](../COMPREHENSIVE_SYSTEM_DOCUMENTATION.md) → [Engine](specs/CONFIDENCE_ENGINE_DOCUMENTATION.md) → [Suggestions](specs/MODE_A_SUGGESTIONS_EXPLAINED.md)
- **Adding features:** [System Docs](../COMPREHENSIVE_SYSTEM_DOCUMENTATION.md) → [Results States](results-screen-states.md) → [Features](specs/DISABLED_AND_PLANNED_FEATURES.md)
- **Debugging:** [Debug System](debug-system.md) → [Historical Fixes](historical/) → [Testing](guides/TESTING_STRATEGY.md)

---

**For complete navigation and detailed index, see [NAVIGATION.md](./NAVIGATION.md)**
