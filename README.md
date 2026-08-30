# CASEFLOW — MVA Intake, Qualification & Law-Firm Routing Platform

CASEFLOW is a multi-organization motor-vehicle-accident intake platform for affiliate/downline lead submission, central qualification, secure claimant-document collection, law-firm routing, e-signature, approval SLAs, billing disposition, and auditability.

> **Status:** development / test foundation. Do not use this repository for live PHI/ePHI or production claimant data until the production security, vendor, infrastructure, legal/compliance, and operational gates are completed.

## Repository layout

- `app/`, `components/`, `lib/` — Next.js application and workflow modules.
- `database/` — PostgreSQL migrations and development seed data.
- `docs/` — architecture, HIPAA-oriented security baseline, implementation notes, runbooks, and v0.6 roadmap.
- `demos/browser-v3/` — standalone browser walkthrough with mock SMS, claimant uploads, adjustable Super Admin SLA, law-firm review, and auto-billable simulation.

## Implemented application foundation (v0.5)

- Multi-organization hierarchy and tenant-scoped RBAC.
- Intake, dedupe, callback queue, contact attempts, tasks, and qualification.
- Secure claimant document-request portal.
- Image quality checks, document quarantine/review/release, malware interface, access audit.
- Identity verification and document extraction provider interfaces.
- Consent and SMS suppression/STOP architecture.
- Provider-neutral messaging registry; production SMS provider is intentionally not selected yet.
- Law-firm eligibility/capacity profiles and routing.
- BoldSign primary e-sign adapter foundation.
- Firm dispositions, lead-validity/payability separation, packet manifest, security alerts, break-glass, and DR evidence.

## Current browser demo

Open `demos/browser-v3/index.html`, or run its local launcher.

The demo includes Super Admin adjustable approval SLA and per-firm override; marketing-firm fake lead submission; central CRM qualification; two-way mock SMS with inbound replies and STOP suppression; fake secure claimant uploads and QC; law-firm routing; mock firm email delivery; SLA snapshot at successful delivery; accept/reject/correction; auto-billable expiration; mock retainer/signature; and downloadable audit JSON.

The browser demo is intentionally local-only and uses fake data. It does not send real SMS/email, upload files, or connect to BoldSign.

## Local application setup

1. Copy `.env.example` to `.env.local`.
2. Generate separate 32-byte base64 keys for `PII_ENCRYPTION_KEY_BASE64` and `DOCUMENT_ENCRYPTION_KEY_BASE64`.
3. Start PostgreSQL: `docker compose up -d postgres`.
4. Install dependencies: `npm install`.
5. Start development: `npm run dev`.
6. Open `/login`, then `/operations`.

Fresh PostgreSQL volumes run migrations `001`–`006`, then `database/seed.sql`. Seed credentials are development-only.

## Production gates

Before handling real claimant information, complete approved BAA-backed vendors where required, managed encrypted object storage, KMS/secrets management, production MFA/access controls, production SMS/email/IDV/OCR/e-sign adapters, WAF/rate limiting, SIEM/alerting, backup/restore tests, retention/legal-hold controls, security testing, compliance review, incident response, and documented operational procedures.

See `docs/V0.6-ROADMAP.md` for the next build target.
