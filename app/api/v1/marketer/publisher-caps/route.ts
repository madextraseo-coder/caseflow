import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipalFromRequest } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { isTrustedBrowserMutation } from "@/lib/csrf";
import { canAdministerDescendant } from "@/lib/marketer-network";

const schema = z.object({
  organizationId: z.string().uuid(),
  campaignCode: z.string().max(120).nullable().optional(),
  accidentState: z.string().length(2).nullable().optional(),
  caseType: z.string().min(2).max(80).default("MVA"),
  dailyCap: z.number().int().positive().nullable().optional(),
  weeklyCap: z.number().int().positive().nullable().optional(),
  monthlyCap: z.number().int().positive().nullable().optional(),
  hardStop: z.boolean().default(true)
});

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const principal = await getPrincipalFromRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cap configuration" }, { status: 422 });
  return transaction(async (client) => {
    const allowed = await canAdministerDescendant(client, principal, parsed.data.organizationId, "marketer:publisher:create");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const d = parsed.data;
    const result = await client.query<{ id: string }>(
      `INSERT INTO publisher_caps(organization_id,campaign_code,accident_state,case_type,daily_cap,weekly_cap,monthly_cap,hard_stop,updated_by_user_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (organization_id,campaign_code,accident_state,case_type)
       DO UPDATE SET daily_cap=EXCLUDED.daily_cap,weekly_cap=EXCLUDED.weekly_cap,monthly_cap=EXCLUDED.monthly_cap,hard_stop=EXCLUDED.hard_stop,active=true,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()
       RETURNING id::text`,
      [d.organizationId,d.campaignCode??null,d.accidentState?.toUpperCase()??null,d.caseType,d.dailyCap??null,d.weeklyCap??null,d.monthlyCap??null,d.hardStop,principal.userId]
    );
    await client.query(
      `INSERT INTO audit_events(organization_id,actor_type,actor_id,event_type,entity_type,entity_id,metadata)
       VALUES($1,'USER',$2,'PUBLISHER_CAP_UPDATED','PUBLISHER_CAP',$3,$4::jsonb)`,
      [d.organizationId,principal.userId,result.rows[0].id,JSON.stringify({dailyCap:d.dailyCap??null,weeklyCap:d.weeklyCap??null,monthlyCap:d.monthlyCap??null,hardStop:d.hardStop})]
    );
    return NextResponse.json({ ok: true, id: result.rows[0].id });
  });
}
