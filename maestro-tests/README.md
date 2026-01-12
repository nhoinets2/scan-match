# Maestro Tests

This directory contains Maestro UI tests for the vibecode app.

## Running Tests

### Prerequisites
1. App must be built and installed in the simulator
2. Metro bundler should be running (`npm start`)
3. Maestro CLI must be installed

### Run All Tests
```bash
maestro test maestro-tests/
```

### Run Specific Test
```bash
maestro test maestro-tests/example.yaml
```

### Run Without Launching App (if app is already running)
```bash
maestro test maestro-tests/ --no-launch
```

## Test Files

- `example.yaml` - Basic example test checking login screen
- `login-basic.yaml` - Login screen verification test

## Creating New Tests

1. Create a new `.yaml` file in this directory
2. Start with:
   ```yaml
   appId: com.anonymous.vibecode
   ---
   - launchApp
   ```
3. Add test steps using Maestro commands
4. See [Maestro Documentation](https://maestro.mobile.dev/) for available commands

## App Bundle ID

The app bundle identifier is: `com.anonymous.vibecode`

Make sure this matches your `app.json` configuration.

