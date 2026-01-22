# Paywall Reviewer Experience - App Store Compliance

## ✅ Check 1: React Query Retry Works Properly

**Fixed**: Query now throws on failure instead of returning `null`

```typescript
queryFn: async () => {
  const result = await getOfferings();
  
  if (result.ok) {
    return result.data;
  }
  
  // ✅ Throw error so React Query retry mechanism works
  throw new Error(`Failed to load offerings: ${result.reason}`);
}
```

**Retry configuration**:
- 2 automatic retries
- 1 second delay between retries
- Total: 3 attempts over 3 seconds

## ✅ Check 2: Button Never Looks Purchasable When It Can't Purchase

### Reviewer Experience Timeline

#### State 1: Initial Load (0-3 seconds)
```
Paywall opens
↓
isLoadingOfferings = true
↓
Button appearance:
  ✅ Opacity: 0.5 (dimmed)
  ✅ Text: "Loading..."
  ✅ Disabled: true
  ✅ NOT tappable
```

#### State 2a: Success - Products Loaded
```
Offerings fetch succeeds
↓
isLoadingOfferings = false
packages exist
↓
Button appearance:
  ✅ Opacity: 1.0 (full brightness)
  ✅ Text: "Start free trial" or "Subscribe"
  ✅ Disabled: false
  ✅ Tappable and works
  ✅ Plan cards show real prices from StoreKit
```

#### State 2b: Partial Success - Offerings Load But Packages Missing
```
Offerings load but products missing
↓
isLoadingOfferings = false
!monthlyPackage || !annualPackage
↓
Button appearance:
  ✅ Opacity: 0.5 (dimmed)
  ✅ Text: "Unavailable"
  ✅ Disabled: true
  ✅ NOT tappable

Additional UI:
  ✅ Yellow banner: "Subscriptions temporarily unavailable"
  ✅ Retry button visible
  ✅ Plan cards show "Unavailable" (NO fake prices)
```

#### State 2c: Failure - Network/RevenueCat Error
```
Offerings fetch fails after 3 attempts
↓
isOfferingsError = true
↓
Button appearance:
  ✅ Opacity: 0.5 (dimmed)
  ✅ Text: "Unavailable"
  ✅ Disabled: true
  ✅ NOT tappable

Additional UI:
  ✅ Yellow banner: "Can't load subscriptions"
  ✅ Subtitle: "Check your connection and try again."
  ✅ Retry button visible
  ✅ Plan cards show "Unavailable" (NO fake prices)
```

## Critical Rules Enforced

### 1. No Fake Prices ✅
```typescript
// OLD (App Review risk):
const monthlyPrice = monthlyPackage?.product.priceString || "$5.99"; // ❌ Fallback

// NEW (Compliant):
const monthlyPrice = isLoadingOfferings ? "Loading..." : 
                     isOfferingsError ? "Unavailable" :
                     monthlyPackage ? monthlyPackage.product.priceString : "Unavailable"; // ✅
```

### 2. Button Disabled When Unavailable ✅
```typescript
const canPurchase = !!packageToPurchase && !isPurchasing && !isLoadingOfferings;

<View style={{ opacity: canPurchase ? 1 : 0.5 }}>
  <Pressable disabled={!canPurchase} onPress={handlePurchase}>
    {/* Button content */}
  </Pressable>
</View>
```

### 3. Clear Visual Feedback ✅
- **Opacity 0.5** when unavailable (clearly dimmed)
- **Explicit text**: "Loading..." or "Unavailable" (not "Subscribe")
- **Retry option**: Banner with retry button appears when products unavailable

### 4. Graceful Error Handling ✅
- Automatic retry (3 attempts)
- Manual retry button
- Clear error messages
- No silent failures

## Apple Reviewer Test Flow

### Clean Device Test (Most Common)
```
1. Reviewer opens app on fresh device
2. Signs up/logs in
3. Triggers paywall (e.g., exceeds free quota)
4. Paywall opens → Shows "Loading..." (0.5 opacity, disabled)
5. After 1-3 seconds:
   - Success: Shows real prices, "Start free trial" enabled
   - Failure: Shows "Unavailable", retry button, disabled
6. Reviewer taps button:
   - If enabled: Purchase flow starts ✅
   - If disabled: Nothing happens (no tap registered) ✅
```

### No Network Test
```
1. Reviewer turns off WiFi/cellular
2. Opens paywall
3. Sees "Loading..." → After retries → "Can't load subscriptions"
4. Banner: "Check your connection and try again."
5. Button: "Unavailable" (0.5 opacity, disabled)
6. Taps retry → Fetches again when network available ✅
```

### Sandbox Environment Issues Test
```
1. RevenueCat returns empty offerings
2. Button shows "Unavailable" (NOT fake prices)
3. Banner shows with retry option
4. Never shows tappable button with missing products ✅
```

## Compliance Checklist

- ✅ Button never tappable when products unavailable
- ✅ No fallback/fake prices shown
- ✅ Only real StoreKit prices displayed
- ✅ Clear loading states
- ✅ Clear error states
- ✅ Retry mechanism available
- ✅ Automatic retry on failure
- ✅ Visual distinction (opacity) when disabled
- ✅ Explicit text ("Unavailable", not action verbs)
- ✅ Logging for debugging

## App Review Guideline Compliance

**Guideline 3.1.1**: Apps offering subscriptions must clearly present terms
- ✅ Trial terms shown for annual plan
- ✅ Pricing shown from actual StoreKit products
- ✅ No misleading fallback prices

**Guideline 2.1**: Apps must be complete and not show placeholder content
- ✅ "Unavailable" shown instead of fake prices when products missing
- ✅ Retry mechanism provided

**Guideline 4.0**: Design must be polished
- ✅ Clear visual feedback (opacity, text)
- ✅ Loading states
- ✅ Error states with actionable retry

## Result: App Review Safe ✅

The paywall now handles all edge cases Apple reviewers test for:
- Products fail to load → Button disabled, retry available
- Network offline → Clear error message, retry when online
- Partial product availability → Shows "Unavailable" for missing options
- Clean device → Shows "Loading..." then real prices or unavailable state

**No scenario exists where button looks purchasable but can't actually purchase.**
