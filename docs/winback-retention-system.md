# Winback Retention Offer System

## Overview

The winback retention system automatically detects when users cancel their annual subscription and presents them with a 50% discount offer ($19.99 instead of $39.99) to encourage them to stay. This is a proven retention strategy that can recover 15-30% of cancellations.

---

## System Architecture

### Components

```
User Cancels (iPhone Settings)
         ↓
RevenueCat Detects Cancellation
         ↓
Webhook Updates Database (show_winback_offer = true)
         ↓
User Opens App
         ↓
useWinbackOffer Hook Detects Flag
         ↓
WinbackOffer Modal Displays
         ↓
User Accepts → Promo Code Instructions
         ↓
Flag Cleared (won't show again)
```

### Files & Responsibilities

| File | Purpose |
|------|---------|
| `supabase/migrations/004_add_winback_fields.sql` | Database schema for tracking winback offers |
| `supabase/functions/revenuecat-webhook/index.ts` | Detects cancellation events from RevenueCat |
| `src/lib/subscription-sync.ts` | Helper functions for winback management |
| `src/lib/useWinbackOffer.ts` | Hook to detect and manage winback state |
| `src/components/WinbackOffer.tsx` | Modal UI component for the offer |
| `src/app/(tabs)/_layout.tsx` | Integration point - shows popup |

---

## Database Schema

### user_subscriptions Table

```sql
-- New fields added for winback system
will_renew BOOLEAN DEFAULT TRUE
  - Tracks if subscription will auto-renew
  - FALSE when user cancels

show_winback_offer BOOLEAN DEFAULT FALSE
  - Flag to trigger winback popup
  - Set by webhook on CANCELLATION
  - Cleared when popup is shown

winback_offer_shown_at TIMESTAMPTZ
  - Timestamp when offer was displayed
  - Used for analytics

winback_offer_accepted BOOLEAN DEFAULT FALSE
  - Whether user accepted the offer
  - Used for conversion tracking
```

### Indexes

```sql
CREATE INDEX idx_user_subscriptions_show_winback 
ON user_subscriptions(show_winback_offer) 
WHERE show_winback_offer = TRUE;
```

Optimizes queries for users who should see the offer.

---

## Webhook Logic

### Event Handling

```typescript
// CANCELLATION Event
// User cancelled but still has access until expiration
isPro = expiresAt > now()  // Still have access
willRenew = false           // Won't auto-renew
showWinbackOffer = isPro    // Show if still active

// RENEWAL/UNCANCELLATION Events
// User renewed or un-cancelled
showWinbackOffer = false    // Clear the flag
willRenew = true            // Will auto-renew again

// EXPIRATION/REFUND Events
// Too late, subscription ended
showWinbackOffer = false    // Don't show offer
```

### Webhook URL

```
https://<your-project>.supabase.co/functions/v1/revenuecat-webhook
```

Set in **RevenueCat Dashboard** → **Project Settings** → **Integrations** → **Webhooks**

---

## API Functions

### subscription-sync.ts

#### `shouldShowWinbackOffer(userId: string): Promise<boolean>`
Checks if user should see the winback popup.

**Returns**: `true` if `show_winback_offer` flag is set

**Usage**:
```typescript
const shouldShow = await shouldShowWinbackOffer(user.id);
if (shouldShow) {
  setShowWinbackPopup(true);
}
```

---

#### `markWinbackOfferShown(userId: string): Promise<boolean>`
Marks the offer as displayed to prevent showing again.

**Side effects**:
- Sets `show_winback_offer = false`
- Sets `winback_offer_shown_at = now()`

**Usage**:
```typescript
await markWinbackOfferShown(user.id);
```

---

#### `markWinbackOfferAccepted(userId: string): Promise<boolean>`
Tracks when user accepts the offer.

**Side effects**:
- Sets `winback_offer_accepted = true`
- Updates `updated_at` timestamp

**Usage**:
```typescript
await markWinbackOfferAccepted(user.id);
```

---

## Components

### useWinbackOffer Hook

**Returns**:
- `showWinback`: Boolean - whether to show popup
- `hideWinback`: Function - callback to hide popup
- `isChecking`: Boolean - loading state
- `userId`: String - current user ID

**Example**:
```typescript
const { showWinback, hideWinback, userId } = useWinbackOffer();

return (
  <WinbackOffer 
    visible={showWinback} 
    onClose={hideWinback}
    userId={userId}
  />
);
```

---

### WinbackOffer Component

**Props**:
- `visible: boolean` - Show/hide modal
- `onClose: () => void` - Callback when dismissed
- `userId: string` - User ID for tracking

**Features**:
- Gradient background (matches paywall design)
- Price comparison: ~~$39.99~~ **$19.99** (50% off)
- "Claim 50% Off" CTA button
- Shows alert with promo code instructions
- "No thanks" decline option

**User Flow**:
1. User sees offer
2. Taps "Claim 50% Off"
3. Alert shows instructions:
   ```
   To activate this offer:
   1. Go to iPhone Settings → Apple ID → Subscriptions
   2. Select Scan & Match
   3. Enter promo code: WINBACK50
   
   Your next year will be just $19.99!
   ```
4. Offer marked as accepted in DB

---

## Setup Instructions

### 1. Run Database Migration

**Supabase Dashboard** → **SQL Editor**:

```sql
-- Copy contents from:
-- supabase/migrations/004_add_winback_fields.sql
-- and execute
```

Verify table was updated:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_subscriptions' 
  AND column_name IN ('will_renew', 'show_winback_offer');
```

---

### 2. Create Promotional Offer (App Store Connect)

#### Steps:

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. **My Apps** → Your App → **In-App Purchases**
3. Select your **Annual Subscription**
4. Under **Subscription Prices**, click **Promotional Offers**
5. Click **Create Promotional Offer**

#### Configuration:

| Field | Value |
|-------|-------|
| **Reference Name** | Winback 50% Off |
| **Promotional Offer Code** | `WINBACK50` |
| **Type** | Promotional Offer |
| **Offer Duration** | 1 year |
| **Offer Price** | $19.99 |
| **Number of Periods** | 1 |
| **Eligibility** | Existing or past subscribers |

6. Click **Save**
7. Submit for Apple review (if required)

**Note**: Offer codes can take 24-48 hours to activate after approval.

---

### 3. Verify Webhook Configuration

Ensure RevenueCat webhook is configured:

**RevenueCat Dashboard**:
1. Project Settings → Integrations → Webhooks
2. URL: `https://<your-project>.supabase.co/functions/v1/revenuecat-webhook`
3. Authorization Header: `Bearer <your-secret>`
4. Events: All events enabled

**Test webhook**:
```bash
# Check Supabase Edge Functions logs
# Should see "[RevenueCat Webhook] Received event: ..."
```

---

## Testing Guide

### 1. Sandbox Testing (iOS)

#### Setup:
1. Xcode → Run app on simulator
2. Sign out of App Store (Settings → iTunes & App Store)
3. App will run in sandbox mode

#### Test Flow:
1. **Subscribe**:
   - Open app → See paywall
   - Purchase annual subscription
   - Use sandbox test account
   - Verify purchase completes

2. **Cancel**:
   - Go to **Settings** → **Apple ID** → **Subscriptions**
   - Select your app's annual subscription
   - Tap **Cancel Subscription**
   - Confirm cancellation

3. **Trigger Winback**:
   - Close app completely (swipe up from multitasking)
   - Wait 10 seconds (for webhook to process)
   - Reopen app
   - **Winback popup should appear**

4. **Accept Offer**:
   - Tap "Claim 50% Off"
   - See alert with promo code instructions
   - Verify `winback_offer_accepted = true` in database

#### Expected Results:
- ✅ Popup shows with 50% offer
- ✅ Alert displays `WINBACK50` code
- ✅ Database updated with timestamps
- ✅ Popup doesn't show again on next open

---

### 2. Database Verification

Check if flags are set correctly:

```sql
-- After cancellation, should see:
SELECT 
  user_id,
  is_pro,
  will_renew,
  show_winback_offer,
  winback_offer_shown_at,
  winback_offer_accepted
FROM user_subscriptions
WHERE user_id = '<test-user-id>';

-- Expected after cancel:
-- is_pro: true (still has access)
-- will_renew: false
-- show_winback_offer: true

-- Expected after popup shown:
-- show_winback_offer: false
-- winback_offer_shown_at: <timestamp>

-- Expected after accepted:
-- winback_offer_accepted: true
```

---

### 3. Webhook Logs

**Supabase Dashboard** → **Edge Functions** → **revenuecat-webhook** → **Logs**

Look for:
```
[RevenueCat Webhook] User <id> cancelled, access until: <date>, showing winback: true
[RevenueCat Webhook] Successfully updated user <id>: isPro=true
```

---

## Analytics & Monitoring

### Key Metrics to Track

```sql
-- Winback offer show rate
SELECT 
  COUNT(*) FILTER (WHERE show_winback_offer = true) as pending_offers,
  COUNT(*) FILTER (WHERE winback_offer_shown_at IS NOT NULL) as shown_offers,
  COUNT(*) FILTER (WHERE winback_offer_accepted = true) as accepted_offers
FROM user_subscriptions
WHERE will_renew = false;

-- Acceptance rate
SELECT 
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE winback_offer_accepted = true) / 
    NULLIF(COUNT(*) FILTER (WHERE winback_offer_shown_at IS NOT NULL), 0),
    2
  ) as acceptance_rate_percent
FROM user_subscriptions;

-- Time to show (responsiveness)
SELECT 
  AVG(EXTRACT(EPOCH FROM (winback_offer_shown_at - updated_at))) as avg_seconds_to_show
FROM user_subscriptions
WHERE winback_offer_shown_at IS NOT NULL;
```

---

## Troubleshooting

### Issue: Popup Not Showing

**Checklist**:
1. ✅ Database migration ran successfully
2. ✅ `show_winback_offer = true` in database
3. ✅ User is authenticated
4. ✅ App is in tabs (not login/onboarding)
5. ✅ Webhook is receiving events

**Debug**:
```typescript
// Add to useWinbackOffer.ts
console.log('[Winback] Checking for user:', user?.id);
console.log('[Winback] Should show:', shouldShow);
```

---

### Issue: Webhook Not Firing

**Checklist**:
1. ✅ Webhook URL is correct in RevenueCat
2. ✅ Authorization header is set
3. ✅ Supabase function is deployed
4. ✅ User ID is linked (not anonymous)

**Test webhook manually**:
```bash
# RevenueCat Dashboard → Webhooks → Test
# Select CANCELLATION event
# Check Supabase logs
```

---

### Issue: Promo Code Not Working

**Checklist**:
1. ✅ Offer created in App Store Connect
2. ✅ Offer code approved by Apple
3. ✅ User is eligible (existing/past subscriber)
4. ✅ Code entered correctly: `WINBACK50`

**Note**: Sandbox codes may not work - test in production TestFlight.

---

## Best Practices

### 1. Timing
- Show popup **immediately** on first app open after cancellation
- Don't delay or wait for specific screens
- User is most engaged right after opening app

### 2. Frequency
- Show **once per cancellation event**
- Don't repeatedly show if declined
- If user cancels again later → can show again

### 3. Messaging
- Emphasize **value saved** ($20 off)
- Keep it simple and friendly
- Clear CTA: "Claim 50% Off"

### 4. A/B Testing Ideas
- Different discount amounts (40%, 50%, 60%)
- Different messaging ("We'll miss you" vs "Special offer")
- Different timing (immediate vs 1 day later)

---

## Future Enhancements

### Potential Improvements

1. **Multiple Offer Tiers**
   - First cancellation: 50% off
   - Second cancellation: 3 months free
   - Third cancellation: Lifetime 30% discount

2. **Personalized Offers**
   - Based on usage patterns
   - Higher discount for power users
   - Lower discount for light users

3. **Email Follow-up**
   - If user declines in-app offer
   - Send email 24 hours later
   - Different offer or messaging

4. **Survey Integration**
   - "Why are you cancelling?"
   - Show offer based on reason
   - Collect feedback for product improvements

5. **RevenueCat Promotional Offers**
   - Use RevenueCat SDK to present offers directly
   - No promo code needed
   - Better UX (one-tap acceptance)

---

## Security Considerations

### Webhook Security
- ✅ Webhook uses Bearer token authentication
- ✅ Validates user ID format (not anonymous)
- ✅ Uses service role key (bypasses RLS)

### Database Security
- ✅ RLS policies restrict user access
- ✅ Users can read their own subscription only
- ✅ Webhook bypasses RLS (needs service role)

### Promo Code Security
- ✅ Codes managed by Apple (can't be forged)
- ✅ Eligibility enforced by App Store
- ✅ One-time use per user

---

## Support & Maintenance

### Regular Checks

**Weekly**:
- Monitor acceptance rate (should be 15-30%)
- Check webhook success rate (should be >99%)
- Review any error logs

**Monthly**:
- Analyze retention metrics
- Compare to baseline (pre-winback)
- Adjust offer if needed

### Contact Points

**Apple Issues**:
- App Store Connect Support
- Promotional offer approval process

**RevenueCat Issues**:
- RevenueCat Dashboard → Support
- Webhook troubleshooting

**Database Issues**:
- Supabase Dashboard → Support
- SQL optimization

---

## Related Documentation

- [RevenueCat Webhooks Guide](https://www.revenuecat.com/docs/webhooks)
- [App Store Promotional Offers](https://developer.apple.com/app-store/subscriptions/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Subscription Sync System](./subscription-sync.md) (if exists)

---

## Changelog

### Version 1.0 (Initial Release)
- Basic cancellation detection
- 50% discount offer
- Promo code redemption flow
- Single-show logic

### Future Versions
- [ ] A/B testing framework
- [ ] Multiple offer tiers
- [ ] Email integration
- [ ] RevenueCat promotional offers integration

---

## License & Credits

Part of the Scan & Match application.
Built with RevenueCat, Supabase, and React Native.

For questions or issues, contact the development team.

