-- Monthly Quota System Migration
-- Adds monthly limits for ALL users (including Pro) to prevent runaway costs
-- 
-- Monthly limits:
-- - Free users: 5 scans/month, 15 wardrobe adds/month
-- - Pro users: 200 scans/month, 500 wardrobe adds/month
--
-- This protects against:
-- 1. Unexpected OpenAI bills from heavy Pro user usage
-- 2. DDoS attacks via excessive API calls
-- 3. Automated abuse

-- ─────────────────────────────────────────────
-- Drop existing functions (required to change return type)
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS consume_scan_credit(text);
DROP FUNCTION IF EXISTS consume_wardrobe_add_credit(text);
DROP FUNCTION IF EXISTS get_usage_counts();

-- ─────────────────────────────────────────────
-- Add monthly tracking columns
-- ─────────────────────────────────────────────

ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS scans_this_month INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS wardrobe_adds_this_month INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_started_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', now());

-- ─────────────────────────────────────────────
-- Monthly limit functions (can be adjusted without migration)
-- ─────────────────────────────────────────────

-- Free tier monthly limits
CREATE OR REPLACE FUNCTION get_free_scan_monthly_limit() RETURNS INTEGER AS $$ SELECT 5; $$ LANGUAGE sql IMMUTABLE;
CREATE OR REPLACE FUNCTION get_free_wardrobe_add_monthly_limit() RETURNS INTEGER AS $$ SELECT 15; $$ LANGUAGE sql IMMUTABLE;

-- Pro tier monthly limits (safety cap)
CREATE OR REPLACE FUNCTION get_pro_scan_monthly_limit() RETURNS INTEGER AS $$ SELECT 200; $$ LANGUAGE sql IMMUTABLE;
CREATE OR REPLACE FUNCTION get_pro_wardrobe_add_monthly_limit() RETURNS INTEGER AS $$ SELECT 500; $$ LANGUAGE sql IMMUTABLE;

-- ─────────────────────────────────────────────
-- Helper to reset monthly counters if new month
-- ─────────────────────────────────────────────
-- Called automatically by consume functions

CREATE OR REPLACE FUNCTION maybe_reset_monthly_counters(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE user_subscriptions
  SET 
    scans_this_month = 0,
    wardrobe_adds_this_month = 0,
    month_started_at = date_trunc('month', now())
  WHERE user_id = p_user_id
    AND month_started_at < date_trunc('month', now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────
-- Updated consume_scan_credit with monthly limits
-- ─────────────────────────────────────────────
-- Now enforces monthly limits for ALL users (free + pro)
-- Returns extended result with monthly info

CREATE OR REPLACE FUNCTION consume_scan_credit(p_idempotency_key TEXT DEFAULT NULL)
RETURNS TABLE(
  allowed BOOLEAN, 
  used INTEGER, 
  credit_limit INTEGER, 
  remaining INTEGER, 
  already_consumed BOOLEAN, 
  reason TEXT,
  monthly_used INTEGER,
  monthly_limit INTEGER,
  monthly_remaining INTEGER
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_pro BOOLEAN;
  v_current_used INTEGER;
  v_monthly_used INTEGER;
  v_lifetime_limit INTEGER := get_scan_limit();
  v_monthly_limit INTEGER;
  v_rows_updated INTEGER;
BEGIN
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ensure user_subscriptions row exists
  INSERT INTO user_subscriptions (user_id, total_scans_used, total_wardrobe_adds_used, scans_this_month, wardrobe_adds_this_month, month_started_at)
  VALUES (v_user_id, 0, 0, 0, 0, date_trunc('month', now()))
  ON CONFLICT (user_id) DO NOTHING;

  -- Reset monthly counters if new month
  PERFORM maybe_reset_monthly_counters(v_user_id);

  -- Check idempotency (if key provided)
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO quota_consumptions (user_id, idempotency_key, consumption_type)
    VALUES (v_user_id, p_idempotency_key, 'scan')
    ON CONFLICT (user_id, idempotency_key, consumption_type) DO NOTHING;
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    
    IF v_rows_updated = 0 THEN
      -- Already consumed with this key - return current state
      SELECT total_scans_used, is_pro, scans_this_month INTO v_current_used, v_is_pro, v_monthly_used
      FROM user_subscriptions WHERE user_id = v_user_id;
      
      v_monthly_limit := CASE WHEN v_is_pro THEN get_pro_scan_monthly_limit() ELSE get_free_scan_monthly_limit() END;
      
      RETURN QUERY SELECT 
        TRUE, COALESCE(v_current_used, 0), v_lifetime_limit,
        GREATEST(0, v_lifetime_limit - COALESCE(v_current_used, 0)),
        TRUE, 'idempotent_replay'::TEXT,
        COALESCE(v_monthly_used, 0), v_monthly_limit,
        GREATEST(0, v_monthly_limit - COALESCE(v_monthly_used, 0));
      RETURN;
    END IF;
  END IF;

  -- Get current state
  SELECT is_pro, total_scans_used, scans_this_month INTO v_is_pro, v_current_used, v_monthly_used
  FROM user_subscriptions 
  WHERE user_id = v_user_id;
  
  -- Determine monthly limit based on Pro status
  v_monthly_limit := CASE WHEN v_is_pro THEN get_pro_scan_monthly_limit() ELSE get_free_scan_monthly_limit() END;

  -- Pro users: check monthly limit only (bypass lifetime limit)
  IF v_is_pro = TRUE THEN
    -- Check monthly limit even for Pro
    IF COALESCE(v_monthly_used, 0) >= v_monthly_limit THEN
      -- At monthly limit - clean up idempotency record
      IF p_idempotency_key IS NOT NULL THEN
        DELETE FROM quota_consumptions 
        WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key AND consumption_type = 'scan';
      END IF;
      
      RETURN QUERY SELECT 
        FALSE, COALESCE(v_current_used, 0), v_lifetime_limit, v_monthly_limit,
        FALSE, 'monthly_quota_exceeded'::TEXT,
        COALESCE(v_monthly_used, 0), v_monthly_limit, 0;
      RETURN;
    END IF;
    
    -- Pro user within monthly limit - consume
    UPDATE user_subscriptions
    SET total_scans_used = total_scans_used + 1, 
        scans_this_month = scans_this_month + 1,
        updated_at = now()
    WHERE user_id = v_user_id
    RETURNING total_scans_used, scans_this_month INTO v_current_used, v_monthly_used;
    
    RETURN QUERY SELECT 
      TRUE, v_current_used, v_lifetime_limit, v_monthly_limit,
      FALSE, 'pro_unlimited'::TEXT,
      v_monthly_used, v_monthly_limit, GREATEST(0, v_monthly_limit - v_monthly_used);
    RETURN;
  END IF;
  
  -- Free user: check both lifetime AND monthly limits
  -- Monthly limit takes precedence (lower of the two effective limits)
  IF COALESCE(v_monthly_used, 0) >= v_monthly_limit THEN
    -- At monthly limit
    IF p_idempotency_key IS NOT NULL THEN
      DELETE FROM quota_consumptions 
      WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key AND consumption_type = 'scan';
    END IF;
    
    RETURN QUERY SELECT 
      FALSE, COALESCE(v_current_used, 0), v_lifetime_limit,
      GREATEST(0, v_lifetime_limit - COALESCE(v_current_used, 0)),
      FALSE, 'monthly_quota_exceeded'::TEXT,
      COALESCE(v_monthly_used, 0), v_monthly_limit, 0;
    RETURN;
  END IF;
  
  IF COALESCE(v_current_used, 0) >= v_lifetime_limit THEN
    -- At lifetime limit (free users)
    IF p_idempotency_key IS NOT NULL THEN
      DELETE FROM quota_consumptions 
      WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key AND consumption_type = 'scan';
    END IF;
    
    RETURN QUERY SELECT 
      FALSE, COALESCE(v_current_used, 0), v_lifetime_limit, 0,
      FALSE, 'quota_exceeded'::TEXT,
      COALESCE(v_monthly_used, 0), v_monthly_limit, 
      GREATEST(0, v_monthly_limit - COALESCE(v_monthly_used, 0));
    RETURN;
  END IF;
  
  -- Free user within both limits - consume
  UPDATE user_subscriptions
  SET total_scans_used = total_scans_used + 1, 
      scans_this_month = scans_this_month + 1,
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING total_scans_used, scans_this_month INTO v_current_used, v_monthly_used;
  
  RETURN QUERY SELECT 
    TRUE, v_current_used, v_lifetime_limit,
    GREATEST(0, v_lifetime_limit - v_current_used),
    FALSE, 'consumed'::TEXT,
    v_monthly_used, v_monthly_limit, GREATEST(0, v_monthly_limit - v_monthly_used);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────
-- Updated consume_wardrobe_add_credit with monthly limits
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION consume_wardrobe_add_credit(p_idempotency_key TEXT DEFAULT NULL)
RETURNS TABLE(
  allowed BOOLEAN, 
  used INTEGER, 
  credit_limit INTEGER, 
  remaining INTEGER, 
  already_consumed BOOLEAN, 
  reason TEXT,
  monthly_used INTEGER,
  monthly_limit INTEGER,
  monthly_remaining INTEGER
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_pro BOOLEAN;
  v_current_used INTEGER;
  v_monthly_used INTEGER;
  v_lifetime_limit INTEGER := get_wardrobe_add_limit();
  v_monthly_limit INTEGER;
  v_rows_updated INTEGER;
BEGIN
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ensure user_subscriptions row exists
  INSERT INTO user_subscriptions (user_id, total_scans_used, total_wardrobe_adds_used, scans_this_month, wardrobe_adds_this_month, month_started_at)
  VALUES (v_user_id, 0, 0, 0, 0, date_trunc('month', now()))
  ON CONFLICT (user_id) DO NOTHING;

  -- Reset monthly counters if new month
  PERFORM maybe_reset_monthly_counters(v_user_id);

  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO quota_consumptions (user_id, idempotency_key, consumption_type)
    VALUES (v_user_id, p_idempotency_key, 'wardrobe_add')
    ON CONFLICT (user_id, idempotency_key, consumption_type) DO NOTHING;
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    
    IF v_rows_updated = 0 THEN
      SELECT total_wardrobe_adds_used, is_pro, wardrobe_adds_this_month INTO v_current_used, v_is_pro, v_monthly_used
      FROM user_subscriptions WHERE user_id = v_user_id;
      
      v_monthly_limit := CASE WHEN v_is_pro THEN get_pro_wardrobe_add_monthly_limit() ELSE get_free_wardrobe_add_monthly_limit() END;
      
      RETURN QUERY SELECT 
        TRUE, COALESCE(v_current_used, 0), v_lifetime_limit,
        GREATEST(0, v_lifetime_limit - COALESCE(v_current_used, 0)),
        TRUE, 'idempotent_replay'::TEXT,
        COALESCE(v_monthly_used, 0), v_monthly_limit,
        GREATEST(0, v_monthly_limit - COALESCE(v_monthly_used, 0));
      RETURN;
    END IF;
  END IF;

  -- Get current state
  SELECT is_pro, total_wardrobe_adds_used, wardrobe_adds_this_month INTO v_is_pro, v_current_used, v_monthly_used
  FROM user_subscriptions 
  WHERE user_id = v_user_id;
  
  v_monthly_limit := CASE WHEN v_is_pro THEN get_pro_wardrobe_add_monthly_limit() ELSE get_free_wardrobe_add_monthly_limit() END;

  -- Pro users: check monthly limit only
  IF v_is_pro = TRUE THEN
    IF COALESCE(v_monthly_used, 0) >= v_monthly_limit THEN
      IF p_idempotency_key IS NOT NULL THEN
        DELETE FROM quota_consumptions 
        WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key AND consumption_type = 'wardrobe_add';
      END IF;
      
      RETURN QUERY SELECT 
        FALSE, COALESCE(v_current_used, 0), v_lifetime_limit, v_monthly_limit,
        FALSE, 'monthly_quota_exceeded'::TEXT,
        COALESCE(v_monthly_used, 0), v_monthly_limit, 0;
      RETURN;
    END IF;
    
    UPDATE user_subscriptions
    SET total_wardrobe_adds_used = total_wardrobe_adds_used + 1, 
        wardrobe_adds_this_month = wardrobe_adds_this_month + 1,
        updated_at = now()
    WHERE user_id = v_user_id
    RETURNING total_wardrobe_adds_used, wardrobe_adds_this_month INTO v_current_used, v_monthly_used;
    
    RETURN QUERY SELECT 
      TRUE, v_current_used, v_lifetime_limit, v_monthly_limit,
      FALSE, 'pro_unlimited'::TEXT,
      v_monthly_used, v_monthly_limit, GREATEST(0, v_monthly_limit - v_monthly_used);
    RETURN;
  END IF;
  
  -- Free user: check both limits
  IF COALESCE(v_monthly_used, 0) >= v_monthly_limit THEN
    IF p_idempotency_key IS NOT NULL THEN
      DELETE FROM quota_consumptions 
      WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key AND consumption_type = 'wardrobe_add';
    END IF;
    
    RETURN QUERY SELECT 
      FALSE, COALESCE(v_current_used, 0), v_lifetime_limit,
      GREATEST(0, v_lifetime_limit - COALESCE(v_current_used, 0)),
      FALSE, 'monthly_quota_exceeded'::TEXT,
      COALESCE(v_monthly_used, 0), v_monthly_limit, 0;
    RETURN;
  END IF;
  
  IF COALESCE(v_current_used, 0) >= v_lifetime_limit THEN
    IF p_idempotency_key IS NOT NULL THEN
      DELETE FROM quota_consumptions 
      WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key AND consumption_type = 'wardrobe_add';
    END IF;
    
    RETURN QUERY SELECT 
      FALSE, COALESCE(v_current_used, 0), v_lifetime_limit, 0,
      FALSE, 'quota_exceeded'::TEXT,
      COALESCE(v_monthly_used, 0), v_monthly_limit, 
      GREATEST(0, v_monthly_limit - COALESCE(v_monthly_used, 0));
    RETURN;
  END IF;
  
  -- Consume
  UPDATE user_subscriptions
  SET total_wardrobe_adds_used = total_wardrobe_adds_used + 1, 
      wardrobe_adds_this_month = wardrobe_adds_this_month + 1,
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING total_wardrobe_adds_used, wardrobe_adds_this_month INTO v_current_used, v_monthly_used;
  
  RETURN QUERY SELECT 
    TRUE, v_current_used, v_lifetime_limit,
    GREATEST(0, v_lifetime_limit - v_current_used),
    FALSE, 'consumed'::TEXT,
    v_monthly_used, v_monthly_limit, GREATEST(0, v_monthly_limit - v_monthly_used);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────
-- Updated get_usage_counts to include monthly data
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_usage_counts()
RETURNS TABLE(
  scans_used INTEGER, 
  wardrobe_adds_used INTEGER, 
  is_pro BOOLEAN,
  scans_this_month INTEGER,
  wardrobe_adds_this_month INTEGER,
  scan_monthly_limit INTEGER,
  wardrobe_add_monthly_limit INTEGER
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_pro BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 0::INTEGER, 0::INTEGER, FALSE, 0::INTEGER, 0::INTEGER, 
      get_free_scan_monthly_limit(), get_free_wardrobe_add_monthly_limit();
    RETURN;
  END IF;

  -- Reset monthly counters if needed
  PERFORM maybe_reset_monthly_counters(v_user_id);

  -- Get pro status first for limit calculation
  SELECT us.is_pro INTO v_is_pro 
  FROM user_subscriptions us 
  WHERE us.user_id = v_user_id;

  RETURN QUERY
  SELECT 
    COALESCE(total_scans_used, 0)::INTEGER,
    COALESCE(total_wardrobe_adds_used, 0)::INTEGER,
    COALESCE(us.is_pro, FALSE),
    COALESCE(us.scans_this_month, 0)::INTEGER,
    COALESCE(us.wardrobe_adds_this_month, 0)::INTEGER,
    CASE WHEN COALESCE(us.is_pro, FALSE) THEN get_pro_scan_monthly_limit() ELSE get_free_scan_monthly_limit() END,
    CASE WHEN COALESCE(us.is_pro, FALSE) THEN get_pro_wardrobe_add_monthly_limit() ELSE get_free_wardrobe_add_monthly_limit() END
  FROM user_subscriptions us
  WHERE us.user_id = v_user_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::INTEGER, 0::INTEGER, FALSE, 0::INTEGER, 0::INTEGER,
      get_free_scan_monthly_limit(), get_free_wardrobe_add_monthly_limit();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────
-- Grant permissions
-- ─────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION get_free_scan_monthly_limit() TO authenticated;
GRANT EXECUTE ON FUNCTION get_free_wardrobe_add_monthly_limit() TO authenticated;
GRANT EXECUTE ON FUNCTION get_pro_scan_monthly_limit() TO authenticated;
GRANT EXECUTE ON FUNCTION get_pro_wardrobe_add_monthly_limit() TO authenticated;
GRANT EXECUTE ON FUNCTION maybe_reset_monthly_counters(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- Notes
-- ─────────────────────────────────────────────
-- - Monthly counters reset automatically when consume functions detect new month
-- - Pro users now have monthly caps (200 scans, 500 wardrobe adds)
-- - Free users have both lifetime (5/15) AND monthly (5/15) limits
-- - New reason code: 'monthly_quota_exceeded' for hitting monthly cap
-- - get_usage_counts() now returns monthly data for UI display
