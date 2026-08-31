import type { PoolClient } from "pg";
import type { Membership, SessionPrincipal } from "@/lib/auth";

export function membershipHasPermission(membership: Membership, permission: string): boolean {
  return membership.permissions.includes("*") || membership.permissions.includes(permission);
}

export function hasOrganizationPermission(principal: SessionPrincipal, organizationId: string, permission: string): boolean {
  return principal.memberships.some(
    (membership) => membership.organizationId === organizationId && membershipHasPermission(membership, permission)
  );
}

export async function getMatterAccessMembership(
  client: PoolClient,
  principal: SessionPrincipal,
  matterId: string,
  permission: string
): Promise<Membership | null> {
  for (const membership of principal.memberships) {
    if (!membershipHasPermission(membership, permission)) continue;
    if (membership.organizationType === "PLATFORM") return membership;

    if (membership.organizationType === "CENTRAL") {
      const result = await client.query(
        `SELECT 1 FROM matters WHERE id = $1 AND processing_organization_id = $2 LIMIT 1`,
        [matterId, membership.organizationId]
      );
      if ((result.rowCount ?? 0) > 0) return membership;
    }

    if (["DOWNLINE", "MARKETER", "PUBLISHER"].includes(membership.organizationType)) {
      const result = await client.query(
        `SELECT 1
           FROM matters m
           JOIN organization_paths op ON op.descendant_id = m.source_organization_id
          WHERE m.id = $1 AND op.ancestor_id = $2
          LIMIT 1`,
        [matterId, membership.organizationId]
      );
      if ((result.rowCount ?? 0) > 0) return membership;
    }

    if (membership.organizationType === "LAW_FIRM") {
      // Assignment alone does not expose claimant data. Firm access begins only after
      // the signed-retainer-gated packet is explicitly released in the secure portal.
      const result = await client.query(
        `SELECT 1
           FROM matters m
           JOIN firm_portal_releases fpr
             ON fpr.matter_id=m.id
            AND fpr.law_firm_organization_id=m.assigned_law_firm_organization_id
            AND fpr.status='RELEASED'
          WHERE m.id=$1
            AND m.assigned_law_firm_organization_id=$2
          LIMIT 1`,
        [matterId, membership.organizationId]
      );
      if ((result.rowCount ?? 0) > 0) return membership;
    }
  }
  const mayBreakGlass = principal.memberships.some((m) => membershipHasPermission(m, "security:break_glass"));
  if (mayBreakGlass) {
    const emergency = await client.query<{ organization_id:string; organization_type:Membership["organizationType"]; organization_name:string }>(
      `SELECT b.organization_id::text, o.type::text AS organization_type, o.display_name AS organization_name
         FROM break_glass_sessions b JOIN organizations o ON o.id=b.organization_id
        WHERE b.user_id=$1 AND b.matter_id=$2 AND b.revoked_at IS NULL AND b.expires_at>now() AND $3=ANY(b.approved_scope)
        ORDER BY b.started_at DESC LIMIT 1`, [principal.userId, matterId, permission]);
    const row=emergency.rows[0];
    if(row) return {organizationId:row.organization_id,organizationType:row.organization_type,organizationName:row.organization_name,roleCode:"BREAK_GLASS",permissions:[permission]};
  }
  return null;
}

export async function canAccessMatter(
  client: PoolClient,
  principal: SessionPrincipal,
  matterId: string,
  permission: string
): Promise<boolean> {
  return (await getMatterAccessMembership(client, principal, matterId, permission)) !== null;
}
