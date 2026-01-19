# SnapToMatch

A wardrobe matching app that helps users coordinate outfits using AI-powered analysis.

## Features

- **Wardrobe Management**: Add and organize clothing items with photos
- **AI Outfit Matching**: Scan items to get style recommendations
- **Results Analysis**: View detailed outfit compatibility scores
- **User Preferences**: Customize style preferences and favorite stores
- **Authentication**: Secure login with email/password and Apple Sign-In

## Tech Stack

- Expo SDK 53 / React Native 0.79
- Expo Router (file-based routing)
- React Query for server state
- NativeWind + Tailwind for styling
- Supabase for backend
- OpenAI for AI analysis

## Project Structure

```
src/
├── app/              # Expo Router file-based routes
│   ├── (tabs)/       # Tab navigation screens
│   ├── _layout.tsx   # Root layout with providers
│   ├── login.tsx     # Auth screen
│   ├── scan.tsx      # Camera scanning
│   ├── results.tsx   # Match results
│   └── ...           # Other screens
├── components/       # Reusable UI components
└── lib/              # Utilities, hooks, and services
    ├── auth-context.tsx
    ├── design-tokens.ts
    ├── openai.ts
    ├── supabase.ts
    └── confidence-engine/
```

## Environment Variables

The app requires environment variables for:
- Supabase connection
- OpenAI API key

Use the ENV tab in Vibecode to configure these.

## Documentation

Comprehensive documentation is available:

- **[docs/NAVIGATION.md](docs/NAVIGATION.md)** - Complete documentation index
- **[COMPREHENSIVE_SYSTEM_DOCUMENTATION.md](COMPREHENSIVE_SYSTEM_DOCUMENTATION.md)** - System architecture guide
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and changes

Documentation is organized into:
- `docs/` - Active feature documentation
- `docs/historical/` - Completed fixes and legacy info
- `docs/guides/` - Setup and workflow guides  
- `docs/specs/` - Technical specifications
