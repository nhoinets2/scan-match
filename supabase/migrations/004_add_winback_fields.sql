-- Add winback/retention fields to user_subscriptions table
-- These fields help detect cancelled subscriptions and show retention offers

-- Add will_renew column to track if subscription will auto-renew
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS will_renew BOOLEAN DEFAULT TRUE;

-- Add show_winback_offer to track if we should show the retention popup
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS show_winback_offer BOOLEAN DEFAULT FALSE;

-- Add winback_offer_shown_at to track when we last showed the offer
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS winback_offer_shown_at TIMESTAMPTZ;

-- Add winback_offer_accepted to track if user accepted the offer
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS winback_offer_accepted BOOLEAN DEFAULT FALSE;

-- Create index for faster queries on show_winback_offer
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_show_winback 
ON user_subscriptions(show_winback_offer) 
WHERE show_winback_offer = TRUE;

-- Comment for documentation
COMMENT ON COLUMN user_subscriptions.will_renew IS 'Whether the subscription will auto-renew (false if user cancelled)';
COMMENT ON COLUMN user_subscriptions.show_winback_offer IS 'Flag to show retention offer popup';
COMMENT ON COLUMN user_subscriptions.winback_offer_shown_at IS 'Timestamp when winback offer was last shown';
COMMENT ON COLUMN user_subscriptions.winback_offer_accepted IS 'Whether user accepted the winback offer';

