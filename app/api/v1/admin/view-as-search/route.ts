import { NextRequest, NextResponse } from "next/server";
import { getPrincipalFromRequest } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { canAdministerDescendant } from "@/lib/marketer-network";

export async function GET(request: NextRequest) {
  const principal = await getPrincipalFromRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rootOrganizationId = request.nextUrl.searchParams.get("organizationId");
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!rootOrganizationId || q.length < 1) return NextResponse.json({ results: [] });
  return transaction(async (client) => {
    const allowed = await canAdministerDescendant(client, principal, rootOrganizationId, "marketer:network:read");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const result = await client.query(
      `SELECT u.id::text AS user_id,u.full_name,u.email,om.role_code,o.id::text AS organization_id,o.display_name AS organization_name,op.depth
         FROM organization_paths op
         JOIN organizations o ON o.id=op.descendant_id
         JOIN organization_memberships om ON om.organization_id=o.id
         JOIN users u ON u.id=om.user_id AND u.active=true
        WHERE op.ancestor_id=$1
          AND (u.full_name ILIKE '%'||$2||'%' OR u.email ILIKE '%'||$2||'%' OR o.display_name ILIKE '%'||$2||'%' OR om.role_code ILIKE '%'||$2||'%')
        ORDER BY op.depth,u.full_name LIMIT 20`,
      [rootOrganizationId,q]
    );
    return NextResponse.json({ results: result.rows });
  });
}
