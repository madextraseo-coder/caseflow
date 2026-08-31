# CASEFLOW Browser Demo v8 — Premium Enterprise UI

This version is the premium CASEFLOW presentation baseline.

It retains the complete demo workflow from v7 while applying the v8 enterprise UI/UX system documented in `docs/UI-UX-V8-PREMIUM-DESIGN-PASS.md`.

Included interaction model:
- Super Admin command center and policy controls
- Multi-level marketer/publisher hierarchy
- Admin/agent permissions and View As troubleshooting
- Marketing intake with immutable attribution
- Central CRM qualification with the 21-question Accident & Claim Interview
- Secure claimant document collection and QC
- Firm routing
- Retainer-first claimant e-sign flow
- Complete-packet secure firm portal release
- Firm review SLA and automatic billable behavior
- Billing disposition separated from firm disposition
- Immutable-style audit demonstration

## Rebuild the exact runnable demo package

The exact v8 ZIP is stored losslessly in `package/part-*.b64` because the connected GitHub contents interface accepts UTF-8 text files rather than direct binary ZIP uploads.

From the repository root, run:

```bash
python demos/browser-v8/package/materialize_demo.py
```

The helper will:
1. Reassemble the Base64 package chunks.
2. Verify SHA-256 `e293e6411ef19f8d13d011d91b7c57947ce57784bf5797c338f3025b19d6c2bb`.
3. Create `demos/browser-v8/caseflow-browser-demo-v8-premium-enterprise-ui.zip`.
4. Extract the runnable `caseflow-browser-demo-v8-premium/` folder.

On Windows, double-click `START-DEMO-WINDOWS.bat` after extraction. On macOS, use `START-DEMO-MAC.command` or open `index.html` directly.

Demo data is simulated only; it does not perform real SMS, email, e-signature, claimant-document transfer, PHI processing, or billing.
