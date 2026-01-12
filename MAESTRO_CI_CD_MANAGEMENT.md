# Managing Maestro Tests in CI/CD

## Overview

This guide explains how to manage your Maestro E2E tests that run automatically in GitHub Actions CI/CD.

## ⚠️ Important: Local vs CI/CD Testing

### CI/CD (GitHub Actions)
- ✅ **No Xcode needed** - Runs automatically on GitHub's servers
- ✅ **No local setup** - Just push code, tests run automatically
- ✅ **Consistent device** - Always uses iPhone 16 Pro
- ✅ **Good for:** Automated checks, regression testing

### Local Testing
- ⚠️ **Xcode required** - You need Xcode installed locally
- ⚠️ **Simulators required** - Need to install simulators in Xcode
- ✅ **Flexible devices** - Test on any device you want
- ✅ **Good for:** Development, debugging, testing multiple devices

**Bottom line:** CI/CD runs automatically without Xcode. For local testing on different devices, you still need Xcode and simulators.

---

## 📱 Device Configuration

### Current Setup

**Yes, tests currently run only on iPhone 16 Pro** (with fallback to iPhone 16 if 16 Pro isn't available).

The workflow automatically:
1. Finds an available iPhone 16 Pro simulator (any iOS version)
2. Falls back to iPhone 16 if 16 Pro isn't found
3. Boots the simulator
4. Installs your app
5. Runs all Maestro tests

### Why iPhone 16 Pro?

- ✅ **Available on GitHub Actions runners** (macOS latest)
- ✅ **Modern device** (good for testing current iOS features)
- ✅ **Consistent** (same device every time = reliable tests)

### Change the Device

If you want to test on a different device, edit `.github/workflows/test.yml`:

```yaml
# Line 117: Change the build destination
-destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=latest' \

# Line 127: Change the device search
DEVICE_UUID=$(xcrun simctl list devices available | grep "iPhone 16 Pro" | head -1 | grep -o '[A-F0-9-]\{36\}' | head -1)
```

**Available devices on GitHub Actions:**
- iPhone 16, iPhone 16 Plus, iPhone 16 Pro, iPhone 16 Pro Max
- iPhone 17, iPhone 17 Pro, iPhone 17 Pro Max
- iPhone SE (3rd generation)
- iPad models (if you want to test iPad)

---

## 📁 Test File Structure

### Current Setup

Maestro tests are located in: `maestro-tests/`

```
maestro-tests/
├── flows/
│   ├── scan-item-flow.yaml
│   ├── results-high-state.yaml
│   ├── results-medium-state.yaml
│   └── results-low-state.yaml
├── fixtures/
│   └── (deep-link fixtures)
└── smoke/
    └── critical-paths.yaml
```

### How CI/CD Runs Tests

The workflow runs:
```bash
maestro test maestro-tests/ --device-id "$DEVICE_UUID"
```

This runs **all test files** in the `maestro-tests/` directory recursively.

---

## 🛠️ Managing Tests

### Add New Tests

1. **Create a new test file** in `maestro-tests/`:
   ```bash
   # Create a new test
   touch maestro-tests/flows/my-new-test.yaml
   ```

2. **Write your test** (see Maestro docs for syntax):
   ```yaml
   appId: com.anonymous.vibecode
   ---
   - launchApp
   - assertVisible: "Welcome"
   - tapOn: "Get Started"
   ```

3. **Commit and push:**
   ```bash
   git add maestro-tests/flows/my-new-test.yaml
   git commit -m "Add new Maestro test"
   git push origin main
   ```

4. **CI/CD will automatically run it** on the next push!

### Remove Tests

1. **Delete the test file:**
   ```bash
   rm maestro-tests/flows/old-test.yaml
   ```

2. **Commit and push:**
   ```bash
   git add maestro-tests/
   git commit -m "Remove old test"
   git push origin main
   ```

### Run Specific Tests Only

**Option 1: Organize by folders**

Create subdirectories and run only specific ones:
```yaml
# In .github/workflows/test.yml, change line 159:
maestro test maestro-tests/flows/ --device-id "$DEVICE_UUID"
# Only runs tests in flows/ folder
```

**Option 2: Use test tags** (if Maestro supports it)

**Option 3: Create separate workflow jobs**

Add multiple Maestro jobs for different test suites:
```yaml
# In .github/workflows/test.yml
jobs:
  maestro-smoke:
    name: Maestro Smoke Tests
    # ... same setup ...
    - name: Run Maestro tests
      run: maestro test maestro-tests/smoke/ --device-id "$DEVICE_UUID"
  
  maestro-flows:
    name: Maestro Flow Tests
    # ... same setup ...
    - name: Run Maestro tests
      run: maestro test maestro-tests/flows/ --device-id "$DEVICE_UUID"
```

### Skip Tests Temporarily

**Option 1: Comment out the step**
```yaml
# - name: Run Maestro tests
#   run: |
#     export PATH="$PATH:$HOME/.maestro/bin"
#     maestro test maestro-tests/ --device-id "$DEVICE_UUID" || true
```

**Option 2: Use workflow conditions**
```yaml
- name: Run Maestro tests
  if: github.event_name != 'push'  # Only run on PRs
  run: |
    maestro test maestro-tests/ --device-id "$DEVICE_UUID" || true
```

**Option 3: Move test files temporarily**
```bash
mkdir maestro-tests-disabled
mv maestro-tests/* maestro-tests-disabled/
```

---

## 🎯 Test Organization Best Practices

### Recommended Structure

```
maestro-tests/
├── smoke/              # Critical paths (run first, fastest)
│   ├── app-launch.yaml
│   └── basic-navigation.yaml
├── flows/              # Complete user journeys
│   ├── scan-item-flow.yaml
│   ├── wardrobe-management.yaml
│   └── results-screen-flows.yaml
├── regression/         # Bug regression tests
│   └── fixed-bugs.yaml
└── fixtures/          # Test data and deep-link helpers
    └── test-data.yaml
```

### Run Tests in Order

Maestro runs tests in alphabetical order. Use prefixes to control order:
```
01-smoke-tests.yaml
02-basic-flows.yaml
03-complex-flows.yaml
```

---

## 🔍 Debugging Failed Tests

### View Test Results

1. **Go to GitHub Actions:**
   - https://github.com/nhoinets2/vibecode-app/actions
   - Click on the failed workflow run
   - Click on "Maestro E2E Tests (iOS)" job
   - Expand "Run Maestro tests" step

2. **Check the logs:**
   - Look for which test file failed
   - See the exact error message
   - Check simulator logs if available

### Common Issues

**Issue: Test times out**
```yaml
# Add timeout to your test
- waitForVisible:
    id: "element"
    timeout: 5000  # 5 seconds
```

**Issue: Element not found**
- Check if the element ID/selector is correct
- Verify the app state before the assertion
- Add a wait before the assertion

**Issue: Simulator not ready**
- The workflow already waits 10 seconds
- If still failing, increase the wait time in the workflow

### Run Tests Locally to Debug

**Option 1: Using the helper script (Easiest)**

```bash
# Test on iPhone 15 Pro
./scripts/test-maestro-device.sh "iPhone 15 Pro"

# Test on iPhone 16
./scripts/test-maestro-device.sh "iPhone 16"

# Test on iPad
./scripts/test-maestro-device.sh "iPad (10th generation)"

# List available devices first
xcrun simctl list devices available
```

The script automatically:
- Finds the device
- Boots the simulator
- Builds the app (if needed)
- Installs the app
- Runs Maestro tests

**Option 2: Manual steps**

```bash
# 1. List available devices
xcrun simctl list devices available

# 2. Boot a specific simulator
xcrun simctl boot "iPhone 15 Pro"

# 3. Build and run app
npm start
# In another terminal:
npx expo run:ios --device "iPhone 15 Pro"

# 4. Get device UUID
DEVICE_UUID=$(xcrun simctl list devices | grep "iPhone 15 Pro" | grep -o '[A-F0-9-]\{36\}' | head -1)

# 5. Run Maestro tests
maestro test maestro-tests/ --device-id "$DEVICE_UUID"

# Or run specific test
maestro test maestro-tests/flows/my-test.yaml --device-id "$DEVICE_UUID"

# Or run with verbose output
maestro test maestro-tests/ --device-id "$DEVICE_UUID" --verbose
```

**Note:** You need Xcode installed and simulators downloaded to test locally on different devices.

---

## ⚙️ Workflow Configuration

### Current Settings

**When tests run:**
- ✅ On push to `main` branch
- ✅ On pull requests to `main` or `develop`
- ❌ NOT on push to `develop` (only PRs)

**Test behavior:**
- ✅ Tests can fail without blocking the workflow (`continue-on-error: true`)
- ✅ All tests in `maestro-tests/` are run
- ✅ Tests run on iPhone 16 Pro simulator

### Change When Tests Run

Edit `.github/workflows/test.yml` line 85:

```yaml
# Current: Only on PRs and main branch
if: github.event_name == 'pull_request' || github.ref == 'refs/heads/main'

# Run on all pushes:
if: true

# Run only on main branch:
if: github.ref == 'refs/heads/main'

# Run on specific branches:
if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
```

### Make Tests Block the Workflow

Edit `.github/workflows/test.yml` line 160:

```yaml
# Current: Tests don't block (continue-on-error: true)
continue-on-error: true

# Make tests block the workflow:
# Remove the continue-on-error line, or set to false
continue-on-error: false
```

### Run Tests on Multiple Devices

Add multiple jobs for different devices:

```yaml
jobs:
  maestro-ios-iphone16:
    name: Maestro Tests (iPhone 16)
    # ... setup ...
    - destination 'platform=iOS Simulator,name=iPhone 16,OS=latest' \
  
  maestro-ios-ipad:
    name: Maestro Tests (iPad)
    # ... setup ...
    - destination 'platform=iOS Simulator,name=iPad (10th generation),OS=latest' \
```

---

## 📊 Test Reports

### View Test Results

1. **GitHub Actions UI:**
   - Go to Actions tab
   - Click on workflow run
   - See pass/fail status

2. **Maestro Cloud** (if configured):
   - Maestro can upload results to their cloud
   - Requires Maestro Cloud account

### Add Test Reporting

You can add test result artifacts:

```yaml
- name: Upload test results
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: maestro-test-results
    path: maestro-tests/results/
    retention-days: 7
```

---

## 🚀 Performance Tips

### Speed Up Tests

1. **Run only smoke tests on PRs:**
   ```yaml
   - name: Run Maestro tests
     run: |
       if [ "${{ github.event_name }}" == "pull_request" ]; then
         maestro test maestro-tests/smoke/ --device-id "$DEVICE_UUID"
       else
         maestro test maestro-tests/ --device-id "$DEVICE_UUID"
       fi
   ```

2. **Parallel test execution:**
   - Create multiple jobs for different test suites
   - Run them in parallel

3. **Skip slow tests:**
   - Move slow tests to a separate folder
   - Run them only on main branch

### Optimize Test Files

- Keep tests focused (one flow per file)
- Use deep-link fixtures to skip setup
- Avoid unnecessary waits
- Use efficient selectors

---

## 📝 Quick Reference

### Add a Test
```bash
# 1. Create test file
touch maestro-tests/flows/my-test.yaml

# 2. Write test (see Maestro docs)
# 3. Commit and push
git add maestro-tests/
git commit -m "Add test"
git push origin main
```

### Remove a Test
```bash
rm maestro-tests/flows/old-test.yaml
git add maestro-tests/
git commit -m "Remove test"
git push origin main
```

### Run Tests Locally
```bash
# Start app first
npm start
# In another terminal:
maestro test maestro-tests/
```

### Check Test Status
```bash
# View GitHub Actions
open https://github.com/nhoinets2/vibecode-app/actions
```

### Change Device
Edit `.github/workflows/test.yml`:
- Line 117: Build destination
- Line 127: Device search

---

## ❓ FAQ

**Q: Can I test on Android in CI/CD?**
A: Yes! Create a separate job for Android. You'll need to build Android app and use Android emulator.

**Q: Can I run tests on multiple iOS versions?**
A: Yes, create multiple jobs with different OS versions in the destination.

**Q: How do I skip a test temporarily?**
A: Move it to a different folder or rename it (e.g., `my-test.yaml.skip`).

**Q: Can I run tests only on specific branches?**
A: Yes, modify the `if:` condition in the workflow.

**Q: How long do tests take?**
A: Depends on your tests. Typically 5-15 minutes for a full suite.

---

## 🔗 Related Documentation

- **`MAESTRO_SETUP.md`** - Local Maestro setup
- **`TESTING_STRATEGY.md`** - Overall testing approach
- **`CI_CD_GUIDE.md`** - Complete CI/CD guide
- **Maestro Docs:** https://maestro.mobile.dev/

