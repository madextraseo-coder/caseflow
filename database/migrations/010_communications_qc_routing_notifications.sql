-- CASEFLOW v0.9: unified communications, reusable templates, follow-up automation,
-- intelligent document requests, firm capacity/routing priorities, and notifications.

CREATE TABLE IF NOT EXISTS communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  template_code text NOT NULL,
  display_name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('SMS','EMAIL','INTERNAL_NOTE')),
  purpose text NOT NULL,
  version text NOT NULL,
  body_template text NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, template_code, version)
);
CREATE INDEX IF NOT EXISTS communication_templates_lookup_idx
  ON communication_templates(organization_id, channel, purpose, active);

CREATE TABLE IF NOT EXISTS followup_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sequence_code text NOT NULL,
  display_name text NOT NULL,
  goal_code text NOT NULL,
  stop_on_suppression boolean NOT NULL DEFAULT true,
  stop_when_goal_satisfied boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sequence_code)
);

CREATE TABLE IF NOT EXISTS followup_sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES followup_sequences(id) ON DELETE CASCADE,
  step_order integer NOT NULL CHECK (step_order > 0),
  delay_minutes integer NOT NULL CHECK (delay_minutes >= 0),
  action_type text NOT NULL CHECK (action_type IN ('SEND_TEMPLATE','CREATE_TASK','NOTIFY_USER')),
  template_id uuid REFERENCES communication_templates(id) ON DELETE SET NULL,
  task_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(sequence_id, step_order)
);

CREATE TABLE IF NOT EXISTS followup_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES followup_sequences(id) ON DELETE CASCADE,
  matter_id uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','COMPLETED','STOPPED','FAILED')),
  current_step_order integer NOT NULL DEFAULT 0,
  next_run_at timestamptz,
  stop_reason text,
  enrolled_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sequence_id, matter_id)
);
CREATE INDEX IF NOT EXISTS followup_enrollments_due_idx
  ON followup_enrollments(status, next_run_at) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS missing_document_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  missing_categories text[] NOT NULL,
  communication_template_id uuid REFERENCES communication_templates(id) ON DELETE SET NULL,
  generated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS missing_document_request_matter_idx
  ON missing_document_request_events(matter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS law_firm_capacity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_firm_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  daily_capacity integer,
  daily_used integer NOT NULL DEFAULT 0,
  monthly_capacity integer,
  monthly_used integer NOT NULL DEFAULT 0,
  accepting_new_matters boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(law_firm_organization_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS law_firm_capacity_snapshot_idx
  ON law_firm_capacity_snapshots(snapshot_date DESC, accepting_new_matters);

CREATE TABLE IF NOT EXISTS routing_priority_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_code text NOT NULL,
  display_name text NOT NULL,
  distribution_mode text NOT NULL DEFAULT 'PRIORITY' CHECK (distribution_mode IN ('PRIORITY','WEIGHTED','ROUND_ROBIN')),
  case_type text NOT NULL DEFAULT 'MVA',
  accident_state text,
  active boolean NOT NULL DEFAULT true,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(processing_organization_id, policy_code)
);

CREATE TABLE IF NOT EXISTS routing_priority_policy_firms (
  policy_id uuid NOT NULL REFERENCES routing_priority_policies(id) ON DELETE CASCADE,
  law_firm_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 100,
  weight numeric(8,4) NOT NULL DEFAULT 1,
  skip_when_capacity_full boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(policy_id, law_firm_organization_id)
);

CREATE TABLE IF NOT EXISTS notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  matter_id uuid REFERENCES matters(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('URGENT','CASE','DOCUMENT','FIRM','BILLING','SYSTEM')),
  title text NOT NULL,
  detail text,
  severity text NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO','WARNING','URGENT')),
  read_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_events_user_idx
  ON notification_events(user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  event_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  digest_enabled boolean NOT NULL DEFAULT true,
  digest_time time NOT NULL DEFAULT '08:00',
  digest_delivery text NOT NULL DEFAULT 'EMAIL_AND_IN_APP' CHECK (digest_delivery IN ('EMAIL_AND_IN_APP','IN_APP_ONLY','EMAIL_ONLY')),
  timezone text NOT NULL DEFAULT 'America/New_York',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_communication_templates_updated BEFORE UPDATE ON communication_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_followup_sequences_updated BEFORE UPDATE ON followup_sequences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_followup_enrollments_updated BEFORE UPDATE ON followup_enrollments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_routing_priority_policies_updated BEFORE UPDATE ON routing_priority_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_notification_preferences_updated BEFORE UPDATE ON user_notification_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
