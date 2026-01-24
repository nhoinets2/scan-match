-- Analytics Events Table Migration
-- Supabase-based analytics sink for event tracking
-- No external vendor dependency, queryable via dashboard

-- ─────────────────────────────────────────────
-- CREATE ANALYTICS EVENTS TABLE
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NULL,
  session_id TEXT NULL,
  name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ─────────────────────────────────────────────
-- INDEXES FOR EFFICIENT QUERIES
-- ─────────────────────────────────────────────

-- Query by time (most recent first)
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON public.analytics_events(created_at DESC);

-- Query by event name + time (e.g., all trust_filter_completed events)
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created_at
  ON public.analytics_events(name, created_at DESC);

-- Query by user + time (user event history)
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created_at
  ON public.analytics_events(user_id, created_at DESC);

-- GIN index for querying inside properties JSONB
CREATE INDEX IF NOT EXISTS idx_analytics_events_properties_gin
  ON public.analytics_events USING GIN (properties);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Insert: only authenticated users can write their own events
CREATE POLICY "analytics_events_insert_own"
ON public.analytics_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Read: no client reads (query from dashboard / service role only)
CREATE POLICY "analytics_events_no_select_client"
ON public.analytics_events
FOR SELECT
TO authenticated
USING (false);

-- ─────────────────────────────────────────────
-- COMMENTS
-- ─────────────────────────────────────────────

COMMENT ON TABLE public.analytics_events IS 'Event tracking for analytics. Client writes only, read via dashboard/service role.';
COMMENT ON COLUMN public.analytics_events.session_id IS 'Unique per app launch, for session-level analysis';
COMMENT ON COLUMN public.analytics_events.name IS 'Event name (e.g., trust_filter_completed, scan_started)';
COMMENT ON COLUMN public.analytics_events.properties IS 'Event-specific properties as JSONB';

-- ─────────────────────────────────────────────
-- USEFUL QUERIES (run from dashboard)
-- ─────────────────────────────────────────────

-- Count events by name (last 24 hours)
-- SELECT name, COUNT(*) as count
-- FROM analytics_events
-- WHERE created_at > now() - interval '24 hours'
-- GROUP BY name
-- ORDER BY count DESC;

-- Trust Filter demote rate
-- SELECT 
--   COUNT(*) FILTER (WHERE properties->>'action' = 'demote') as demoted,
--   COUNT(*) FILTER (WHERE properties->>'action' = 'hide') as hidden,
--   COUNT(*) FILTER (WHERE properties->>'action' = 'keep') as kept,
--   COUNT(*) as total
-- FROM analytics_events
-- WHERE name = 'trust_filter_pair_decision'
--   AND created_at > now() - interval '7 days';

-- Style signals success rate
-- SELECT 
--   COUNT(*) FILTER (WHERE name = 'style_signals_completed') as success,
--   COUNT(*) FILTER (WHERE name = 'style_signals_failed') as failed
-- FROM analytics_events
-- WHERE name IN ('style_signals_completed', 'style_signals_failed')
--   AND created_at > now() - interval '7 days';

-- Trust Filter reason breakdown
-- SELECT 
--   properties->>'reason' as reason,
--   COUNT(*) as count
-- FROM analytics_events
-- WHERE name = 'trust_filter_pair_decision'
--   AND created_at > now() - interval '7 days'
-- GROUP BY properties->>'reason'
-- ORDER BY count DESC;
