-- CASEFLOW v0.7: retainer-first firm handoff, one secure portal release, SLA snapshot, and billing events.

CREATE TABLE IF NOT EXISTS firm_review_sla_policies (
  processing_organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  default_review_hours integer NOT NULL DEFAULT 72 CHECK (default_review_hours BETWEEN 1 AND 720),
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS firm_review_sla_overrides (
  processing_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  law_firm_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  review_hours integer NOT NULL CHECK (review_hours BETWEEN 1 AND 720),
  active boolean NOT NULL DEFAULT true,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (processing_organization_id, law_firm_organization_id)
);

ALTER TABLE matter_packets
  ADD COLUMN IF NOT EXISTS retainer_signature_request_id uuid REFERENCES signature_requests(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE TABLE IF NOT EXISTS firm_portal_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  law_firm_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  matter_packet_id uuid NOT NULL REFERENCES matter_packets(id) ON DELETE RESTRICT,
  signature_request_id uuid NOT NULL REFERENCES signature_requests(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('PREPARED','RELEASED','REVOKED','ERROR')),
  sla_hours_snapshot integer NOT NULL CHECK (sla_hours_snapshot BETWEEN 1 AND 720),
  released_at timestamptz,
  sla_deadline_at timestamptz,
  revoked_at timestamptz,
  release_reason text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status <> 'RELEASED') OR (released_at IS NOT NULL AND sla_deadline_at IS NOT NULL)),
  CHECK (sla_deadline_at IS NULL OR released_at IS NULL OR sla_deadline_at > released_at),
  UNIQUE (matter_id, matter_packet_id)
);
CREATE INDEX IF NOT EXISTS firm_portal_releases_firm_idx
  ON firm_portal_releases(law_firm_organization_id, status, released_at DESC);
CREATE INDEX IF NOT EXISTS firm_portal_releases_deadline_idx
  ON firm_portal_releases(status, sla_deadline_at)
  WHERE status='RELEASED';

CREATE TABLE IF NOT EXISTS billing_disposition_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  firm_portal_release_id uuid REFERENCES firm_portal_releases(id) ON DELETE SET NULL,
  disposition text NOT NULL CHECK (disposition IN (
    'PENDING','BILLABLE_ACCEPTED','BILLABLE_SLA_EXPIRED','NON_BILLABLE_VALID_REJECTION','DISPUTED'
  )),
  reason_code text,
  actor_type actor_type NOT NULL,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_disposition_events_matter_idx
  ON billing_disposition_events(matter_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_billing_disposition_events_immutable ON billing_disposition_events;
CREATE TRIGGER trg_billing_disposition_events_immutable
BEFORE UPDATE OR DELETE ON billing_disposition_events
FOR EACH ROW EXECUTE FUNCTION immutable_event_table();

CREATE OR REPLACE FUNCTION enforce_retainer_first_firm_release() RETURNS trigger AS $$
DECLARE
  signed_matter uuid;
  packet_matter uuid;
  packet_status text;
  assigned_firm uuid;
BEGIN
  IF NEW.status <> 'RELEASED' THEN
    RETURN NEW;
  END IF;

  SELECT sr.matter_id INTO signed_matter
    FROM signature_requests sr
   WHERE sr.id=NEW.signature_request_id
     AND sr.signed_at IS NOT NULL
     AND sr.signed_document_storage_key IS NOT NULL;
  IF signed_matter IS NULL OR signed_matter <> NEW.matter_id THEN
    RAISE EXCEPTION 'Firm portal release blocked: a completed signed retainer is required first';
  END IF;

  SELECT mp.matter_id, mp.status INTO packet_matter, packet_status
    FROM matter_packets mp
   WHERE mp.id=NEW.matter_packet_id;
  IF packet_matter IS NULL OR packet_matter <> NEW.matter_id OR packet_status NOT IN ('READY','DELIVERED') THEN
    RAISE EXCEPTION 'Firm portal release blocked: the final packet must be ready';
  END IF;

  SELECT assigned_law_firm_organization_id INTO assigned_firm FROM matters WHERE id=NEW.matter_id;
  IF assigned_firm IS NULL OR assigned_firm <> NEW.law_firm_organization_id THEN
    RAISE EXCEPTION 'Firm portal release blocked: assigned firm mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM document_requests dr
      CROSS JOIN LATERAL unnest(dr.requested_categories) rc(category)
     WHERE dr.matter_id=NEW.matter_id
       AND dr.revoked_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM documents d
          WHERE d.matter_id=NEW.matter_id
            AND d.category=rc.category
            AND d.review_status='APPROVED'
            AND d.quarantine_status='RELEASED'
       )
  ) THEN
    RAISE EXCEPTION 'Firm portal release blocked: all requested documents must be QC-approved and released';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_retainer_first_firm_release ON firm_portal_releases;
CREATE TRIGGER trg_retainer_first_firm_release
BEFORE INSERT OR UPDATE OF status ON firm_portal_releases
FOR EACH ROW EXECUTE FUNCTION enforce_retainer_first_firm_release();

INSERT INTO firm_review_sla_policies(processing_organization_id,default_review_hours)
SELECT id,72 FROM organizations WHERE type='CENTRAL'
ON CONFLICT (processing_organization_id) DO NOTHING;
