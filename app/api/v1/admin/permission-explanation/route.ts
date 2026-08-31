import { NextRequest, NextResponse } from "next/server";
import { getPrincipalFromRequest } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { canAdministerDescendant, resolveRolePermissions } from "@/lib/marketer-network";

export async function GET(request: NextRequest) {
  const principal = await getPrincipalFromRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  const targetUserId = request.nextUrl.searchParams.get("targetUserId");
  if (!organizationId || !targetUserId) return NextResponse.json({ error: "organizationId and targetUserId are required" }, { status: 422 });
  return transaction(async (client) => {
    const allowed = await canAdministerDescendant(client, principal, organizationId, "marketer:network:read");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const row = (await client.query<{role_code:string;permissions:string[];organization_id:string;organization_name:string}>(
      `SELECT om.role_code,om.permissions,o.id::text AS organization_id,o.display_name AS organization_name
         FROM organization_memberships om JOIN organizations o ON o.id=om.organization_id
         JOIN organization_paths op ON op.descendant_id=o.id
        WHERE om.user_id=$1 AND op.ancestor_id=$2
        ORDER BY op.depth LIMIT 1`,[targetUserId,organizationId])).rows[0];
    if (!row) return NextResponse.json({ error: "Target not found" }, { status: 404 });
    const effective = await resolveRolePermissions(client,row.organization_id,row.role_code,row.permissions??[]);
    return NextResponse.json({
      organization: row.organization_name,
      roleCode: row.role_code,
      effectivePermissions: effective,
      explanation: "Effective permissions are the intersection of the user's membership ceiling and the organization role profile. Parent admins may reduce access; they cannot exceed the Super Admin/platform ceiling."
    });
  });
}
