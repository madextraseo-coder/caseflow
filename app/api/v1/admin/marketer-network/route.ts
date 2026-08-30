import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipalFromRequest } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { isTrustedBrowserMutation } from "@/lib/csrf";
import { getClientIp } from "@/lib/request";
import { canAdministerDescendant, effectiveNetworkDepthLimit, listNetworkTree } from "@/lib/marketer-network";

const createSchema = z.object({
  parentOrganizationId: z.string().uuid(),
  legalName: z.string().min(2).max(200),
  displayName: z.string().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
  allowSubpublishers: z.boolean().default(false)
});

export async function GET(request: NextRequest) {
  const principal = await getPrincipalFromRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const root = request.nextUrl.searchParams.get("rootOrganizationId");
  if (!root) return NextResponse.json({ error: "rootOrganizationId required" }, { status: 422 });
  return transaction(async (client) => {
    const allowed = await canAdministerDescendant(client, principal, root, "marketer:network:read");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ organizations: await listNetworkTree(client, root) });
  });
}

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const principal = await getPrincipalFromRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid publisher request" }, { status: 422 });
  return transaction(async (client) => {
    const membership = await canAdministerDescendant(client, principal, parsed.data.parentOrganizationId, "marketer:publisher:create");
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const limit = await effectiveNetworkDepthLimit(client, membership.organizationId);
    const depthResult = await client.query<{ depth: number }>(
      `SELECT depth FROM organization_paths WHERE ancestor_id = $1 AND descendant_id = $2 LIMIT 1`,
      [membership.organizationId, parsed.data.parentOrganizationId]
    );
    const nextDepth = (depthResult.rows[0]?.depth ?? 0) + 1;
    if (nextDepth > limit) return NextResponse.json({ error: "Network depth limit exceeded" }, { status: 409 });
    const parentPolicy = await client.query<{ allow_managed_publishers: boolean; allow_subpublishers: boolean }>(
      `SELECT allow_managed_publishers, allow_subpublishers FROM organization_network_policies WHERE organization_id = $1 LIMIT 1`,
      [parsed.data.parentOrganizationId]
    );
    const policy = parentPolicy.rows[0];
    if (policy && !policy.allow_managed_publishers) return NextResponse.json({ error: "Publisher creation disabled for this parent" }, { status: 409 });
    if (nextDepth > 1 && policy && !policy.allow_subpublishers) return NextResponse.json({ error: "Sub-publisher creation disabled for this parent" }, { status: 409 });

    const created = await client.query<{ id: string }>(
      `INSERT INTO organizations(parent_organization_id,type,legal_name,display_name,slug)
       VALUES($1,'PUBLISHER',$2,$3,$4)
       RETURNING id::text`,
      [parsed.data.parentOrganizationId, parsed.data.legalName, parsed.data.displayName, parsed.data.slug]
    );
    await client.query(
      `INSERT INTO organization_network_policies(organization_id,max_descendant_depth,allow_managed_publishers,allow_subpublishers,updated_by_user_id)
       VALUES($1,$2,$3,$4,$5)`,
      [created.rows[0].id, limit, parsed.data.allowSubpublishers, parsed.data.allowSubpublishers, principal.userId]
    );
    await client.query(
      `INSERT INTO audit_events(organization_id,actor_type,actor_id,event_type,entity_type,entity_id,ip_address,metadata)
       VALUES($1,'USER',$2,'PUBLISHER_CREATED','ORGANIZATION',$3,$4::inet,$5::jsonb)`,
      [parsed.data.parentOrganizationId, principal.userId, created.rows[0].id, getClientIp(request), JSON.stringify({ parentOrganizationId: parsed.data.parentOrganizationId, depth: nextDepth, allowSubpublishers: parsed.data.allowSubpublishers })]
    );
    return NextResponse.json({ ok: true, organizationId: created.rows[0].id }, { status: 201 });
  });
}
