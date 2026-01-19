# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Documentation reorganization** with dedicated folders for historical, guides, and specs
- **docs/NAVIGATION.md** - Comprehensive documentation index with role and task-based navigation
- **CHANGELOG.md** - Proper changelog following semantic versioning
- **DOCUMENTATION_REORGANIZATION_SUMMARY.md** - Complete summary of reorganization changes
- Updated **docs/README.md** with quick access links and structure overview
- Enhanced **AGENTS.md** with project context, development guidelines, and documentation links

### Changed
- **Updated COMPREHENSIVE_SYSTEM_DOCUMENTATION.md** - Removed outdated "More Options CTA" and "NearMatchesSheet" references
- **Updated COMPREHENSIVE_SYSTEM_DOCUMENTATION.md** - Reflected current tabs architecture ("Wear now" / "Worth trying")
- **Updated README.md** - Added documentation section with links to new structure
- **Moved 4 completed fix docs** to `docs/historical/` (store preferences, chip truncation, iOS fix, Metro bundler)
- **Moved 11 setup guides** to `docs/guides/` (CI/CD, Maestro, testing, Xcode workflows)
- **Moved 4 technical specs** to `docs/specs/` (confidence engine, MODE_A suggestions, features)
- **Moved REFUND_POLICY.md** to `docs/`

### Removed
- **Temporary debug files** (DEBUG_SNAPSHOT_SETUP.md, DEBUG_SNAPSHOT_REMOVAL.md)
- **Redundant MODE_A docs** (MODE_A_FILTERING_EXPLAINED.md, CATEGORY_SPECIFIC_TEMPLATES_EXPLAINED.md, PHASE3_RULE_3_2_EXPLAINED.md)
- **Unhelpful changelog.txt** - Replaced with proper CHANGELOG.md

### Summary
- **Before:** ~40 markdown files scattered across root and docs/
- **After:** 5 files in root + organized docs/ structure (87.5% reduction)
- **Total files moved:** 19
- **Total files deleted:** 7
- **Total files created/updated:** 8
- **Result:** Clear navigation, no redundancy, easy to find information by role/task

## [1.0.0] - 2026-01

### Major Features
- Confidence Engine for outfit matching
- AI-powered clothing analysis with OpenAI
- Wardrobe management with image storage
- Results screen with "Wear now" / "Worth trying" tabs
- Store preferences for future shopping suggestions
- Mode A and Mode B styling suggestions
- Authentication with email/password and Apple Sign-In

### Infrastructure
- Supabase backend integration
- React Query for server state management
- NativeWind + Tailwind for styling
- Expo SDK 53 / React Native 0.79
- CI/CD with GitHub Actions and EAS Build

---

## Documentation Structure

The project documentation is now organized as follows:

```
docs/
├── current/              # Active feature documentation (in docs/)
├── historical/           # Completed fixes and old architecture
├── guides/              # Setup and workflow guides
└── specs/               # Technical specifications

Root documentation:
├── README.md            # Project overview
├── CHANGELOG.md         # This file
├── COMPREHENSIVE_SYSTEM_DOCUMENTATION.md  # Complete system guide
└── REFUND_POLICY.md     # App Store refund policy
```

See `docs/README.md` for navigation and file index.
