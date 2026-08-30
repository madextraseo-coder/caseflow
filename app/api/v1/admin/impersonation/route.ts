import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipalFromRequest } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { isTrustedBrowserMutation } from "@/lib/csrf";
import { getClientIp } from "@/lib/request";
import { createViewAsSession, VIEW_AS_COOKIE } from "@/lib/impersonation";
import { hashSecret } from "@/lib/crypto";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("START"), targetMembershipId: z.string().uuid(), mode: z.enum(["READ_ONLY", "SUPPORT_ACTION"]).default("READ_ONLY"), reason: z.string().min(10).max(1000), minutes: z.number().int().min(5).max(60).default(30) }),
  z.object({ action: z.literal("STOP") })
]);

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const principal = await getPrincipalFromRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid View As request" }, { status: 422 });

  if (parsed.data.action === "STOP") {
    const token = request.cookies.get(VIEW_AS_COOKIE)?.value;
    if (token) {
      await transaction(async (client) => {
        const ended = await client.query<{ id: string; target_organization_id: string }>(
          `UPDATE support_impersonation_sessions
              SET ended_at = now()
            WHERE token_hash = $1 AND actual_user_id = $2 AND ended_at IS NULL
            RETURNING id::text, target_organization_id::text`,
          [hashSecret(token), principal.userId]
        );
        if (ended.rows[0]) {
          await client.query(
            `INSERT INTO audit_events(organization_id,actor_type,actor_id,event_type,entity_type,entity_id,ip_address,metadata)
             VALUES($1,'USER',$2,'VIEW_AS_ENDED','SUPPORT_IMPERSONATION_SESSION',$3,$4::inet,$5::jsonb)`,
            [ended.rows[0].target_organization_id, principal.userId, ended.rows[0].id, getClientIp(request), JSON.stringify({ actualUserId: principal.userId })]
          );
        }
      });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(VIEW_AS_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  }

  try {
    const created = await transaction(async (client) => {
      const session = await createViewAsSession(client, principal, {
        targetMembershipId: parsed.data.targetMembershipId,
        mode: parsed.data.mode,
        reason: parsed.data.reason,
        minutes: parsed.data.minutes,
        ipAddress: getClientIp(request),
        userAgent: request.headers.get("user-agent")
      });
      await client.query(
        `INSERT INTO audit_events(organization_id,actor_type,actor_id,event_type,entity_type,entity_id,ip_address,user_agent,metadata)
         VALUES($1,'USER',$2,'VIEW_AS_STARTED','SUPPORT_IMPERSONATION_SESSION',$3,$4::inet,$5,$6::jsonb)`,
        [session.targetOrganizationId, principal.userId, session.sessionId, getClientIp(request), request.headers.get("user-agent"), JSON.stringify({ actualUserId: principal.userId, targetUserId: session.targetUserId, mode: parsed.data.mode, reason: parsed.data.reason, expiresAt: session.expiresAt })]
      );
      return session;
    });
    const response = NextResponse.json({ ok: true, sessionId: created.sessionId, expiresAt: created.expiresAt }, { status: 201 });
    response.cookies.set(VIEW_AS_COOKIE, created.rawToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: parsed.data.minutes * 60 });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "VIEW_AS_FAILED";
    const status = message === "VIEW_AS_FORBIDDEN" ? 403 : message === "TARGET_MEMBERSHIP_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
