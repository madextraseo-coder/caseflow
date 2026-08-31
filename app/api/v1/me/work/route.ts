import { NextRequest, NextResponse } from "next/server";
import { getPrincipalFromRequest } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  const principal = await getPrincipalFromRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tasks = await query<{ id:string; title:string; task_type:string; priority:number; due_at:string|null; matter_id:string }>(
    `SELECT id::text,title,task_type,priority,due_at::text,matter_id::text FROM tasks
      WHERE assigned_user_id=$1 AND status IN ('OPEN','IN_PROGRESS')
      ORDER BY CASE WHEN due_at IS NOT NULL AND due_at <= now() THEN 0 ELSE 1 END, due_at NULLS LAST, priority DESC LIMIT 50`, [principal.userId]);
  const exceptions = await query<{ id:string; title:string; severity:string; detail:string|null; matter_id:string|null }>(
    `SELECT id::text,title,severity,detail,matter_id::text FROM exception_events
      WHERE assigned_user_id=$1 AND status IN ('OPEN','ACKNOWLEDGED') ORDER BY CASE severity WHEN 'URGENT' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END, opened_at LIMIT 25`, [principal.userId]);
  return NextResponse.json({ tasks: tasks.rows, exceptions: exceptions.rows });
}
