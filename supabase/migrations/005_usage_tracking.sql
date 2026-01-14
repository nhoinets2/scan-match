-- Usage Tracking Migration
-- Adds lifetime usage counters for quota enforcement
-- 
-- This tracks TOTAL usage ever (not current item count) because:
-- 1. Each AI call costs money regardless of outcome
-- 2. Deleting items should NOT refund quota
-- 3. Usage persists across devices via database

-- ─────────────────────────────────────────────
-- Add usage columns to user_subscriptions
-- ─────────────────────────────────────────────

ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS total_scans_used INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_wardrobe_adds_used INTEGER NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────
-- Atomic "consume if available" functions
-- ─────────────────────────────────────────────
-- These MUST be called BEFORE the AI call to prevent over-quota usage.
-- They atomically check limit AND consume credit in one operation.
-- 
-- SECURITY: Functions use auth.uid() internally - no user_id parameter
-- This prevents any client from consuming credits for another user.

-- Free tier limits (adjust as needed)
-- These are defined here so they can be enforced server-side
CREATE OR REPLACE FUNCTION get_scan_limit() RETURNS INTEGER AS $$ SELECT 5; $$ LANGUAGE sql IMMUTABLE;
CREATE OR REPLACE FUNCTION get_wardrobe_add_limit() RETURNS INTEGER AS $$ SELECT 15; $$ LANGUAGE sql IMMUTABLE;

-- ─────────────────────────────────────────────
-- Idempotency table for preventing double-charges
-- ─────────────────────────────────────────────
-- Uses composite PRIMARY KEY instead of separate UNIQUE constraint
-- This is cleaner and slightly faster for lookups
CREATE TABLE IF NOT EXISTS quota_consumptions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  consumption_type TEXT NOT NULL CHECK (consumption_type IN ('scan', 'wardrobe_add')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key, consumption_type)
);

-- Auto-cleanup old idempotency records (older than 24 hours)
-- This keeps the table small while still preventing immediate double-charges
CREATE INDEX IF NOT EXISTS idx_quota_consumptions_created_at 
  ON quota_consumptions(created_at);

-- RLS: users can only see their own consumption records
ALTER TABLE quota_consumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own consumptions"
  ON quota_consumptions FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies - only functions can modify

-- ─────────────────────────────────────────────
-- Consume a scan credit if available (idempotent)
-- ─────────────────────────────────────────────
-- Returns: { allowed, used, credit_limit, remaining, already_consumed, reason }
-- - allowed: true if credit was consumed (or already consumed with same key)
-- - used: total credits used after this operation
-- - credit_limit: the free tier limit
-- - remaining: credits remaining (limit - used), 0 if at limit
-- - already_consumed: true if this idempotency_key was already used
-- - reason: 'consumed' | 'idempotent_replay' | 'pro_unlimited' | 'quota_exceeded'
--
-- Call this BEFORE making the AI call!
-- Uses auth.uid() internally - no user_id parameter for security.
-- Uses SET search_path = public to prevent search_path hijacking.
CREATE OR REPLACE FUNCTION consume_scan_credit(p_idempotency_key TEXT DEFAULT NULL)
RETURNS TABLE(allowed BOOLEAN, used INTEGER, credit_limit INTEGER, remaining INTEGER, already_consumed BOOLEAN, reason TEXT) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_pro BOOLEAN;
  v_current_used INTEGER;
  v_limit INTEGER := get_scan_limit();
  v_rows_updated INTEGER;
BEGIN
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ensure user_subscriptions row exists
  INSERT INTO user_subscriptions (user_id, total_scans_used, total_wardrobe_adds_used)
  VALUES (v_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Check idempotency (if key provided)
  IF p_idempotency_key IS NOT NULL THEN
    -- Try to insert idempotency record
    INSERT INTO quota_consumptions (user_id, idempotency_key, consumption_type)
    VALUES (v_user_id, p_idempotency_key, 'scan')
    ON CONFLICT (user_id, idempotency_key, consumption_type) DO NOTHING;
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    
    IF v_rows_updated = 0 THEN
      -- Already consumed with this key - return current state without incrementing
      SELECT total_scans_used, is_pro INTO v_current_used, v_is_pro
      FROM user_subscriptions WHERE user_id = v_user_id;
      
      RETURN QUERY SELECT 
        TRUE,  -- allowed (already consumed = success)
        COALESCE(v_current_used, 0),
        v_limit,
        GREATEST(0, v_limit - COALESCE(v_current_used, 0)),
        TRUE,  -- already_consumed
        'idempotent_replay'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Check if user is Pro (bypass quota)
  SELECT is_pro INTO v_is_pro 
  FROM user_subscriptions 
  WHERE user_id = v_user_id;
  
  -- Pro users always allowed (still track for analytics)
  IF v_is_pro = TRUE THEN
    UPDATE user_subscriptions
    SET total_scans_used = total_scans_used + 1, updated_at = now()
    WHERE user_id = v_user_id
    RETURNING total_scans_used INTO v_current_used;
    
    RETURN QUERY SELECT TRUE, v_current_used, v_limit, v_limit, FALSE, 'pro_unlimited'::TEXT;
    RETURN;
  END IF;
  
  -- Free user: atomic check-and-consume
  UPDATE user_subscriptions
  SET total_scans_used = total_scans_used + 1, updated_at = now()
  WHERE user_id = v_user_id
    AND total_scans_used < v_limit
  RETURNING total_scans_used INTO v_current_used;
  
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  IF v_rows_updated > 0 THEN
    RETURN QUERY SELECT 
      TRUE, 
      v_current_used, 
      v_limit, 
      GREATEST(0, v_limit - v_current_used),
      FALSE,
      'consumed'::TEXT;
    RETURN;
  END IF;
  
  -- At/over limit - not allowed
  -- Clean up idempotency record since we didn't actually consume
  IF p_idempotency_key IS NOT NULL THEN
    DELETE FROM quota_consumptions 
    WHERE user_id = v_user_id 
      AND idempotency_key = p_idempotency_key 
      AND consumption_type = 'scan';
  END IF;
  
  SELECT total_scans_used INTO v_current_used
  FROM user_subscriptions WHERE user_id = v_user_id;
  
  RETURN QUERY SELECT FALSE, COALESCE(v_current_used, 0), v_limit, 0, FALSE, 'quota_exceeded'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────
-- Consume a wardrobe add credit if available (idempotent)
-- ─────────────────────────────────────────────
-- Returns: { allowed, used, credit_limit, remaining, already_consumed, reason }
-- Same return format as consume_scan_credit for consistency.
-- Uses SET search_path = public to prevent search_path hijacking.
CREATE OR REPLACE FUNCTION consume_wardrobe_add_credit(p_idempotency_key TEXT DEFAULT NULL)
RETURNS TABLE(allowed BOOLEAN, used INTEGER, credit_limit INTEGER, remaining INTEGER, already_consumed BOOLEAN, reason TEXT) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_pro BOOLEAN;
  v_current_used INTEGER;
  v_limit INTEGER := get_wardrobe_add_limit();
  v_rows_updated INTEGER;
BEGIN
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ensure user_subscriptions row exists
  INSERT INTO user_subscriptions (user_id, total_scans_used, total_wardrobe_adds_used)
  VALUES (v_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Check idempotency (if key provided)
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO quota_consumptions (user_id, idempotency_key, consumption_type)
    VALUES (v_user_id, p_idempotency_key, 'wardrobe_add')
    ON CONFLICT (user_id, idempotency_key, consumption_type) DO NOTHING;
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    
    IF v_rows_updated = 0 THEN
      SELECT total_wardrobe_adds_used, is_pro INTO v_current_used, v_is_pro
      FROM user_subscriptions WHERE user_id = v_user_id;
      
      RETURN QUERY SELECT 
        TRUE,
        COALESCE(v_current_used, 0),
        v_limit,
        GREATEST(0, v_limit - COALESCE(v_current_used, 0)),
        TRUE,
        'idempotent_replay'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Check if user is Pro
  SELECT is_pro INTO v_is_pro 
  FROM user_subscriptions 
  WHERE user_id = v_user_id;
  
  -- Pro users always allowed
  IF v_is_pro = TRUE THEN
    UPDATE user_subscriptions
    SET total_wardrobe_adds_used = total_wardrobe_adds_used + 1, updated_at = now()
    WHERE user_id = v_user_id
    RETURNING total_wardrobe_adds_used INTO v_current_used;
    
    RETURN QUERY SELECT TRUE, v_current_used, v_limit, v_limit, FALSE, 'pro_unlimited'::TEXT;
    RETURN;
  END IF;
  
  -- Free user: atomic check-and-consume
  UPDATE user_subscriptions
  SET total_wardrobe_adds_used = total_wardrobe_adds_used + 1, updated_at = now()
  WHERE user_id = v_user_id
    AND total_wardrobe_adds_used < v_limit
  RETURNING total_wardrobe_adds_used INTO v_current_used;
  
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  IF v_rows_updated > 0 THEN
    RETURN QUERY SELECT 
      TRUE, 
      v_current_used, 
      v_limit, 
      GREATEST(0, v_limit - v_current_used),
      FALSE,
      'consumed'::TEXT;
    RETURN;
  END IF;
  
  -- At/over limit - clean up idempotency record
  IF p_idempotency_key IS NOT NULL THEN
    DELETE FROM quota_consumptions 
    WHERE user_id = v_user_id 
      AND idempotency_key = p_idempotency_key 
      AND consumption_type = 'wardrobe_add';
  END IF;
  
  SELECT total_wardrobe_adds_used INTO v_current_used
  FROM user_subscriptions WHERE user_id = v_user_id;
  
  RETURN QUERY SELECT FALSE, COALESCE(v_current_used, 0), v_limit, 0, FALSE, 'quota_exceeded'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────
-- Get current usage counts (for UI display only)
-- ─────────────────────────────────────────────
-- Uses auth.uid() internally - no user_id parameter
-- Uses SET search_path = public to prevent search_path hijacking.
CREATE OR REPLACE FUNCTION get_usage_counts()
RETURNS TABLE(scans_used INTEGER, wardrobe_adds_used INTEGER, is_pro BOOLEAN) AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 0::INTEGER, 0::INTEGER, FALSE;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    COALESCE(total_scans_used, 0)::INTEGER,
    COALESCE(total_wardrobe_adds_used, 0)::INTEGER,
    COALESCE(us.is_pro, FALSE)
  FROM user_subscriptions us
  WHERE us.user_id = v_user_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::INTEGER, 0::INTEGER, FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────
-- Cleanup old idempotency records (optional cron job)
-- ─────────────────────────────────────────────
-- Uses the created_at index for efficient cleanup as the table grows.
-- Uses SET search_path = public to prevent search_path hijacking.
CREATE OR REPLACE FUNCTION cleanup_old_quota_consumptions()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM quota_consumptions
  WHERE created_at < now() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────
-- Grant permissions
-- ─────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION get_scan_limit() TO authenticated;
GRANT EXECUTE ON FUNCTION get_wardrobe_add_limit() TO authenticated;
GRANT EXECUTE ON FUNCTION consume_scan_credit(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION consume_wardrobe_add_credit(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_usage_counts() TO authenticated;
-- cleanup_old_quota_consumptions is for admin/cron only, no grant

-- ─────────────────────────────────────────────
-- Backfill existing usage from current data
-- ─────────────────────────────────────────────
-- This sets initial counts based on existing rows
-- Run once after migration, then counts are tracked incrementally

-- Backfill wardrobe adds (count of wardrobe_items per user)
UPDATE user_subscriptions us
SET total_wardrobe_adds_used = (
  SELECT COUNT(*)::INTEGER 
  FROM wardrobe_items wi 
  WHERE wi.user_id = us.user_id
)
WHERE EXISTS (
  SELECT 1 FROM wardrobe_items wi WHERE wi.user_id = us.user_id
);

-- Backfill scan usage (count of recent_checks per user)
UPDATE user_subscriptions us
SET total_scans_used = (
  SELECT COUNT(*)::INTEGER 
  FROM recent_checks rc 
  WHERE rc.user_id = us.user_id
)
WHERE EXISTS (
  SELECT 1 FROM recent_checks rc WHERE rc.user_id = us.user_id
);

-- ─────────────────────────────────────────────
-- Notes
-- ─────────────────────────────────────────────
-- - Usage counters NEVER decrease (usage-based, not capacity-based)
-- - Deleting items does NOT refund quota
-- - Pro users bypass quota checks in app (counters still track for analytics)
-- - Backfill runs once; after that, app increments via RPC calls


