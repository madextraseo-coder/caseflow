import type { PoolClient } from "pg";

/**
 * Processes released firm packets whose snapshotted review window has expired.
 * Intended for an authenticated scheduled worker. It is idempotent because a matter
 * is skipped once a terminal billing event already exists for the same release.
 */
export async function processExpiredFirmReviews(client: PoolClient, limit = 100) {
  const releases = await client.query<{ id: string; matter_id: string; sla_hours_snapshot: number }>(
    `SELECT fpr.id::text,fpr.matter_id::text,fpr.sla_hours_snapshot
       FROM firm_portal_releases fpr
      WHERE fpr.status='RELEASED'
        AND fpr.sla_deadline_at <= now()
        AND NOT EXISTS (
          SELECT 1 FROM billing_disposition_events bde
           WHERE bde.firm_portal_release_id=fpr.id
             AND bde.disposition IN ('BILLABLE_ACCEPTED','BILLABLE_SLA_EXPIRED','NON_BILLABLE_VALID_REJECTION','DISPUTED')
        )
      ORDER BY fpr.sla_deadline_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $1`,
    [limit]
  );

  for (const release of releases.rows) {
    await client.query(
      `INSERT INTO billing_disposition_events(
         matter_id,firm_portal_release_id,disposition,reason_code,actor_type,metadata
       ) VALUES($1,$2,'BILLABLE_SLA_EXPIRED','NO_VALID_REJECTION_BEFORE_DEADLINE','SYSTEM',$3::jsonb)`,
      [release.matter_id,release.id,JSON.stringify({ slaHoursSnapshot: release.sla_hours_snapshot })]
    );
    await client.query(
      `INSERT INTO audit_events(
         organization_id,matter_id,actor_type,event_type,entity_type,entity_id,metadata
       ) SELECT processing_organization_id,id,'SYSTEM','MATTER_AUTO_BILLABLE_SLA_EXPIRED','FIRM_PORTAL_RELEASE',$2,$3::jsonb
           FROM matters WHERE id=$1`,
      [release.matter_id,release.id,JSON.stringify({ slaHoursSnapshot: release.sla_hours_snapshot })]
    );
  }
  return { processed: releases.rows.length };
}
