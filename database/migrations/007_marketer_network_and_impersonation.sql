-- CASEFLOW v0.6: multi-tier marketer/publisher network, immutable attribution, and audited View As support.

ALTER TYPE organization_type ADD VALUE IF NOT EXISTS 'MARKETER';
ALTER TYPE organization_type ADD VALUE IF NOT EXISTS 'PUBLISHER';

DO $$ BEGIN
  CREATE TYPE impersonation_mode AS ENUM ('READ_ONLY', 'SUPPORT_ACTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS organization_network_policies (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  max_descendant_depth integer NOT NULL DEFAULT 5 CHECK (max_descendant_depth BETWEEN 0 AND 12),
  allow_managed_publishers boolean NOT NULL DEFAULT true,
  allow_subpublishers boolean NOT NULL DEFAULT true,
  permission_ceiling text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketer_role_permission_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_code text NOT NULL,
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_organization_id, role_code)
);
CREATE INDEX IF NOT EXISTS marketer_role_permission_profiles_org_idx
  ON marketer_role_permission_profiles(owner_organization_id, role_code);

ALTER TABLE lead_submissions
  ADD COLUMN IF NOT EXISTS submitting_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitting_membership_id uuid REFERENCES organization_memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribution_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS matter_attribution_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL UNIQUE REFERENCES matters(id) ON DELETE CASCADE,
  lead_submission_id uuid REFERENCES lead_submissions(id) ON DELETE SET NULL,
  source_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  submitting_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  organization_path jsonb NOT NULL,
  campaign_code text,
  source_code text,
  captured_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_matter_attribution_snapshots_immutable ON matter_attribution_snapshots;
CREATE TRIGGER trg_matter_attribution_snapshots_immutable
BEFORE UPDATE OR DELETE ON matter_attribution_snapshots
FOR EACH ROW EXECUTE FUNCTION immutable_event_table();

CREATE TABLE IF NOT EXISTS support_impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  actual_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
  target_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mode impersonation_mode NOT NULL DEFAULT 'READ_ONLY',
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_ip inet,
  user_agent text,
  CHECK (actual_user_id IS DISTINCT FROM target_user_id),
  CHECK (expires_at > started_at)
);
CREATE INDEX IF NOT EXISTS support_impersonation_sessions_actual_idx
  ON support_impersonation_sessions(actual_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS support_impersonation_sessions_target_idx
  ON support_impersonation_sessions(target_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS support_impersonation_sessions_active_idx
  ON support_impersonation_sessions(actual_user_id, expires_at)
  WHERE ended_at IS NULL;

CREATE OR REPLACE FUNCTION set_network_policy_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_network_policy_updated ON organization_network_policies;
CREATE TRIGGER trg_network_policy_updated
BEFORE UPDATE ON organization_network_policies
FOR EACH ROW EXECUTE FUNCTION set_network_policy_updated_at();

DROP TRIGGER IF EXISTS trg_marketer_role_profile_updated ON marketer_role_permission_profiles;
CREATE TRIGGER trg_marketer_role_profile_updated
BEFORE UPDATE ON marketer_role_permission_profiles
FOR EACH ROW EXECUTE FUNCTION set_network_policy_updated_at();
