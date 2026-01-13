-- User Subscriptions Table
-- Stores subscription status synced from RevenueCat
-- 
-- This table serves as:
-- 1. Backup source of truth when RevenueCat SDK fails
-- 2. Server-side subscription verification
-- 3. Analytics and admin override capability

-- Create the user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  is_pro BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_type TEXT CHECK (subscription_type IN ('monthly', 'annual') OR subscription_type IS NULL),
  revenuecat_customer_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires_at ON user_subscriptions(expires_at);

-- Enable Row Level Security
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own subscription
CREATE POLICY "Users can read own subscription"
  ON user_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own subscription (for initial sync)
CREATE POLICY "Users can insert own subscription"
  ON user_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own subscription (for sync)
CREATE POLICY "Users can update own subscription"
  ON user_subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Note: Service role key (used by webhook) bypasses RLS
-- So the webhook can update any user's subscription

-- Helper function to check if user is Pro (with expiration validation)
CREATE OR REPLACE FUNCTION is_user_pro(check_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  subscription_record user_subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO subscription_record
  FROM user_subscriptions
  WHERE user_id = check_user_id;
  
  -- No record found
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Not marked as pro
  IF NOT subscription_record.is_pro THEN
    RETURN FALSE;
  END IF;
  
  -- No expiration (lifetime or manual override)
  IF subscription_record.expires_at IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Check if expired
  RETURN subscription_record.expires_at > now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_user_pro(UUID) TO authenticated;

-- Trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_user_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_subscriptions_updated_at();

