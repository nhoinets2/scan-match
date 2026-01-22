# Changelog Editing Rules

**IMPORTANT**: These rules apply when editing `/home/user/workspace/CHANGELOG.md`

**NOTE**: This project follows [Keep a Changelog](https://keepachangelog.com/) format with semantic versioning.

## HARD RULES (MUST FOLLOW)

1. **NEVER modify existing entries**: Do NOT modify, delete, reorder, or rewrap any existing text under any version section
2. **Version format**: Changes go in `## [Unreleased]` section until a release is made
3. **Category order**: Keep categories in standard order (Security, Added, Changed, Deprecated, Removed, Fixed, Improved, Technical)
4. **Update existing section**: Add new entries to appropriate category in `[Unreleased]`, don't duplicate categories
5. **Preserve formatting**: Keep exact Markdown style (##, ###, -, blank lines)

## File Structure

```
# Changelog

## [Today's Date]

### [Category]
- **[Feature/Fix name]**: [Description]

### [Category]
- **[Feature/Fix name]**: [Description]

## [Previous Date]

### [Category]
...
```

## Categories (in this order per Keep a Changelog)

1. **Security** - Security improvements, vulnerability fixes (always first!)
2. **Added** - New features, capabilities, or UI elements
3. **Changed** - Behavior changes, breaking changes
4. **Deprecated** - Features that will be removed in future versions
5. **Removed** - Removed features or files
6. **Fixed** - Bug fixes, error corrections
7. **Improved** - Performance improvements, UX enhancements (custom category for our project)
8. **Technical** - Infrastructure, migrations, refactoring (custom category for our project)

## Writing Guidelines

### Format
```markdown
- **[Feature name]**: [One clear sentence describing what changed and why]
```

### Style
- **Be specific**: "Fixed navigation loop in password reset flow" not "Fixed bug"
- **User-focused**: Describe impact, not implementation details
- **Past tense**: "Fixed", "Added", "Improved" (not "Fixes", "Fix", "Fixing")
- **Bold the subject**: Use `**Subject**:` to highlight what changed
- **One change per bullet**: Don't combine multiple fixes in one bullet

### Examples

✅ Good:
```markdown
- **Camera permission flow**: Added pre-prompt screen before iOS system dialog to improve permission grant rates and comply with App Store guidelines
- **Post-denial Settings navigation**: Fixed issue where post-denial screen appeared after user returned from Settings with permission granted
```

❌ Bad:
```markdown
- Fixed camera stuff
- Updated permission handling, improved UX, and refactored code
```

## Step-by-Step Process

When asked to update the changelog:

1. **Read current file**
   ```bash
   Read /home/user/workspace/CHANGELOG.md
   ```

2. **Determine today's date** (from system context)
   - Format: "## Month Day, Year"
   - Example: "## January 21, 2026"

3. **Check if today's section exists**
   - If YES: Add to existing section under appropriate category
   - If NO: Create new section at TOP of file (line 3, after "# Changelog" and blank line)

4. **Categorize changes**
   - Assign each change to correct category
   - Create category heading if it doesn't exist in today's section
   - Keep categories in standard order (Added, Fixed, Improved, Changed, Security, Technical)

5. **Format entries**
   - Use bold for feature/fix name: `**Name**: Description`
   - One change per bullet point
   - Clear, user-focused descriptions

6. **Make the edit**
   - Use StrReplace tool
   - Include enough context to be unique
   - Never modify existing dated sections

## Common Mistakes to Avoid

❌ **Don't modify old entries**
```diff
# Wrong - modifying January 20 entry
- **Password reset**: Fixed bug
+ **Password reset flow**: Fixed navigation loop bug
```

✅ **Do add new entry**
```diff
## January 21, 2026

### Improved
- **Password reset flow**: Enhanced error messaging with user-friendly copy
```

❌ **Don't create duplicate dates**
```markdown
## January 21, 2026
...
## January 21, 2026
...
```

✅ **Do append to existing date**
```markdown
## January 21, 2026

### Added
- First change

### Fixed
- Second change (added later)
```

❌ **Don't use vague descriptions**
```markdown
- Fixed bug in camera
- Improved performance
```

✅ **Do be specific**
```markdown
- **Camera permission UX**: Added pre-prompt screen before system dialog
- **Image upload performance**: Reduced wardrobe add latency by 150ms
```

## Example Edit

**Task**: Add two changes for January 21, 2026:
1. Camera permission pre-prompt (Added)
2. Post-denial screen bug (Fixed)

**Current file** (line 3):
```markdown
# Changelog

## January 20, 2026

### Fixed
...
```

**Correct edit**:
```markdown
# Changelog

## January 21, 2026

### Added
- **Camera permission pre-prompt**: Added custom pre-prompt screen before iOS system permission dialog to improve grant rates and comply with App Store Review Guidelines

### Fixed
- **Post-denial Settings navigation**: Fixed issue where post-denial screen appeared when user returned from Settings after granting camera permission. Now properly detects permission state with retry backoff and shows camera immediately.

## January 20, 2026

### Fixed
...
```

## Technical Notes

- File location: `/home/user/workspace/CHANGELOG.md`
- Format: [Keep a Changelog](https://keepachangelog.com/)
- Versioning: [Semantic Versioning](https://semver.org/)
- Backup exists: `/home/user/workspace/CHANGELOG.md` (markdown version, may have different format)
- Use StrReplace tool for edits
- Include 3-5 lines of context before and after to ensure unique match
- NEVER use replace_all=true for changelog edits

## When NOT to Edit Changelog

- Trivial changes (typo fixes, comment updates)
- Work in progress / incomplete features
- Internal refactoring with no user-facing impact (unless specifically requested)
- Changes already documented in previous entries

## Verification Checklist

Before completing changelog edit, verify:

- [ ] New entry is under today's date (or today's date section created)
- [ ] Today's section is at the TOP of the file
- [ ] No existing entries were modified
- [ ] Change is in correct category
- [ ] Description is user-focused and specific
- [ ] Formatting matches existing style (bold, bullets, blank lines)
- [ ] No duplicate date sections exist
