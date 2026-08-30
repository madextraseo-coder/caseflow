import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import type { SessionPrincipal } from "@/lib/auth";
import { hashSecret } from "@/lib/crypto";
import { canAdministerDescendant } from "@/lib/marketer-network";

export const VIEW_AS_COOKIE = "caseflow_view_as";

export type ViewAsMode = "READ_ONLY" | "SUPPORT_ACTION";

export type ViewAsContext = {
  sessionId: string;
  actualUserId: string;
  targetUserId: string;
  targetMembershipId: string;
  targetOrganizationId: string;
  targetRoleCode: string;
  targetPermissions: string[];
  targetFullName: string;
  targetEmail: string;
  mode: ViewAsMode;
  expiresAt: string;
};

export async function mayViewAs(
  client: PoolClient,
  principal: SessionPrincipal,
  targetOrganizationId: string,
  mode: ViewAsMode
): Promise<boolean> {
  const basePermission = mode === "SUPPORT_ACTION" ? "support:view_as_action" : "support:view_as";
  if (principal.memberships.some((m) => m.organizationType === "PLATFORM" && (m.permissions.includes("*") || m.permissions.includes(basePermission)))) {
    return true;
  }
  return (await canAdministerDescendant(client, principal, targetOrganizationId, "support:view_as_descendants")) !== null
    && (mode === "READ_ONLY" || principal.memberships.some((m) => m.permissions.includes("*") || m.permissions.includes("support:view_as_action")));
}

export async function createViewAsSession(
  client: PoolClient,
  principal: SessionPrincipal,
  input: { targetMembershipId: string; mode: ViewAsMode; reason: string; minutes: number; ipAddress?: string | null; userAgent?: string | null }
): Promise<{ rawToken: string; sessionId: string; expiresAt: string; targetUserId: string; targetOrganizationId: string }> {
  const target = await client.query<{ user_id: string; organization_id: string }>(
    `SELECT user_id::text, organization_id::text
       FROM organization_memberships
      WHERE id = $1
      LIMIT 1`,
    [input.targetMembershipId]
  );
  const row = target.rows[0];
  if (!row) throw new Error("TARGET_MEMBERSHIP_NOT_FOUND");
  if (row.user_id === principal.userId) throw new Error("CANNOT_IMPERSONATE_SELF");
  if (!(await mayViewAs(client, principal, row.organization_id, input.mode))) throw new Error("VIEW_AS_FORBIDDEN");

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const result = await client.query<{ id: string; expires_at: string }>(
    `INSERT INTO support_impersonation_sessions(
       token_hash, actual_user_id, target_user_id, target_membership_id, target_organization_id,
       mode, reason, expires_at, created_ip, user_agent
     ) VALUES($1,$2,$3,$4,$5,$6,$7,now()+($8||' minutes')::interval,$9::inet,$10)
     RETURNING id::text, expires_at::text`,
    [hashSecret(rawToken), principal.userId, row.user_id, input.targetMembershipId, row.organization_id,
     input.mode, input.reason, String(input.minutes), input.ipAddress ?? null, input.userAgent ?? null]
  );
  return { rawToken, sessionId: result.rows[0].id, expiresAt: result.rows[0].expires_at, targetUserId: row.user_id, targetOrganizationId: row.organization_id };
}

export async function resolveViewAsContext(
  client: PoolClient,
  request: NextRequest,
  actualPrincipal: SessionPrincipal
): Promise<ViewAsContext | null> {
  const token = request.cookies.get(VIEW_AS_COOKIE)?.value;
  if (!token) return null;
  const result = await client.query<{
    session_id: string; actual_user_id: string; target_user_id: string; target_membership_id: string;
    target_organization_id: string; role_code: string; permissions: string[]; full_name: string; email: string;
    mode: ViewAsMode; expires_at: string;
  }>(
    `SELECT s.id::text AS session_id,
            s.actual_user_id::text,
            s.target_user_id::text,
            s.target_membership_id::text,
            s.target_organization_id::text,
            m.role_code,
            m.permissions,
            u.full_name,
            u.email,
            s.mode::text AS mode,
            s.expires_at::text
       FROM support_impersonation_sessions s
       JOIN organization_memberships m ON m.id = s.target_membership_id
       JOIN users u ON u.id = s.target_user_id
      WHERE s.token_hash = $1
        AND s.actual_user_id = $2
        AND s.ended_at IS NULL
        AND s.expires_at > now()
        AND u.active = true
      LIMIT 1`,
    [hashSecret(token), actualPrincipal.userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    actualUserId: row.actual_user_id,
    targetUserId: row.target_user_id,
    targetMembershipId: row.target_membership_id,
    targetOrganizationId: row.target_organization_id,
    targetRoleCode: row.role_code,
    targetPermissions: row.permissions ?? [],
    targetFullName: row.full_name,
    targetEmail: row.email,
    mode: row.mode,
    expiresAt: row.expires_at
  };
}
