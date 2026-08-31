import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipalFromRequest } from "@/lib/auth";
import { query } from "@/lib/db";
import { decryptPII, encryptPII } from "@/lib/crypto";
import { isTrustedBrowserMutation } from "@/lib/csrf";

const putSchema = z.object({ organizationId:z.string().uuid(), draftKey:z.string().min(1).max(120), payload:z.record(z.string(),z.unknown()) });

export async function GET(request: NextRequest) {
  const p=await getPrincipalFromRequest(request);if(!p)return NextResponse.json({error:"Unauthorized"},{status:401});
  const organizationId=request.nextUrl.searchParams.get("organizationId"),draftKey=request.nextUrl.searchParams.get("draftKey");
  if(!organizationId||!draftKey||!p.memberships.some(m=>m.organizationId===organizationId))return NextResponse.json({error:"Invalid request"},{status:422});
  const r=await query<{payload_ciphertext:string;updated_at:string}>(`SELECT payload_ciphertext,updated_at::text FROM intake_drafts WHERE organization_id=$1 AND user_id=$2 AND draft_key=$3 AND expires_at>now() LIMIT 1`,[organizationId,p.userId,draftKey]);
  if(!r.rows[0])return NextResponse.json({draft:null});
  return NextResponse.json({draft:JSON.parse(decryptPII(r.rows[0].payload_ciphertext)),updatedAt:r.rows[0].updated_at});
}

export async function PUT(request: NextRequest) {
  if(!isTrustedBrowserMutation(request))return NextResponse.json({error:"Untrusted origin"},{status:403});
  const p=await getPrincipalFromRequest(request);if(!p)return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=putSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success||!p.memberships.some(m=>m.organizationId===parsed.data.organizationId))return NextResponse.json({error:"Invalid draft"},{status:422});
  const ciphertext=encryptPII(JSON.stringify(parsed.data.payload));
  await query(`INSERT INTO intake_drafts(organization_id,user_id,draft_key,payload_ciphertext) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,user_id,draft_key) DO UPDATE SET payload_ciphertext=EXCLUDED.payload_ciphertext,expires_at=now()+interval '7 days',updated_at=now()`,[parsed.data.organizationId,p.userId,parsed.data.draftKey,ciphertext]);
  return NextResponse.json({ok:true});
}
