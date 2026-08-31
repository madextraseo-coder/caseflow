import { randomBytes, createHash } from 'node:crypto';
import { NextRequest,NextResponse } from 'next/server';
import { getPrincipalFromRequest } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { isTrustedBrowserMutation } from '@/lib/csrf';
import { encryptString } from '@/lib/crypto';
const MODES=['SMS','EMAIL','BOTH','SMART'] as const;
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!isTrustedBrowserMutation(req))return NextResponse.json({error:'Untrusted origin'},{status:403});
 const p=await getPrincipalFromRequest(req);if(!p)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {id}=await params;const b=await req.json();if(!MODES.includes(b.deliveryMode))return NextResponse.json({error:'Invalid delivery mode'},{status:400});
 const token=randomBytes(32).toString('base64url'), tokenHash=createHash('sha256').update(token).digest('hex');
 const expiresHours=Math.min(Math.max(Number(b.expiresHours||24),1),168);const orgIds=p.memberships.map(m=>m.organizationId);
 return transaction(async c=>{const a=await c.query<{org:string}>(`SELECT processing_organization_id::text org FROM matters WHERE id=$1 AND (processing_organization_id=ANY($2::uuid[]) OR source_organization_id=ANY($2::uuid[])) LIMIT 1`,[id,orgIds]);if(!a.rows[0])return NextResponse.json({error:'Forbidden'},{status:403});
 const docs=await c.query<{id:string}>(`SELECT id::text FROM documents WHERE matter_id=$1 AND id=ANY($2::uuid[]) AND review_status='APPROVED' AND quarantine_status='RELEASED'`,[id,b.documentIds||[]]);if(docs.rowCount!==(b.documentIds||[]).length)return NextResponse.json({error:'Only approved and released matter documents may be shared'},{status:400});
 const r=await c.query<{id:string}>(`INSERT INTO secure_share_packages(organization_id,matter_id,recipient_type,recipient_ciphertext,delivery_mode,token_hash,expires_at,require_otp,allow_download,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,now()+($7||' hours')::interval,$8,$9,$10) RETURNING id::text`,[a.rows[0].org,id,b.recipientType||'CLAIMANT',encryptString(String(b.recipient)),b.deliveryMode,tokenHash,String(expiresHours),b.requireOtp!==false,!!b.allowDownload,p.userId]);for(const d of docs.rows)await c.query(`INSERT INTO secure_share_documents(package_id,document_id) VALUES($1,$2)`,[r.rows[0].id,d.id]);
 await c.query(`INSERT INTO audit_events(organization_id,actor_type,actor_id,event_type,entity_type,entity_id,metadata) VALUES($1,'USER',$2,'SECURE_SHARE_CREATED','MATTER',$3,$4::jsonb)`,[a.rows[0].org,p.userId,id,JSON.stringify({packageId:r.rows[0].id,deliveryMode:b.deliveryMode,documentCount:docs.rowCount,expiresHours,requireOtp:b.requireOtp!==false,allowDownload:!!b.allowDownload})]);
 return NextResponse.json({packageId:r.rows[0].id,portalToken:token,expiresHours,deliveryMode:b.deliveryMode},{status:201});});
}
