-- Trust Filter Remote Config Table
-- Allows dynamic updates to Trust Filter rules without app updates
-- Only safe subset of keys can be overridden (validated client-side)

-- ─────────────────────────────────────────────
-- CREATE CONFIG TABLE
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trust_filter_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Config version (increment when making changes)
  version INTEGER NOT NULL DEFAULT 1,
  -- Whether this config is active (only one should be active at a time)
  is_active BOOLEAN NOT NULL DEFAULT false,
  -- The config overrides as JSONB
  -- Only keys in REMOTE_OVERRIDE_ALLOWED_KEYS are applied client-side
  config_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────

-- Fast lookup for active config
CREATE INDEX IF NOT EXISTS idx_trust_filter_config_active
  ON public.trust_filter_config(is_active)
  WHERE is_active = true;

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

ALTER TABLE public.trust_filter_config ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users can read the active config
CREATE POLICY "trust_filter_config_read_active"
ON public.trust_filter_config
FOR SELECT
TO authenticated
USING (is_active = true);

-- Write: no client writes (admin only via dashboard/service role)
-- Config changes should go through proper review process

-- ─────────────────────────────────────────────
-- TRIGGER: Ensure only one active config
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ensure_single_active_config()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    -- Deactivate all other configs
    UPDATE public.trust_filter_config
    SET is_active = false, updated_at = now()
    WHERE id != NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trust_filter_config_single_active
  BEFORE INSERT OR UPDATE ON public.trust_filter_config
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_active_config();

-- ─────────────────────────────────────────────
-- TRIGGER: Update timestamp
-- ─────────────────────────────────────────────

CREATE TRIGGER trust_filter_config_updated_at
  BEFORE UPDATE ON public.trust_filter_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- COMMENTS
-- ─────────────────────────────────────────────

COMMENT ON TABLE public.trust_filter_config IS 'Remote config for Trust Filter rules. Only one active config at a time.';
COMMENT ON COLUMN public.trust_filter_config.config_overrides IS 'JSONB overrides. Only safe keys applied client-side (see REMOTE_OVERRIDE_ALLOWED_KEYS).';
COMMENT ON COLUMN public.trust_filter_config.version IS 'Increment when making changes. Client can cache by version.';

-- ─────────────────────────────────────────────
-- INSERT DEFAULT CONFIG (inactive, as template)
-- ─────────────────────────────────────────────

INSERT INTO public.trust_filter_config (
  version,
  is_active,
  config_overrides,
  description,
  created_by
) VALUES (
  1,
  false,
  '{
    "confidence_thresholds": {
      "archetype_hide_min_primary_conf": 0.65
    },
    "formality": {
      "hard_gap_threshold": 4,
      "demote_gap_threshold": 2
    },
    "season": {
      "hard_diff_threshold": 2,
      "demote_diff_threshold": 1
    }
  }'::jsonb,
  'Default template config (not active). Activate and modify as needed.',
  'migration'
);

-- ─────────────────────────────────────────────
-- EXAMPLE: Activate a config
-- ─────────────────────────────────────────────

-- To activate a config, just set is_active = true.
-- The trigger will automatically deactivate others.
--
-- UPDATE public.trust_filter_config
-- SET is_active = true
-- WHERE id = 'your-config-id';

-- ─────────────────────────────────────────────
-- ALLOWED OVERRIDE KEYS (reference)
-- ─────────────────────────────────────────────

-- These keys can be overridden remotely (from src/lib/trust-filter/config.ts):
--
-- confidence_thresholds.archetype_hide_min_primary_conf
-- formality.hard_gap_threshold
-- formality.demote_gap_threshold
-- formality.athleisure_vs_polished_gap
-- season.hard_diff_threshold
-- season.demote_diff_threshold
-- statement.both_high_distance_threshold
-- pattern.both_bold_distance_threshold
-- anchor_rule.min_distance
-- anchor_rule.max_formality_gap
