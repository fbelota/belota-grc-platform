# BELOTA GRC Platform — PRD

## Problem Statement (original)
Build BELOTA GRC Platform, an Enterprise Governance Operating System (SaaS, Brazil) that runs
a full LGPD/Governance/Risk/Compliance program end-to-end: from CRM/first contact through
diagnostic, inventories, RoPA, RIPD, risk matrix, action plan, document generation, trainings,
evidence, certification (BELOTA GRC VERIFIED™), continuous monitoring and DPO-as-a-Service.
Principles: Compliance/Privacy/Security/Audit/Evidence/AI/Automation by Design, API-first,
multi-tenant. LGPD is one module of a broader Governance OS.

## Architecture
- Backend: FastAPI + MongoDB (motor). All routes under /api. JWT auth via httpOnly cookies (12h/7d).
- AI: emergentintegrations (Claude Sonnet 4-6) via Emergent LLM Key. Long generations run as
  background jobs (db.ai_jobs) with client polling GET /companies/{id}/jobs/{job_id} to avoid the
  ~100s ingress timeout.
- Frontend: React (CRA/craco), Tailwind, shadcn/ui, recharts, sonner. Brand: navy/gold/green,
  fonts Outfit/IBM Plex Sans/Playfair Display.
- Multi-tenant: staff roles (admin/consultor/dpo) manage all companies; `cliente` scoped to own company_id.

## Personas
- Consultor / Admin (BELOTA staff): runs the program across client portfolio.
- DPO (as a Service): governance oversight, tickets, evidence.
- Cliente (empresa): views own company, submits data-subject tickets.

## Implemented (2026-08-17 — MVP v1)
- Auth: register/login/logout/me, JWT cookies, RBAC (admin seeded: fredbelota@gmail.com).
- CRM/Companies: create/list/update/delete, CRM stages, per-company compliance score.
- Executive Dashboard (global) + per-company Overview (score ring, domain bars, module counts).
- Adaptive LGPD Diagnostic (6 domains/15 questions) with weighted scoring + domain scores.
- Inventories: data/systems/assets/vendors (typed CRUD).
- RoPA (CRUD + AI suggest), RIPD (AI generate + view), Risk Matrix (5x5 heatmap + CRUD + score).
- Action Plan, Trainings, Evidences (generic CRUD via CrudSection).
- Documents: AI generation of policies/DPA/NDA/plans/checklist ANPD (11 doc types) + viewer.
- Data-subject Tickets (protocol + status workflow).
- Certificate & VERIFIED™ seal (requires score >= 70%).
- Audit trail (auto event logging on all mutations).
- AI background-job + polling infra for all 4 AI actions.

## Known constraints
- AI generation depends on Emergent LLM Key balance. Test key budget was exhausted during testing
  (Max budget 0.4 exceeded) — AI features return an error until balance is topped up. Job/polling
  mechanism itself works correctly.

## Backlog (Phase 2 — Governance OS engines)
- P1: Vendor risk assessment engine; Licitation (bidding) readiness module; Continuous monitoring
  dashboards; Document PDF export with letterhead/certificate rendering.
- P1: Emergent-managed Google social login (user requested "ambos"; JWT delivered in MVP).
- P2: Marketplace, Analytics engine, mobile apps, full RBAC/ABAC policy editor, versioning history UI.
- P2: Persist AI diagnostic recommendations; auto-generate Action Plan from diagnostic gaps.

## Next tasks
- Top up Universal Key balance to enable AI generation.
- Add Google login. Add PDF export for documents/certificates.
