import crypto from "node:crypto";
import type {NextRequest} from "next/server";
export function isAuthorizedJobRequest(request:NextRequest):boolean{const expected=process.env.JOB_RUNNER_SECRET;const received=request.headers.get('x-caseflow-job-secret');if(!expected||!received)return false;const a=Buffer.from(expected),b=Buffer.from(received);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
