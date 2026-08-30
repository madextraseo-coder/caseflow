# CASEFLOW Marketer Network & View As

## Hierarchy

CASEFLOW supports a multi-tier acquisition network:

`Platform → Marketer → Publisher → Sub-Publisher → ... → Agent → Case`

The existing `organization_paths` closure table provides unlimited ancestry/descendant attribution. v0.6 adds explicit `MARKETER` and `PUBLISHER` organization types while preserving compatibility with existing `DOWNLINE` organizations.

## Separate accounts

Admins and agents are individual `users` with organization-specific memberships. No shared marketer credentials are required. Permissions remain attached to membership/role context.

## Permission governance

Super Admin establishes the maximum network depth and platform permission ceiling. Marketer/Publisher admins may delegate only within their descendant organization tree and may only reduce access relative to their own ceiling.

Representative permissions:

- `marketer:network:read`
- `marketer:publisher:create`
- `marketer:agents:manage`
- `marketer:permissions:manage`
- `lead:submit`
- `lead:own:read`
- `lead:branch:read`
- `report:marketer:read`
- `support:view_as`
- `support:view_as_descendants`
- `support:view_as_action`

## Immutable case attribution

Every submitted case should snapshot:

- source organization
- submitting user
- submitting membership
- complete organization ancestry path
- campaign/source identifiers
- submission timestamp

`matter_attribution_snapshots` is append-only so later organizational changes cannot rewrite historical credit/source attribution.

## View As security model

View As does not use another person's password. An authorized administrator receives a time-limited support impersonation session tied to the administrator's authenticated session.

Modes:

1. `READ_ONLY` — default support/troubleshooting mode.
2. `SUPPORT_ACTION` — explicit elevated mode; requires additional permission and all material actions must identify both the actual admin and target identity in audit metadata.

Rules:

- Platform Super Admin may View As authorized accounts platform-wide.
- Marketer/Publisher admins may only View As descendants within their own organization path when granted `support:view_as_descendants`.
- Support Action additionally requires `support:view_as_action`.
- Sessions expire in no more than 60 minutes.
- Start/stop events are written to immutable `audit_events`.
- The UI must show a persistent, unmistakable View As banner until the session ends.

## Production follow-up

The v0.6 foundation creates the database model, authorization helpers, and support-session API. Before production use, every marketer-facing UI/API must resolve the effective View As context consistently, enforce READ_ONLY mutations server-side, and attach actual/viewed identity metadata to all material audit events.
