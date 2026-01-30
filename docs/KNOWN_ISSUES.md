# Known Issues

This document tracks known issues, limitations, and accepted behaviors in the SnapToMatch app.

## Active Issues

(None currently tracked)

---

## Resolved Issues

### Badge Update Timing (Wardrobe Screen) — Resolved 2026-01-30

**Issue**: Upload and style signals retry badges didn't update immediately after queue completion.

**Root Cause**:
- `WardrobeGridItem` used `React.memo` for performance
- Badge status read from module-level queue state
- Queue updates didn't trigger re-renders

**Resolution**:
- Added local retry state for immediate UI feedback
- Retry success now triggers background cache refresh

**Related Files**:
- `src/app/(tabs)/wardrobe.tsx`

---

## Limitations

(Intentional design limitations that are not bugs)
