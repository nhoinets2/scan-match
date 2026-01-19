# Refund Policy Implementation Guide

## 24-Hour Cancellation Policy

### How It Works

1. **User subscribes** to Pro plan
2. **User cancels within 24 hours** → Eligible for full refund
3. **User requests refund** through platform
4. **You approve** the refund (or auto-approve via platform settings)

---

## Platform-Specific Implementation

### Apple App Store

#### Automatic Refunds (Recommended)
1. **App Store Connect** → Your App → **Subscriptions**
2. Select subscription product (Annual or Monthly)
3. **Subscription Policies** section:
   - ✅ Enable "Offer Refunds"
   - ✅ Set "Grace Period" to 1 day (24 hours)
   - ✅ Check "Auto-approve refunds within grace period"

#### Manual Refund Process
- Users request at: https://reportaproblem.apple.com
- You receive notification in App Store Connect
- Approve within 48 hours

---

### Google Play Store

#### Automatic Refunds (Recommended)
1. **Play Console** → Your App → **Monetization** → **Subscriptions**
2. Select subscription product
3. **Refund Settings**:
   - ✅ Enable "Automatic refunds for recent purchases"
   - ✅ Set window to 24 hours

#### Manual Refund Process
- Users request through Play Store
- You review in Play Console → **Order Management**
- Approve or decline

---

## In-App Messaging

### Add to Your Paywall or Account Screen:

**Placement**: Below the "Subscribe" button or in account settings

**Example Text**:
```
"Not satisfied? Cancel within 24 hours for a full refund.
Just email us at support@snaptomatch.app or request
through App Store/Play Store."
```

### Legal Footer Text:
```
"Subscription auto-renews unless cancelled at least 24 hours
before the end of the current period. Cancel anytime through
your App Store or Play Store account settings. Refunds
available within 24 hours of purchase."
```

---

## Testing Your Setup

1. **Test Purchase** (use sandbox account)
2. **Immediately cancel** via subscription management
3. **Request refund** through platform
4. **Verify** refund is processed within expected timeframe

---

## Important Notes

⚠️ **You cannot cancel subscriptions from your app code**
- Platform (Apple/Google) controls the billing
- Your app can only link to subscription management

✅ **What you CAN do**:
- Provide easy access to cancellation (Manage Subscription button)
- Clearly communicate refund policy
- Set auto-approval rules in App Store Connect / Play Console
- Handle refund requests via support email

❌ **What you CANNOT do**:
- Directly cancel a user's subscription via API
- Process refunds outside of platform systems
- Override platform billing policies

