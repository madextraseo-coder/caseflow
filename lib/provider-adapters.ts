export type ProviderSendResult={provider:string;messageId:string;status:"SENT"|"QUEUED"};

function required(name:string):string{const v=process.env[name];if(!v)throw new Error(`${name} is required`);return v;}

export async function sendSmsWithProvider(providerCode:string,input:{to:string;body:string}):Promise<ProviderSendResult>{
  if(providerCode==="TELNYX"){
    const r=await fetch("https://api.telnyx.com/v2/messages",{method:"POST",headers:{Authorization:`Bearer ${required("TELNYX_API_KEY")}`,"Content-Type":"application/json"},body:JSON.stringify({from:required("TELNYX_FROM_NUMBER"),to:input.to,text:input.body})});
    const j=await r.json().catch(()=>({})) as any;if(!r.ok)throw new Error(`TELNYX_${r.status}`);return{provider:"TELNYX",messageId:String(j?.data?.id??"unknown"),status:"SENT"};
  }
  if(providerCode==="TWILIO"){
    const sid=required("TWILIO_ACCOUNT_SID"),token=required("TWILIO_AUTH_TOKEN");
    const body=new URLSearchParams({To:input.to,From:required("TWILIO_FROM_NUMBER"),Body:input.body});
    const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body});
    const j=await r.json().catch(()=>({})) as any;if(!r.ok)throw new Error(`TWILIO_${r.status}`);return{provider:"TWILIO",messageId:String(j?.sid??"unknown"),status:"SENT"};
  }
  throw new Error(`Unsupported SMS provider ${providerCode}`);
}

export async function sendEmailWithProvider(providerCode:string,input:{to:string;subject:string;body:string}):Promise<ProviderSendResult>{
  if(providerCode==="POSTMARK"){
    const r=await fetch("https://api.postmarkapp.com/email",{method:"POST",headers:{"X-Postmark-Server-Token":required("POSTMARK_SERVER_TOKEN"),"Content-Type":"application/json"},body:JSON.stringify({From:required("EMAIL_FROM"),To:input.to,Subject:input.subject,TextBody:input.body,MessageStream:process.env.POSTMARK_MESSAGE_STREAM||"outbound"})});
    const j=await r.json().catch(()=>({})) as any;if(!r.ok)throw new Error(`POSTMARK_${r.status}`);return{provider:"POSTMARK",messageId:String(j?.MessageID??"unknown"),status:"SENT"};
  }
  if(providerCode==="SENDGRID"){
    const r=await fetch("https://api.sendgrid.com/v3/mail/send",{method:"POST",headers:{Authorization:`Bearer ${required("SENDGRID_API_KEY")}`,"Content-Type":"application/json"},body:JSON.stringify({personalizations:[{to:[{email:input.to}]}],from:{email:required("EMAIL_FROM")},subject:input.subject,content:[{type:"text/plain",value:input.body}]})});
    if(!r.ok)throw new Error(`SENDGRID_${r.status}`);return{provider:"SENDGRID",messageId:r.headers.get("x-message-id")||"accepted",status:"QUEUED"};
  }
  throw new Error(`Unsupported EMAIL provider ${providerCode}`);
}

export async function sendPushWithProvider(providerCode:string,input:{subscriptionId:string;title:string;body:string}):Promise<ProviderSendResult>{
  if(providerCode!=="ONESIGNAL")throw new Error(`Unsupported PUSH provider ${providerCode}`);
  const r=await fetch("https://api.onesignal.com/notifications",{method:"POST",headers:{Authorization:`Key ${required("ONESIGNAL_REST_API_KEY")}`,"Content-Type":"application/json"},body:JSON.stringify({app_id:required("ONESIGNAL_APP_ID"),include_subscription_ids:[input.subscriptionId],headings:{en:input.title},contents:{en:input.body}})});
  const j=await r.json().catch(()=>({})) as any;if(!r.ok)throw new Error(`ONESIGNAL_${r.status}`);return{provider:"ONESIGNAL",messageId:String(j?.id??"unknown"),status:"QUEUED"};
}
