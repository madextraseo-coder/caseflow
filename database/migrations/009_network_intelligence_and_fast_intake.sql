-- CASEFLOW v0.8: publisher quality/caps, agent performance, support diagnostics, and encrypted intake drafts.

CREATE TABLE IF NOT EXISTS publisher_quality_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  contactability_score smallint NOT NULL CHECK (contactability_score BETWEEN 0 AND 100),
  consent_score smallint NOT NULL CHECK (consent_score BETWEEN 0 AND 100),
  qualification_score smallint NOT NULL CHECK (qualification_score BETWEEN 0 AND 100),
  duplicate_control_score smallint NOT NULL CHECK (duplicate_control_score BETWEEN 0 AND 100),
  firm_acceptance_score smallint NOT NULL CHECK (firm_acceptance_score BETWEEN 0 AND 100),
  lead_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS publisher_quality_latest_idx ON publisher_quality_snapshots(organization_id, period_end DESC, calculated_at DESC);

CREATE TABLE IF NOT EXISTS publisher_caps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_code text,
  accident_state text,
  case_type text NOT NULL DEFAULT 'MVA',
  daily_cap integer CHECK (daily_cap IS NULL OR daily_cap > 0),
  weekly_cap integer CHECK (weekly_cap IS NULL OR weekly_cap > 0),
  monthly_cap integer CHECK (monthly_cap IS NULL OR monthly_cap > 0),
  hard_stop boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, campaign_code, accident_state, case_type)
);
CREATE INDEX IF NOT EXISTS publisher_caps_active_idx ON publisher_caps(organization_id, active);

CREATE TABLE IF NOT EXISTS agent_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  lead_count integer NOT NULL DEFAULT 0,
  contacted_count integer NOT NULL DEFAULT 0,
  qualified_count integer NOT NULL DEFAULT 0,
  median_first_response_seconds integer,
  contact_rate numeric(5,2),
  qualification_rate numeric(5,2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS agent_performance_org_idx ON agent_performance_snapshots(organization_id, period_end DESC);

CREATE TABLE IF NOT EXISTS intake_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft_key text NOT NULL,
  schema_version text NOT NULL DEFAULT 'v1',
  payload_ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, draft_key)
);
CREATE INDEX IF NOT EXISTS intake_drafts_expiry_idx ON intake_drafts(expires_at);

CREATE TABLE IF NOT EXISTS inline_matter_edit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  matter_id uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  field_code text NOT NULL,
  old_value_redacted text,
  new_value_redacted text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inline_matter_edit_events_matter_idx ON inline_matter_edit_events(matter_id, created_at DESC);

CREATE TRIGGER trg_publisher_caps_updated BEFORE UPDATE ON publisher_caps FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_intake_drafts_updated BEFORE UPDATE ON intake_drafts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
