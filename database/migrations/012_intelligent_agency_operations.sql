-- CASEFLOW v1.1 intelligent agency operations.
-- Technical controls do not by themselves establish HIPAA or legal compliance.

CREATE TABLE IF NOT EXISTS secure_share_packages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 matter_id uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE, recipient_type text NOT NULL CHECK(recipient_type IN ('CLAIMANT','LAW_FIRM','OTHER_AUTHORIZED')),
 recipient_ciphertext text NOT NULL, delivery_mode text NOT NULL CHECK(delivery_mode IN ('SMS','EMAIL','BOTH','SMART')),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz, require_otp boolean NOT NULL DEFAULT true,
 allow_download boolean NOT NULL DEFAULT false, created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 opened_at timestamptz, authenticated_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS secure_share_packages_matter_idx ON secure_share_packages(matter_id,created_at DESC);

CREATE TABLE IF NOT EXISTS secure_share_documents (
 package_id uuid NOT NULL REFERENCES secure_share_packages(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
 PRIMARY KEY(package_id,document_id)
);

CREATE TABLE IF NOT EXISTS secure_share_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), package_id uuid NOT NULL REFERENCES secure_share_packages(id) ON DELETE CASCADE,
 event_type text NOT NULL, channel text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS secure_share_events_package_idx ON secure_share_events(package_id,created_at);

CREATE TABLE IF NOT EXISTS agency_briefs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 brief_date date NOT NULL, metrics jsonb NOT NULL DEFAULT '{}'::jsonb, priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
 generated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,brief_date)
);

CREATE TABLE IF NOT EXISTS operational_findings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 finding_type text NOT NULL, severity text NOT NULL CHECK(severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
 entity_type text, entity_id uuid, title text NOT NULL, explanation text NOT NULL, evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 recommended_action text, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','INVESTIGATING','ASSIGNED','RESOLVED','IGNORED')),
 assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL, detected_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS operational_findings_open_idx ON operational_findings(organization_id,status,severity,detected_at DESC);

CREATE TABLE IF NOT EXISTS lead_priority_scores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), matter_id uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, score smallint NOT NULL CHECK(score BETWEEN 0 AND 100),
 band text NOT NULL CHECK(band IN ('LOW','NORMAL','HIGH','URGENT')), factors jsonb NOT NULL DEFAULT '{}'::jsonb,
 model_version text NOT NULL DEFAULT 'ops-v1', calculated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_priority_latest_idx ON lead_priority_scores(matter_id,calculated_at DESC);

CREATE TABLE IF NOT EXISTS revenue_funnel_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 source_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL, campaign_code text, period_start date NOT NULL, period_end date NOT NULL,
 submitted_count integer NOT NULL DEFAULT 0, contacted_count integer NOT NULL DEFAULT 0, qualified_count integer NOT NULL DEFAULT 0,
 docs_complete_count integer NOT NULL DEFAULT 0, firm_delivered_count integer NOT NULL DEFAULT 0, accepted_count integer NOT NULL DEFAULT 0,
 billable_count integer NOT NULL DEFAULT 0, spend_cents bigint, revenue_cents bigint, calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS routing_simulations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, lookback_days integer NOT NULL DEFAULT 30 CHECK(lookback_days BETWEEN 1 AND 365),
 proposed_rules jsonb NOT NULL, result_summary jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'PENDING', created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS automation_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name text NOT NULL, version integer NOT NULL DEFAULT 1, trigger_code text NOT NULL, conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
 actions jsonb NOT NULL DEFAULT '[]'::jsonb, active boolean NOT NULL DEFAULT false, dry_run boolean NOT NULL DEFAULT true,
 requires_approval boolean NOT NULL DEFAULT true, created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_rules_active_idx ON automation_rules(organization_id,trigger_code,active);

CREATE TABLE IF NOT EXISTS automation_executions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_id uuid NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, matter_id uuid REFERENCES matters(id) ON DELETE CASCADE,
 mode text NOT NULL CHECK(mode IN ('DRY_RUN','LIVE')), result jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS copilot_action_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, matter_id uuid REFERENCES matters(id) ON DELETE CASCADE,
 prompt_redacted text NOT NULL, proposal jsonb NOT NULL, consequential boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','APPROVED','EXECUTED','REJECTED','EXPIRED')),
 approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes'
);

CREATE TRIGGER trg_automation_rules_updated BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
