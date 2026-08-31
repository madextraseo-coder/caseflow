# CASEFLOW v8 Premium UI/UX Design Pass

## Objective
Move CASEFLOW from a prototype aesthetic toward a premium enterprise SaaS product suitable for executive, marketer, intake, operations, law-firm, compliance, and billing demonstrations.

## Design baseline
- Enterprise application shell with stronger hierarchy, sticky utility bar, global-search affordance, platform-health signal, and operator identity.
- Larger, more legible typography across navigation, headings, forms, qualification questions, audit rows, and data panels.
- Rebalanced navigation width, content spacing, panel rhythm, card density, and responsive layouts.
- Executive command-center hero emphasizing the operating-system model and retainer-first secure workflow.
- Clear visual separation between executive metrics, operational actions, system health, policy controls, marketer hierarchy, firm workflow, and billing.
- Refined buttons, hover/focus states, pills, permission cards, hierarchy nodes, policy cards, email previews, qualification panels, and claimant-phone chrome.
- Corrected the 8-stage journey rail to render in an 8-column desktop grid.
- Corrected marketer View As phone visibility so restricted marketer views do not retain claimant-phone UI.
- Corrected the View As status token to use the shared accent token.
- Preserves retainer-first release gating, SLA snapshots, 21-question qualification interview, marketer hierarchy, View As, billing separation, and audit workflows.

## Product principles
1. One dominant action per operational surface.
2. High information density without tiny type.
3. Executive overview must be visually distinct from workflow execution.
4. Security and access state must always be explicit.
5. Firm-facing screens emphasize gate conditions and release status.
6. Marketing hierarchy emphasizes ownership, attribution, and permission boundaries.
7. Financial disposition stays distinct from firm disposition.
8. Demo mode remains unmistakable so simulated data cannot be confused with production behavior.

## Validation
The local v8 browser artifact passes JavaScript syntax validation, retains 11 primary workspaces and all 21 qualification questions, and contains no duplicate HTML IDs. Headless Chromium visual QA is not claimed because the container renderer times out during DBus/zygote initialization.