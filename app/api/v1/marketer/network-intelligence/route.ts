import { NextRequest, NextResponse } from "next/server";
import { getPrincipalFromRequest } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { canAdministerDescendant } from "@/lib/marketer-network";

export async function GET(request: NextRequest) {
  const principal = await getPrincipalFromRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 422 });
  return transaction(async (client) => {
    const allowed = await canAdministerDescendant(client, principal, organizationId, "marketer:network:read");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const publishers = await client.query(
      `SELECT o.id::text, o.display_name,
              q.score, q.contactability_score, q.consent_score, q.qualification_score,
              q.duplicate_control_score, q.firm_acceptance_score, q.lead_count,
              pc.daily_cap, pc.weekly_cap, pc.monthly_cap, pc.hard_stop
         FROM organization_paths op
         JOIN organizations o ON o.id = op.descendant_id
         LEFT JOIN LATERAL (
           SELECT * FROM publisher_quality_snapshots pqs
            WHERE pqs.organization_id = o.id
            ORDER BY period_end DESC, calculated_at DESC LIMIT 1
         ) q ON true
         LEFT JOIN LATERAL (
           SELECT * FROM publisher_caps c
            WHERE c.organization_id = o.id AND c.active = true
            ORDER BY updated_at DESC LIMIT 1
         ) pc ON true
        WHERE op.ancestor_id = $1 AND o.type::text IN ('PUBLISHER','DOWNLINE') AND o.active = true
        ORDER BY op.depth, o.display_name`,
      [organizationId]
    );
    const agents = await client.query(
      `SELECT u.id::text, u.full_name, o.display_name AS organization_name,
              a.lead_count, a.contacted_count, a.qualified_count,
              a.median_first_response_seconds, a.contact_rate, a.qualification_rate
         FROM organization_paths op
         JOIN organization_memberships om ON om.organization_id = op.descendant_id
         JOIN users u ON u.id = om.user_id AND u.active = true
         JOIN organizations o ON o.id = om.organization_id
         LEFT JOIN LATERAL (
           SELECT * FROM agent_performance_snapshots aps
            WHERE aps.user_id = u.id AND aps.organization_id = o.id
            ORDER BY period_end DESC, calculated_at DESC LIMIT 1
         ) a ON true
        WHERE op.ancestor_id = $1 AND lower(om.role_code) LIKE '%agent%'
        ORDER BY o.display_name, u.full_name`,
      [organizationId]
    );
    return NextResponse.json({ publishers: publishers.rows, agents: agents.rows });
  });
}
