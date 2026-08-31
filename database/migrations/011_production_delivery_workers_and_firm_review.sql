-- CASEFLOW v1.0: production delivery outbox/workers, authenticated firm review SLA,
-- push notification subscriptions, and live capacity snapshots.
-- Technical controls do not by themselves establish HIPAA or legal compliance.

CREATE TABLE IF NOT EXISTS outbound_delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  matter_id uuid REFERENCES matters(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('SMS','EMAIL','PUSH')),
  purpose text NOT NULL,
  recipient_ciphertext text NOT NULL,
  subject_redacted text,
  body_redacted text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','SENT','DELIVERED','FAILED','DEAD_LETTER','CANCELLED')),
  provider_code text,
  provider_message_id text,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbound_delivery_jobs_due_idx
  ON outbound_delivery_jobs(status, scheduled_at) WHERE status IN ('QUEUED','FAILED');

CREATE TABLE IF NOT EXISTS push_notification_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_code text NOT NULL DEFAULT 'ONESIGNAL',
  provider_subscription_id_ciphertext text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider_code, provider_subscription_id_ciphertext)
);
CREATE INDEX IF NOT EXISTS push_notification_subscriptions_user_idx
  ON push_notification_subscriptions(user_id, active);

CREATE TABLE IF NOT EXISTS law_firm_review_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  law_firm_organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  review_hours integer NOT NULL DEFAULT 72 CHECK (review_hours BETWEEN 1 AND 720),
  auto_billable_on_expiry boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT(processing_organization_id, law_firm_organization_id)
);

CREATE TABLE IF NOT EXISTS law_firm_review_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  law_firm_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
  review_hours_snapshot integer NOT NULL CHECK (review_hours_snapshot BETWEEN 1 AND 720),
  auto_billable_snapshot boolean NOT NULL DEFAULT true,
  delivered_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  firm_disposition text NOT NULL DEFAULT 'PENDING' CHECK (firm_disposition IN ('PENDING','ACCEPTED','REJECTED','CORRECTION_REQUESTED','AUTO_BILLABLE')),
  billing_disposition text NOT NULL DEFAULT 'PENDING' CHECK (billing_disposition IN ('PENDING','BILLABLE','NON_BILLABLE','DISPUTED')),
  rejection_reason_code text,
  decision_note text,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  auto_billed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(matter_id, law_firm_organization_id, delivery_id),
  CHECK (deadline_at >= delivered_at)
);
CREATE INDEX IF NOT EXISTS law_firm_review_deadline_idx
  ON law_firm_review_instances(firm_disposition, deadline_at) WHERE firm_disposition='PENDING';

ALTER TABLE law_firm_capacity_snapshots
  ADD COLUMN IF NOT EXISTS pending_review_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_assignment_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capacity_remaining integer;

ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_phone_ciphertext text;

ALTER TABLE notification_events
  ADD COLUMN IF NOT EXISTS email_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_queued_at timestamptz;

ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS last_digest_sent_at timestamptz;

CREATE TABLE IF NOT EXISTS worker_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_code text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','SUCCEEDED','FAILED')),
  processed_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS worker_run_events_code_idx ON worker_run_events(worker_code, started_at DESC);

CREATE TRIGGER trg_outbound_delivery_jobs_updated BEFORE UPDATE ON outbound_delivery_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_push_notification_subscriptions_updated BEFORE UPDATE ON push_notification_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_law_firm_review_policies_updated BEFORE UPDATE ON law_firm_review_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_law_firm_review_instances_updated BEFORE UPDATE ON law_firm_review_instances FOR EACH ROW EXECUTE FUNCTION set_updated_at();
