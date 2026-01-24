# Version History

This file tracks production releases with their commit references for rollback purposes.

> **Need to rollback?** Contact the Vibecode team with the commit hash of the version you want to restore.

---

## Production Releases

### v1.0.0 — Initial Production Release
- **Status:** ✅ Live in Production
- **Released:** January 2025
- **Commit:** `1c05408`
- **Branch:** main

**Key Features:**
- Confidence Engine for outfit matching
- AI-powered clothing analysis with OpenAI
- Wardrobe management with image storage
- Results screen with "Wear now" / "Worth trying" tabs
- Store preferences for shopping suggestions
- Authentication (email/password + Apple Sign-In)
- Supabase backend, React Query, NativeWind

**Critical Fixes Included:**
- Subscription data leakage fix (accounts no longer share subscription status)
- Post-upgrade flow fix (no longer stuck on limit screen)
- OpenAI API key moved server-side

---

## How to Use This File

1. **Before starting major changes:** Note the current commit hash as your "safe" version
2. **After a successful release:** Add a new entry here with the commit hash
3. **If something breaks:** Reference the commit hash to rollback

### Getting Current Commit Hash
The most recent commit is always visible in git status at the top of Claude Code conversations.

---

## Upcoming / In Development

### v1.1.0 (Planned)
- **Status:** 🚧 In Development
- **Branch:** main
- **Changes:** See [CHANGELOG.md](./CHANGELOG.md) under `[Unreleased]`

---

## Archive

_Previous versions that are no longer supported will be moved here._
