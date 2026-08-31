import { NextRequest, NextResponse } from "next/server";
import { getPrincipalFromRequest } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { getMatterAccessMembership } from "@/lib/matter-access";
import { isTrustedBrowserMutation } from "@/lib/csrf";
import { buildFinalPacketForRelease, effectiveFirmReviewHours } from "@/lib/firm-release";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const principal = await getPrincipalFromRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  try {
    const result = await transaction(async (client) => {
      const membership = await getMatterAccessMembership(client, principal, id, "matter:write");
      if (!membership) return null;
      if (!["PLATFORM","CENTRAL"].includes(membership.organizationType)) {
        throw new Error("Only platform or central intake users may release a firm packet");
      }

      const existing = await client.query<{ id: string }>(
        `SELECT id::text FROM firm_portal_releases WHERE matter_id=$1 AND status='RELEASED' LIMIT 1`,
        [id]
      );
      if (existing.rows[0]) throw new Error("This matter has already been released to the firm portal");

      const built = await buildFinalPacketForRelease(client, id, principal.userId);
      const hours = await effectiveFirmReviewHours(
        client,
        built.readiness.processing_organization_id,
        built.readiness.law_firm_organization_id!
      );

      const release = (await client.query<{ id: string; released_at: string; sla_deadline_at: string }>(
        `INSERT INTO firm_portal_releases(
           matter_id,law_firm_organization_id,matter_packet_id,signature_request_id,status,
           sla_hours_snapshot,released_at,sla_deadline_at,release_reason,created_by_user_id
         ) VALUES($1,$2,$3,$4,'RELEASED',$5,now(),now()+($5 || ' hours')::interval,'COMPLETE_PACKET_RELEASE',$6)
         RETURNING id::text,released_at::text,sla_deadline_at::text`,
        [id,built.readiness.law_firm_organization_id,built.packetId,built.readiness.signatureRequestId,String(hours),principal.userId]
      )).rows[0];

      await client.query(`UPDATE matter_packets SET status='DELIVERED',released_at=now() WHERE id=$1`, [built.packetId]);
      const current = (await client.query<{ status: string; org: string }>(
        `SELECT status::text,processing_organization_id::text AS org FROM matters WHERE id=$1 FOR UPDATE`,
        [id]
      )).rows[0];
      await client.query(`UPDATE matters SET status='FIRM_REVIEW',updated_at=now() WHERE id=$1`, [id]);
      if (current.status !== "FIRM_REVIEW") {
        await client.query(
          `INSERT INTO status_events(matter_id,from_status,to_status,reason_code,actor_type,actor_id)
           VALUES($1,$2::matter_status,'FIRM_REVIEW','SECURE_PORTAL_PACKET_RELEASED','USER',$3)`,
          [id,current.status,principal.userId]
        );
      }
      await client.query(
        `INSERT INTO billing_disposition_events(matter_id,firm_portal_release_id,disposition,actor_type,actor_id,metadata)
         VALUES($1,$2,'PENDING','SYSTEM',NULL,$3::jsonb)`,
        [id,release.id,JSON.stringify({ slaHoursSnapshot: hours, slaDeadlineAt: release.sla_deadline_at })]
      );
      await client.query(
        `INSERT INTO deliveries(matter_id,law_firm_organization_id,method,destination,packet_version,status,delivered_at)
         VALUES($1,$2,'PORTAL','CASEFLOW_SECURE_FIRM_PORTAL',$3,'DELIVERED',now())`,
        [id,built.readiness.law_firm_organization_id,built.version]
      );
      await client.query(
        `INSERT INTO audit_events(organization_id,matter_id,actor_type,actor_id,event_type,entity_type,entity_id,metadata)
         VALUES($1,$2,'USER',$3,'FIRM_SECURE_PACKET_RELEASED','FIRM_PORTAL_RELEASE',$4,$5::jsonb)`,
        [current.org,id,principal.userId,release.id,JSON.stringify({ packetVersion: built.version, retainerSignatureRequestId: built.readiness.signatureRequestId, slaHoursSnapshot: hours, allAtOnce: true })]
      );

      return { releaseId: release.id, packetId: built.packetId, packetVersion: built.version, slaHoursSnapshot: hours, releasedAt: release.released_at, slaDeadlineAt: release.sla_deadline_at };
    });
    if (!result) return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to release packet" }, { status: 409 });
  }
}
