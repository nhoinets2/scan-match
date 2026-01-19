# Agent Guidelines

This document provides guidance for AI agents working on this codebase.

## Primary Reference

**See [CLAUDE.md](CLAUDE.md)** for detailed technical guidelines including:
- Tech stack and dependencies
- Project structure
- TypeScript conventions
- Routing patterns (Expo Router)
- State management (React Query, Zustand)
- Design principles
- Common mistakes to avoid
- Skills available in `.claude/skills/`

## Project Context

This is a React Native/Expo mobile app for AI-powered wardrobe matching:
- **Core Feature:** Scan clothing items, get AI-matched outfit suggestions
- **Backend:** Supabase (PostgreSQL + Storage + Auth)
- **AI:** OpenAI GPT-4 Vision for image analysis
- **Matching Engine:** Confidence Engine (deterministic rules-based scoring)

## Development Environment

You are working in **Vibecode**, which manages:
- Git operations automatically
- Dev server on port 8081
- Environment variables via ENV tab

**Do not:**
- Manually manage git
- Touch the dev server
- Ask users to interact with code/terminal (they're non-technical)

## Documentation Structure

Documentation is organized for easy navigation:

```
docs/
├── NAVIGATION.md        # Complete index (start here)
├── current/            # Active feature docs
├── historical/         # Completed fixes
├── guides/            # Setup guides
└── specs/             # Technical specs
```

**Key documents:**
- [docs/NAVIGATION.md](docs/NAVIGATION.md) - Documentation index
- [COMPREHENSIVE_SYSTEM_DOCUMENTATION.md](COMPREHENSIVE_SYSTEM_DOCUMENTATION.md) - System architecture
- [CHANGELOG.md](CHANGELOG.md) - Version history

## Agent Skills

Skills are available in `.claude/skills/`:
- `ai-apis-like-chatgpt/` - Using AI APIs (OpenAI, etc.)
- `expo-docs/` - Expo SDK module documentation
- `frontend-app-design/` - React Native UI design patterns

**Usage:** Read skill files before working with unfamiliar APIs or packages.

## Code Quality Standards

- **TypeScript:** Strict mode enabled, explicit type annotations
- **Testing:** Jest for unit tests, Maestro for E2E
- **Styling:** NativeWind + Tailwind (no inline styles except for unsupported components)
- **State:** React Query for server state, Zustand for local state
- **Routing:** Expo Router file-based routing

## Common Patterns

### State Management
```typescript
// Server state: React Query
const { data, isLoading } = useQuery({
  queryKey: ['wardrobe', userId],
  queryFn: fetchWardrobe
});

// Local state: Zustand with selectors
const userName = useStore(s => s.user.name);
```

### Error Handling
```typescript
// Use mutations for async operations
const mutation = useMutation({
  mutationFn: saveItem,
  onError: (error) => showToast(error.message)
});
```

### Navigation
```typescript
// File-based routing
router.push('/scan');
router.push('/results?itemId=123');
```

## Before Making Changes

1. **Read relevant documentation** from `docs/NAVIGATION.md`
2. **Check test files** in `src/**/__tests__/`
3. **Review recent git history** for context
4. **Test locally** before committing

## When Documenting Changes

1. Update affected documentation files
2. Add entry to [CHANGELOG.md](CHANGELOG.md)
3. Update `docs/NAVIGATION.md` if structure changes
4. Include code examples where helpful

---

**For detailed technical guidelines, see [CLAUDE.md](CLAUDE.md)**
