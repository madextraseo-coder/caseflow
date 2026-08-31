import type { PoolClient } from "pg";
import { buildPacketManifest } from "@/lib/packet-builder";

export async function effectiveFirmReviewHours(
  client: PoolClient,
  processingOrganizationId: string,
  lawFirmOrganizationId: string
): Promise<number> {
  const result = await client.query<{ hours: number }>(
    `SELECT COALESCE(
        (SELECT review_hours FROM firm_review_sla_overrides
          WHERE processing_organization_id=$1 AND law_firm_organization_id=$2 AND active=true),
        (SELECT default_review_hours FROM firm_review_sla_policies
          WHERE processing_organization_id=$1),
        72
      )::int AS hours`,
    [processingOrganizationId, lawFirmOrganizationId]
  );
  return result.rows[0]?.hours ?? 72;
}

export async function assertFirmReleaseReady(client: PoolClient, matterId: string) {
  const matter = (await client.query<{
    processing_organization_id: string;
    law_firm_organization_id: string | null;
  }>(
    `SELECT processing_organization_id::text,
            assigned_law_firm_organization_id::text AS law_firm_organization_id
       FROM matters WHERE id=$1 FOR UPDATE`,
    [matterId]
  )).rows[0];
  if (!matter?.law_firm_organization_id) throw new Error("Assign a law firm before releasing a packet");

  const signature = (await client.query<{ id: string }>(
    `SELECT id::text
       FROM signature_requests
      WHERE matter_id=$1
        AND signed_at IS NOT NULL
        AND signed_document_storage_key IS NOT NULL
      ORDER BY signed_at DESC
      LIMIT 1`,
    [matterId]
  )).rows[0];
  if (!signature) throw new Error("Signed retainer required before firm access");

  const missing = await client.query<{ category: string }>(
    `SELECT DISTINCT rc.category
       FROM document_requests dr
       CROSS JOIN LATERAL unnest(dr.requested_categories) rc(category)
      WHERE dr.matter_id=$1
        AND dr.revoked_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM documents d
           WHERE d.matter_id=$1
             AND d.category=rc.category
             AND d.review_status='APPROVED'
             AND d.quarantine_status='RELEASED'
        )`,
    [matterId]
  );
  if (missing.rows.length) {
    throw new Error(`Firm release blocked; missing approved documents: ${missing.rows.map((r) => r.category).join(", ")}`);
  }

  return { ...matter, signatureRequestId: signature.id };
}

export async function buildFinalPacketForRelease(client: PoolClient, matterId: string, userId: string) {
  const readiness = await assertFirmReleaseReady(client, matterId);
  const manifest = await buildPacketManifest(client, matterId);
  const version = (await client.query<{ v: number }>(
    `SELECT COALESCE(MAX(version),0)+1 AS v FROM matter_packets WHERE matter_id=$1`,
    [matterId]
  )).rows[0].v;
  const packet = (await client.query<{ id: string }>(
    `INSERT INTO matter_packets(
       matter_id,version,status,manifest,retainer_signature_request_id,created_by_user_id
     ) VALUES($1,$2,'READY',$3::jsonb,$4,$5)
     RETURNING id::text`,
    [matterId, version, JSON.stringify(manifest), readiness.signatureRequestId, userId]
  )).rows[0];
  return { readiness, manifest, version, packetId: packet.id };
}
