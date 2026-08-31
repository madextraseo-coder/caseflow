import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipalFromRequest } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { getMatterAccessMembership } from "@/lib/matter-access";
import { isTrustedBrowserMutation } from "@/lib/csrf";

const schema=z.object({field:z.enum(['claimant_first_name','claimant_last_name','accident_state','accident_date','accident_city','accident_county']),value:z.string().max(200)});
function redacted(field:string,value:string){if(field.startsWith('claimant_'))return value.length?value.slice(0,1)+'***':'—';return value.slice(0,80);}
export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){
 if(!isTrustedBrowserMutation(request))return NextResponse.json({error:'Untrusted origin'},{status:403});
 const p=await getPrincipalFromRequest(request);if(!p)return NextResponse.json({error:'Unauthorized'},{status:401});
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid edit'},{status:422});const{id}=await context.params;
 return transaction(async c=>{const membership=await getMatterAccessMembership(c,p,id,'matter:write');if(!membership)return NextResponse.json({error:'Forbidden'},{status:403});
 const m=(await c.query<{claimant_id:string;processing_organization_id:string;accident_state:string|null;accident_date:string|null;accident_city:string|null;accident_county:string|null;first_name:string;last_name:string}>(`SELECT m.claimant_id::text,m.processing_organization_id::text,c.first_name,c.last_name,a.accident_state,a.accident_date::text,a.accident_city,a.accident_county FROM matters m JOIN claimants c ON c.id=m.claimant_id LEFT JOIN accidents a ON a.matter_id=m.id WHERE m.id=$1 FOR UPDATE`,[id])).rows[0];if(!m)return NextResponse.json({error:'Not found'},{status:404});
 const f=parsed.data.field,v=parsed.data.value.trim();let old='';
 if(f==='claimant_first_name'){old=m.first_name;await c.query(`UPDATE claimants SET first_name=$2 WHERE id=$1`,[m.claimant_id,v]);}
 else if(f==='claimant_last_name'){old=m.last_name;await c.query(`UPDATE claimants SET last_name=$2 WHERE id=$1`,[m.claimant_id,v]);}
 else {const col={accident_state:'accident_state',accident_date:'accident_date',accident_city:'accident_city',accident_county:'accident_county'}[f]!;old=String((m as Record<string,unknown>)[col]??'');if(f==='accident_state'&&!/^[A-Za-z]{2}$/.test(v))return NextResponse.json({error:'State must be a two-letter code'},{status:422});if(f==='accident_date'&&!/^\d{4}-\d{2}-\d{2}$/.test(v))return NextResponse.json({error:'Date must be YYYY-MM-DD'},{status:422});await c.query(`UPDATE accidents SET ${col}=$2 WHERE matter_id=$1`,[id,f==='accident_state'?v.toUpperCase():v]);}
 await c.query(`INSERT INTO inline_matter_edit_events(organization_id,matter_id,user_id,field_code,old_value_redacted,new_value_redacted) VALUES($1,$2,$3,$4,$5,$6)`,[m.processing_organization_id,id,p.userId,f,redacted(f,old),redacted(f,v)]);
 await c.query(`INSERT INTO audit_events(organization_id,matter_id,actor_type,actor_id,event_type,entity_type,entity_id,metadata) VALUES($1,$2,'USER',$3,'MATTER_INLINE_EDIT','MATTER',$2,$4::jsonb)`,[m.processing_organization_id,id,p.userId,JSON.stringify({field:f,old:redacted(f,old),next:redacted(f,v)})]);return NextResponse.json({ok:true,field:f});});
}
