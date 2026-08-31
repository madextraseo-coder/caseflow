import { NextRequest, NextResponse } from "next/server";
import { getPrincipalFromRequest, hasPermission } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  const principal = await getPrincipalFromRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ items: [] });
  const orgIds = principal.memberships.map((m) => m.organizationId);
  const canReadMatters = hasPermission(principal, "matter:read") || hasPermission(principal, "matter:read:own");
  const items: Array<Record<string, unknown>> = [];
  if (canReadMatters) {
    const matters = await query<{ id:string; matter_number:string; first_name:string; last_name:string; status:string; source_name:string }>(
      `SELECT m.id::text,m.matter_number::text,c.first_name,c.last_name,m.status::text,src.display_name source_name
         FROM matters m JOIN claimants c ON c.id=m.claimant_id JOIN organizations src ON src.id=m.source_organization_id
        WHERE (m.processing_organization_id = ANY($1::uuid[]) OR m.source_organization_id = ANY($1::uuid[]))
          AND (m.matter_number::text ILIKE $2 OR c.first_name ILIKE $2 OR c.last_name ILIKE $2)
        ORDER BY m.created_at DESC LIMIT 12`, [orgIds, `%${q}%`]);
    items.push(...matters.rows.map((r) => ({ type:"MATTER", id:r.id, title:`${r.matter_number} • ${r.first_name} ${r.last_name}`, subtitle:`${r.status} • ${r.source_name}`, href:`/matters/${r.id}` })));
  }
  const orgs = await query<{ id:string; display_name:string; type:string }>(
    `SELECT id::text,display_name,type::text FROM organizations
      WHERE id = ANY($1::uuid[]) AND display_name ILIKE $2 ORDER BY display_name LIMIT 8`, [orgIds, `%${q}%`]);
  items.push(...orgs.rows.map((r) => ({ type:r.type, id:r.id, title:r.display_name, subtitle:r.type, href:"/operations" })));
  return NextResponse.json({ items: items.slice(0, 20) });
}
