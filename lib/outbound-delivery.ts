import type {PoolClient} from "pg";
import {decryptPII,encryptPII} from "@/lib/crypto";
import {selectCommunicationProvider} from "@/lib/provider-registry";
import {sendEmailWithProvider,sendPushWithProvider,sendSmsWithProvider} from "@/lib/provider-adapters";

export async function enqueueOutboundDelivery(client:PoolClient,input:{organizationId:string;matterId?:string|null;userId?:string|null;channel:"SMS"|"EMAIL"|"PUSH";purpose:string;recipient:string;subject?:string|null;body:string;idempotencyKey:string;scheduledAt?:Date;payload?:Record<string,unknown>}):Promise<string>{
  const r=await client.query<{id:string}>(`INSERT INTO outbound_delivery_jobs(organization_id,matter_id,user_id,channel,purpose,recipient_ciphertext,subject_redacted,body_redacted,payload,idempotency_key,scheduled_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,COALESCE($11,now())) ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id::text`,[input.organizationId,input.matterId??null,input.userId??null,input.channel,input.purpose,encryptPII(input.recipient),input.subject??null,input.body,JSON.stringify(input.payload??{}),input.idempotencyKey,input.scheduledAt??null]);return r.rows[0].id;
}

export async function processOutboundDeliveryBatch(client:PoolClient,limit=25):Promise<{processed:number;errors:number}>{
  const jobs=await client.query<any>(`SELECT * FROM outbound_delivery_jobs WHERE status IN ('QUEUED','FAILED') AND scheduled_at<=now() AND attempt_count<max_attempts ORDER BY scheduled_at,id LIMIT $1 FOR UPDATE SKIP LOCKED`,[limit]);let processed=0,errors=0;
  for(const job of jobs.rows){processed++;await client.query(`UPDATE outbound_delivery_jobs SET status='PROCESSING',locked_at=now(),attempt_count=attempt_count+1 WHERE id=$1`,[job.id]);try{
    const recipient=decryptPII(job.recipient_ciphertext);let result;
    if(job.channel==='PUSH') result=await sendPushWithProvider(process.env.PUSH_PROVIDER||'ONESIGNAL',{subscriptionId:recipient,title:job.subject_redacted||'CASEFLOW',body:job.body_redacted});
    else {const selected=await selectCommunicationProvider(client,{organizationId:job.organization_id,channel:job.channel,ephi:false});result=job.channel==='SMS'?await sendSmsWithProvider(selected.providerCode,{to:recipient,body:job.body_redacted}):await sendEmailWithProvider(selected.providerCode,{to:recipient,subject:job.subject_redacted||'CASEFLOW Notification',body:job.body_redacted});}
    await client.query(`UPDATE outbound_delivery_jobs SET status='SENT',provider_code=$2,provider_message_id=$3,sent_at=now(),last_error=NULL WHERE id=$1`,[job.id,result.provider,result.messageId]);
  }catch(e){errors++;const message=e instanceof Error?e.message:'Delivery failed';await client.query(`UPDATE outbound_delivery_jobs SET status=CASE WHEN attempt_count>=max_attempts THEN 'DEAD_LETTER' ELSE 'FAILED' END,last_error=$2,scheduled_at=now()+(LEAST(attempt_count,6)*interval '5 minutes') WHERE id=$1`,[job.id,message.slice(0,500)]);}}
  return{processed,errors};
}
