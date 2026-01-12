# CI/CD Recommendation

## Recommended Solution: EAS Build + GitHub Actions

### Why This Combination?

**EAS Build for:**
- ✅ iOS/Android builds (handles certificates, provisioning profiles)
- ✅ App Store/Play Store submissions
- ✅ Works with any Git hosting (no GitHub required)
- ✅ Expo-native solution
- ✅ Handles native dependencies automatically

**GitHub Actions for:**
- ✅ Running test suites (Jest, Maestro, Loki)
- ✅ Type checking and linting
- ✅ Fast feedback on code quality
- ✅ Free for private repos (up to 2000 minutes/month)
- ✅ Well-documented and widely used

## Setup Steps

### Step 1: Mirror Repository to GitHub (Private)

1. **Create a private GitHub repository**
   - Name it something like `vibecode-app` or `fitmatch-app`
   - Keep it private

2. **Add GitHub as a remote:**
   ```bash
   # In your current repo (git.vibecodeapp.com)
   git remote add github https://github.com/your-username/your-repo.git
   ```

3. **Push to GitHub:**
   ```bash
   git push github main
   ```

4. **Set up automatic mirroring** (optional):
   - Use GitHub Actions to auto-push from your main repo
   - Or manually push when needed

### Step 2: Set Up EAS Build

1. **Install EAS CLI:**
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo:**
   ```bash
   eas login
   ```

3. **Configure EAS:**
   ```bash
   eas build:configure
   ```

4. **Set up credentials:**
   ```bash
   # iOS (one-time setup)
   eas credentials
   
   # Android (one-time setup)
   eas credentials --platform android
   ```

### Step 3: Set Up GitHub Actions

The workflow files are already created (`.github/workflows/test.yml` and `build.yml`).

1. **Push workflow files to GitHub:**
   ```bash
   git add .github/
   git commit -m "Add CI/CD workflows"
   git push github main
   ```

2. **Add secrets in GitHub:**
   - Go to: Settings → Secrets and variables → Actions
   - Add: `EXPO_TOKEN` (get from `eas whoami`)

### Step 4: Create EAS Build Workflow

Create `.github/workflows/eas-build.yml`:

```yaml
name: EAS Build

on:
  push:
    branches: [main]
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    name: Build with EAS
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Setup EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Install dependencies
        run: npm install --legacy-peer-deps

      - name: Build iOS
        run: eas build --platform ios --profile preview --non-interactive

      - name: Build Android
        run: eas build --platform android --profile preview --non-interactive
```

## Workflow Overview

```
Developer pushes code
        ↓
GitHub Actions runs:
  - Jest tests (2 min)
  - TypeScript check (1 min)
  - ESLint (1 min)
  - Maestro tests (10 min)
        ↓
If tests pass → EAS Build:
  - iOS build
  - Android build
        ↓
Builds available for download/testing
```

## Alternative: EAS Build Only (Simpler)

If you want **one solution** and don't need automated testing:

### Pros:
- ✅ One platform (EAS)
- ✅ No GitHub needed
- ✅ Simpler setup
- ✅ Handles builds + submissions

### Cons:
- ❌ No automated test running
- ❌ Tests run manually
- ❌ Less integration

### Setup:
```bash
# Just use EAS Build
eas build:configure
eas build --platform ios --profile preview
```

## Cost Comparison

### EAS Build + GitHub Actions:
- **GitHub Actions:** Free (2000 min/month for private repos)
- **EAS Build:** Free tier (limited builds/month), then paid
- **Total:** ~$0-50/month depending on build volume

### EAS Build Only:
- **EAS Build:** Free tier, then paid
- **Total:** ~$0-50/month

## My Recommendation

**Go with EAS Build + GitHub Actions** because:

1. **You already have test suites** (Jest, Maestro) - automate them
2. **Fast feedback** - know if code breaks before building
3. **Free for testing** - GitHub Actions free tier is generous
4. **EAS handles the hard parts** - certificates, provisioning, builds
5. **Best of both worlds** - testing automation + build automation

## Quick Start

1. **Create GitHub repo** (private)
2. **Mirror your code** to GitHub
3. **Set up EAS:** `eas build:configure`
4. **Push workflows** to GitHub
5. **Add EXPO_TOKEN** secret
6. **Done!** CI/CD is running

## Questions?

- **Q: Do I need to pay for GitHub?**  
  A: No, private repos are free. Actions have a free tier.

- **Q: Can I use GitLab instead?**  
  A: Yes, but GitHub Actions is more popular and better documented.

- **Q: What if I don't want to mirror to GitHub?**  
  A: Use EAS Build only, or set up self-hosted runners.

- **Q: How often should builds run?**  
  A: On every push to `main`, or manually via `workflow_dispatch`.

---

**Bottom line:** EAS Build + GitHub Actions gives you the best automation with minimal setup.

