import type { SessionPrincipal } from "@/lib/auth";

export type NextAction = { code: string; title: string; detail: string; href: string; priority: number };

export function deriveNextAction(input: {
  status: string;
  documentsComplete?: boolean;
  firmAssigned?: boolean;
  delivered?: boolean;
  firmDisposition?: string | null;
  billingDisposition?: string | null;
  retainerSigned?: boolean;
}): NextAction {
  if (["NEW", "VALIDATION_REVIEW", "CALLBACK_PENDING", "CONTACT_ATTEMPTED"].includes(input.status))
    return { code: "CONTACT_CLAIMANT", title: "Contact claimant", detail: "Complete the first contact and qualification workflow.", href: "/operations", priority: 100 };
  if (!input.documentsComplete)
    return { code: "COMPLETE_DOCUMENTS", title: "Complete documents", detail: "Collect and approve the remaining required document categories.", href: "/operations", priority: 90 };
  if (!input.firmAssigned)
    return { code: "ROUTE_MATTER", title: "Route matter", detail: "Select an eligible law firm with capacity.", href: "/operations", priority: 80 };
  if (!input.delivered)
    return { code: "DELIVER_FIRM", title: "Deliver to firm", detail: "Send the secure firm notice and snapshot the applicable review SLA.", href: "/firm", priority: 70 };
  if (!input.firmDisposition && input.billingDisposition === "PENDING")
    return { code: "FIRM_REVIEW", title: "Monitor firm review", detail: "Watch the active approval SLA and any correction request.", href: "/firm", priority: 60 };
  if (input.billingDisposition === "BILLABLE" && !input.retainerSigned)
    return { code: "COMPLETE_RETAINER", title: "Complete retainer", detail: "Send or complete the approved e-signature workflow.", href: "/operations", priority: 50 };
  return { code: "REVIEW_AUDIT", title: "Review completed matter", detail: "No blocking operational action remains.", href: "/operations", priority: 10 };
}

export function assistantScope(principal: SessionPrincipal) {
  return {
    userId: principal.userId,
    organizations: principal.memberships.map((m) => ({ id: m.organizationId, type: m.organizationType, role: m.roleCode })),
    permissions: [...new Set(principal.memberships.flatMap((m) => m.permissions))]
  };
}
