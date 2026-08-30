import type { PoolClient } from "pg";
import type { Membership, SessionPrincipal } from "@/lib/auth";
import { membershipHasPermission } from "@/lib/matter-access";

export type NetworkOrganization = {
  id: string;
  parentOrganizationId: string | null;
  type: Membership["organizationType"];
  displayName: string;
  slug: string;
  depth: number;
};

const NETWORK_TYPES = new Set<Membership["organizationType"]>(["MARKETER", "PUBLISHER", "DOWNLINE"]);

export function isNetworkOrganizationType(type: Membership["organizationType"]): boolean {
  return NETWORK_TYPES.has(type);
}

export async function listNetworkTree(client: PoolClient, rootOrganizationId: string): Promise<NetworkOrganization[]> {
  const result = await client.query<{
    id: string;
    parent_organization_id: string | null;
    type: Membership["organizationType"];
    display_name: string;
    slug: string;
    depth: number;
  }>(
    `SELECT o.id::text,
            o.parent_organization_id::text,
            o.type::text AS type,
            o.display_name,
            o.slug,
            op.depth
       FROM organization_paths op
       JOIN organizations o ON o.id = op.descendant_id
      WHERE op.ancestor_id = $1
        AND o.active = true
      ORDER BY op.depth ASC, o.display_name ASC`,
    [rootOrganizationId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    parentOrganizationId: row.parent_organization_id,
    type: row.type,
    displayName: row.display_name,
    slug: row.slug,
    depth: row.depth
  }));
}

export async function canAdministerDescendant(
  client: PoolClient,
  principal: SessionPrincipal,
  targetOrganizationId: string,
  permission: string
): Promise<Membership | null> {
  for (const membership of principal.memberships) {
    if (!membershipHasPermission(membership, permission)) continue;
    if (membership.organizationType === "PLATFORM") return membership;
    if (!isNetworkOrganizationType(membership.organizationType)) continue;
    const result = await client.query(
      `SELECT 1
         FROM organization_paths
        WHERE ancestor_id = $1
          AND descendant_id = $2
        LIMIT 1`,
      [membership.organizationId, targetOrganizationId]
    );
    if ((result.rowCount ?? 0) > 0) return membership;
  }
  return null;
}

export async function effectiveNetworkDepthLimit(client: PoolClient, organizationId: string): Promise<number> {
  const result = await client.query<{ max_descendant_depth: number }>(
    `SELECT p.max_descendant_depth
       FROM organization_paths op
       JOIN organization_network_policies p ON p.organization_id = op.ancestor_id
      WHERE op.descendant_id = $1
      ORDER BY op.depth ASC
      LIMIT 1`,
    [organizationId]
  );
  return result.rows[0]?.max_descendant_depth ?? 5;
}

export async function descendantDepthFrom(client: PoolClient, ancestorId: string, descendantId: string): Promise<number | null> {
  const result = await client.query<{ depth: number }>(
    `SELECT depth FROM organization_paths WHERE ancestor_id = $1 AND descendant_id = $2 LIMIT 1`,
    [ancestorId, descendantId]
  );
  return result.rows[0]?.depth ?? null;
}

export async function resolveRolePermissions(
  client: PoolClient,
  organizationId: string,
  roleCode: string,
  membershipPermissions: string[]
): Promise<string[]> {
  const result = await client.query<{ permissions: string[] }>(
    `SELECT permissions
       FROM marketer_role_permission_profiles
      WHERE owner_organization_id = $1 AND role_code = $2
      LIMIT 1`,
    [organizationId, roleCode]
  );
  const profile = result.rows[0]?.permissions;
  if (!profile) return membershipPermissions;
  if (membershipPermissions.includes("*")) return profile;
  const ceiling = new Set(membershipPermissions);
  return profile.filter((permission) => ceiling.has(permission));
}
