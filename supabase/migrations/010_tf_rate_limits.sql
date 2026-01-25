-- ============================================
-- Trust Filter Rate Limits
-- Persistent rate limiting for scan_direct API
-- ============================================

-- Table for tracking rate limit buckets per user
-- Uses time-bucketed keys for hourly and burst (5-min) limits
CREATE TABLE IF NOT EXISTS tf_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_key TEXT NOT NULL, -- e.g., 'hour:2024-01-25T14' or 'burst:2024-01-25T14:30'
  count INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique constraint for upsert
  CONSTRAINT tf_rate_limits_user_bucket UNIQUE (user_id, bucket_key)
);

-- Index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_tf_rate_limits_expires 
  ON tf_rate_limits(expires_at);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_tf_rate_limits_user 
  ON tf_rate_limits(user_id, bucket_key);

-- RLS policies
ALTER TABLE tf_rate_limits ENABLE ROW LEVEL SECURITY;

-- Users can only see their own rate limits (for debugging)
CREATE POLICY "Users can view own rate limits"
  ON tf_rate_limits FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert/update (Edge Function uses service key)
CREATE POLICY "Service role can manage rate limits"
  ON tf_rate_limits FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Helper function to check and increment rate limit
-- Returns: { allowed: boolean, current_count: int, limit: int, retry_after_seconds: int }
-- ============================================
CREATE OR REPLACE FUNCTION check_tf_rate_limit(
  p_user_id UUID,
  p_bucket_type TEXT, -- 'hour' or 'burst'
  p_limit INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bucket_key TEXT;
  v_expires_at TIMESTAMPTZ;
  v_current_count INTEGER;
  v_retry_after INTEGER;
BEGIN
  -- Calculate bucket key and expiry based on type
  IF p_bucket_type = 'hour' THEN
    -- Hourly bucket: resets at the top of each hour
    v_bucket_key := 'hour:' || to_char(now(), 'YYYY-MM-DD-HH24');
    v_expires_at := date_trunc('hour', now()) + interval '1 hour';
  ELSIF p_bucket_type = 'burst' THEN
    -- 5-minute burst bucket
    v_bucket_key := 'burst:' || to_char(date_trunc('minute', now()) - 
      (extract(minute from now())::int % 5) * interval '1 minute', 'YYYY-MM-DD-HH24-MI');
    v_expires_at := date_trunc('minute', now()) - 
      (extract(minute from now())::int % 5) * interval '1 minute' + interval '5 minutes';
  ELSE
    RETURN jsonb_build_object('allowed', false, 'error', 'Invalid bucket type');
  END IF;

  -- Upsert the rate limit counter
  INSERT INTO tf_rate_limits (user_id, bucket_key, count, expires_at, updated_at)
  VALUES (p_user_id, v_bucket_key, 1, v_expires_at, now())
  ON CONFLICT (user_id, bucket_key) 
  DO UPDATE SET 
    count = tf_rate_limits.count + 1,
    updated_at = now()
  RETURNING count INTO v_current_count;

  -- Check if over limit
  IF v_current_count > p_limit THEN
    v_retry_after := GREATEST(1, EXTRACT(EPOCH FROM (v_expires_at - now()))::INTEGER);
    RETURN jsonb_build_object(
      'allowed', false,
      'current_count', v_current_count,
      'limit', p_limit,
      'retry_after_seconds', v_retry_after,
      'bucket_type', p_bucket_type
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current_count', v_current_count,
    'limit', p_limit,
    'bucket_type', p_bucket_type
  );
END;
$$;

-- ============================================
-- Cleanup function for expired rate limit entries
-- Run periodically (e.g., every hour via cron)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_tf_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM tf_rate_limits
  WHERE expires_at < now();
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION check_tf_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_tf_rate_limits TO service_role;
