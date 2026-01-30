# Claude Migration - Manual Test Cases

**Date:** January 30, 2026  
**Purpose:** Verify Claude Sonnet 4.5 migration and parallel style signals optimization  
**Prerequisite:** Cache invalidation deployed (commit `90364e2`)

---

## Test Environment Setup

Before testing:
1. Ensure you're using the latest app build
2. Clear app cache if needed (Settings > Clear Cache)
3. Have at least 3-5 wardrobe items for matching tests
4. Have scan quota available

---

## Section 1: Image Analysis (analyze-image)

### Test 1.1: Basic Scan Analysis
**Purpose:** Verify Claude returns valid clothing analysis

**Steps:**
1. Open the app
2. Tap "Scan" button
3. Take a photo of a clothing item (e.g., a t-shirt)
4. Wait for analysis to complete

**Expected Results:**
- [ ] Analysis completes within 5 seconds (vs ~8s before)
- [ ] Category is correctly identified (tops, bottoms, etc.)
- [ ] Colors are detected and displayed
- [ ] Style tags appear (e.g., "casual", "minimal")
- [ ] No error messages

**Notes:** Record actual latency: ______ seconds

---

### Test 1.2: Wardrobe Add Analysis
**Purpose:** Verify Claude works for adding items to wardrobe

**Steps:**
1. Open the app
2. Go to Wardrobe tab
3. Tap "+" to add new item
4. Take a photo or select from gallery
5. Wait for analysis

**Expected Results:**
- [ ] Analysis completes within 5 seconds
- [ ] Category correctly identified
- [ ] Colors detected
- [ ] Item saves to wardrobe successfully
- [ ] Item appears in wardrobe list

**Notes:** Record actual latency: ______ seconds

---

### Test 1.3: Multiple Categories
**Purpose:** Verify Claude handles different clothing types

**Test each category:**

| Category | Item Example | Category Correct? | Colors Correct? | Latency |
|----------|--------------|-------------------|-----------------|---------|
| Tops | T-shirt | [ ] | [ ] | ___s |
| Bottoms | Jeans | [ ] | [ ] | ___s |
| Dresses | Summer dress | [ ] | [ ] | ___s |
| Outerwear | Jacket | [ ] | [ ] | ___s |
| Shoes | Sneakers | [ ] | [ ] | ___s |
| Bags | Handbag | [ ] | [ ] | ___s |
| Accessories | Belt/Scarf | [ ] | [ ] | ___s |

---

## Section 2: Style Signals (style-signals)

### Test 2.1: Style Signals Generation
**Purpose:** Verify Claude generates valid style signals for Trust Filter

**Steps:**
1. Scan an item with distinctive style (e.g., bohemian dress, streetwear hoodie)
2. Wait for results screen to load
3. Check logs (if available) for style signals

**Expected Results:**
- [ ] No timeout errors in logs
- [ ] Style signals generated successfully
- [ ] Trust Filter completes (matches appear or "Worth trying" shows)

---

### Test 2.2: Parallel Pre-fetch (Latency Test)
**Purpose:** Verify parallel execution reduces total time

**Steps:**
1. Clear any cached data for a new item
2. Scan a new item (never scanned before)
3. Time from scan button press to results display

**Expected Results:**
- [ ] Total time under 15 seconds (vs ~27s before)
- [ ] No Trust Filter timeout messages
- [ ] Results appear smoothly

**Timing breakdown:**
- Scan to analysis complete: ______ seconds
- Analysis to matches display: ______ seconds
- Total: ______ seconds

---

### Test 2.3: Cache Hit on Re-scan
**Purpose:** Verify style signals cache works

**Steps:**
1. Scan an item (first time)
2. Go back to home
3. Scan the SAME item again (or navigate back to results)

**Expected Results:**
- [ ] Second scan is much faster (cache hit)
- [ ] No API call on second scan (check logs if available)
- [ ] Results are consistent between scans

---

## Section 3: Trust Filter Integration

### Test 3.1: HIGH Matches Display
**Purpose:** Verify Trust Filter correctly processes Claude's style signals

**Steps:**
1. Scan an item that has good matches in your wardrobe
2. Wait for results

**Expected Results:**
- [ ] "Wear now" tab appears with HIGH matches
- [ ] Matches make visual sense (styles complement)
- [ ] No unexpected hiding/demotion of good matches

---

### Test 3.2: NEAR Matches (Worth Trying)
**Purpose:** Verify demoted matches appear correctly

**Steps:**
1. Scan an item with mixed compatibility (e.g., casual item with some formal wardrobe)
2. Check "Worth trying" tab

**Expected Results:**
- [ ] NEAR matches appear in "Worth trying" tab
- [ ] Items have reasonable style tension (explains why "worth trying")
- [ ] AI suggestions help explain how to make it work

---

### Test 3.3: Trust Filter Timeout Handling
**Purpose:** Verify system doesn't timeout (parallel pre-fetch working)

**Steps:**
1. Scan 5 different items in sequence
2. Monitor for any timeout errors or delays

**Expected Results:**
- [ ] No timeout errors
- [ ] Consistent fast loading
- [ ] All scans complete successfully

---

## Section 4: AI Suggestions Integration

### Test 4.1: PAIRED Mode (HIGH Matches)
**Purpose:** Verify AI suggestions work with HIGH matches

**Steps:**
1. Scan item with HIGH matches
2. View "Wear now" tab
3. Look for AI suggestions card

**Expected Results:**
- [ ] "Why it works" section appears
- [ ] "To elevate" section appears
- [ ] Suggestions reference actual matched items
- [ ] Suggestions make styling sense

---

### Test 4.2: SOLO Mode (No Matches)
**Purpose:** Verify AI suggestions work when no matches found

**Steps:**
1. Scan an item that has NO matches in your wardrobe
2. View results screen

**Expected Results:**
- [ ] "How to style it" section appears
- [ ] "What to add first" section appears
- [ ] Suggestions are helpful and specific
- [ ] No blank/empty state

---

### Test 4.3: NEAR Mode (Worth Trying)
**Purpose:** Verify AI suggestions work for NEAR matches

**Steps:**
1. Scan item with NEAR matches only
2. View "Worth trying" tab

**Expected Results:**
- [ ] "Why it's close" section appears
- [ ] "How to upgrade" section appears
- [ ] Styling tips are actionable

---

## Section 5: Error Handling

### Test 5.1: Network Error During Scan
**Purpose:** Verify graceful error handling

**Steps:**
1. Enable airplane mode
2. Try to scan an item
3. Observe error handling
4. Disable airplane mode and retry

**Expected Results:**
- [ ] Clear error message appears
- [ ] No app crash
- [ ] "Try again" option works after network restored

---

### Test 5.2: Abort on Navigation
**Purpose:** Verify scan cancels cleanly when user navigates away

**Steps:**
1. Start scanning an item
2. Immediately tap back button before analysis completes
3. Return to scan and try again

**Expected Results:**
- [ ] No orphaned requests continue
- [ ] App remains responsive
- [ ] Next scan works normally

---

## Section 6: Performance Benchmarks

### Test 6.1: Latency Comparison
**Purpose:** Document actual performance vs expected

**Scan 3 different items and record times:**

| Metric | Item 1 | Item 2 | Item 3 | Average | Expected |
|--------|--------|--------|--------|---------|----------|
| Analysis time | ___s | ___s | ___s | ___s | ~4s |
| Style signals | ___s | ___s | ___s | ___s | ~4s |
| Total to results | ___s | ___s | ___s | ___s | ~12-15s |

---

### Test 6.2: Memory Usage
**Purpose:** Verify no memory issues with parallel processing

**Steps:**
1. Scan 10 items in sequence without closing app
2. Monitor app behavior

**Expected Results:**
- [ ] No app slowdown
- [ ] No crashes
- [ ] No "out of memory" errors

---

## Section 7: Regression Tests

### Test 7.1: Existing Wardrobe Items Display
**Purpose:** Verify existing wardrobe still works

**Steps:**
1. Open Wardrobe tab
2. Browse existing items
3. Tap on items to view details

**Expected Results:**
- [ ] All items display correctly
- [ ] Colors and categories are correct
- [ ] Item details load properly

---

### Test 7.2: Saved Checks Load
**Purpose:** Verify previously saved scan results still work

**Steps:**
1. Go to History/Saved checks
2. Open a previous scan result

**Expected Results:**
- [ ] Previous results load correctly
- [ ] Matches display properly
- [ ] No errors

---

### Test 7.3: Outfit Ideas
**Purpose:** Verify outfit assembly still works

**Steps:**
1. Scan item with multiple matches
2. View "Outfit Ideas" section

**Expected Results:**
- [ ] Outfits are assembled correctly
- [ ] Visual display is correct
- [ ] Can tap to view outfit details

---

## Test Summary

### Pass/Fail Summary

| Section | Tests Passed | Tests Failed | Notes |
|---------|--------------|--------------|-------|
| 1. Image Analysis | /3 | | |
| 2. Style Signals | /3 | | |
| 3. Trust Filter | /3 | | |
| 4. AI Suggestions | /3 | | |
| 5. Error Handling | /2 | | |
| 6. Performance | /2 | | |
| 7. Regression | /3 | | |
| **TOTAL** | **/19** | | |

---

### Issues Found

| Issue # | Section | Description | Severity | Status |
|---------|---------|-------------|----------|--------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

### Performance Summary

| Metric | Before Migration | After Migration | Improvement |
|--------|------------------|-----------------|-------------|
| Analysis latency | ~8s | ___s | |
| Style signals latency | ~8-15s | ___s | |
| Total scan-to-results | ~27s | ___s | |
| Trust Filter timeouts | Frequent | | |

---

### Sign-off

- [ ] All critical tests passed
- [ ] No blocking issues found
- [ ] Performance meets expectations
- [ ] Ready for production

**Tester:** _______________  
**Date:** _______________  
**Build/Version:** _______________
