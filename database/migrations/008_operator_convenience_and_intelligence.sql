-- CASEFLOW v0.7: operator convenience, saved views, exception inbox, invitation onboarding,
-- permission templates, and permission-aware assistant audit foundation.

CREATE TABLE IF NOT EXISTS user_dashboard_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  landing_view text NOT NULL DEFAULT 'MY_WORK',
  dashboard_layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('MATTERS','TASKS','DOCUMENTS','FIRM_REVIEWS','PUBLISHERS','BILLING')),
  filter_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_views_owner_idx ON saved_views(owner_user_id, resource_type, created_at DESC);

CREATE TABLE IF NOT EXISTS exception_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  matter_id uuid REFERENCES matters(id) ON DELETE CASCADE,
  exception_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('INFO','WARNING','URGENT')),
  title text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED')),
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  source_event_id uuid,
  dedupe_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS exception_events_open_dedupe_idx
  ON exception_events(organization_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('OPEN','ACKNOWLEDGED');
CREATE INDEX IF NOT EXISTS exception_events_queue_idx ON exception_events(organization_id, status, severity, opened_at);

CREATE TABLE IF NOT EXISTS permission_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  template_code text NOT NULL,
  display_name text NOT NULL,
  target_role_code text NOT NULL,
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  system_template boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, template_code)
);

CREATE TABLE IF NOT EXISTS network_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  invited_role_code text NOT NULL,
  invitation_type text NOT NULL CHECK (invitation_type IN ('MARKETER_AGENT','PUBLISHER_ADMIN','PUBLISHER_AGENT','SUBPUBLISHER_ADMIN','SUBPUBLISHER_AGENT')),
  target_organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  allow_child_publishers boolean NOT NULL DEFAULT false,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  expires_at timestamptz NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  accepted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS network_invitations_parent_idx ON network_invitations(parent_organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS assistant_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matter_id uuid REFERENCES matters(id) ON DELETE SET NULL,
  impersonation_session_id uuid REFERENCES impersonation_sessions(id) ON DELETE SET NULL,
  query_text text NOT NULL,
  intent text,
  response_summary text,
  next_action_code text,
  data_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_queries_user_idx ON assistant_queries(user_id, created_at DESC);

CREATE TRIGGER trg_saved_views_updated BEFORE UPDATE ON saved_views FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_permission_templates_updated BEFORE UPDATE ON permission_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO permission_templates(organization_id,template_code,display_name,target_role_code,permissions,system_template)
VALUES
  (NULL,'MARKETER_ADMIN_DEFAULT','Marketer Admin','MARKETER_ADMIN',ARRAY['matter:create','matter:read','marketer:network:read','marketer:agent:manage','marketer:publisher:create','report:read'],true),
  (NULL,'PUBLISHER_ADMIN_DEFAULT','Publisher Admin','PUBLISHER_ADMIN',ARRAY['matter:create','matter:read','marketer:network:read','marketer:agent:manage','marketer:publisher:create','report:read'],true),
  (NULL,'AGENT_DEFAULT','Agent','AGENT',ARRAY['matter:create','matter:read:own'],true),
  (NULL,'REPORTING_ONLY','Reporting Only','REPORTING_ONLY',ARRAY['report:read'],true)
ON CONFLICT (organization_id, template_code) DO NOTHING;
