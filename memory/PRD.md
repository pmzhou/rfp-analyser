# RFP Analyser — Product Requirements Doc

## Original problem statement
Build an RFP Analyser web app for the AEC (Architecture, Engineering, Construction) industry.
Workflow: Receive RFP from client → upload RFP + accompanying documents → AI analyses to
produce a table of requirements, dates, scope, program, disciplines → distribute disciplines to
sub-consultants (with EOI → NDA → Full Details flow) → receive fee responses → merge into a
single proposal.

## User personas
- **Bid Manager / Principal (admin)**: creates projects, uploads RFPs, runs analysis, sends invites, merges fees.
- **Member**: editor on shared projects.
- **Sub-consultant (no auth)**: opens shareable link → sees EOI → signs NDA → reviews their discipline scope → submits fee + timeline.

## Architecture
- **Backend**: FastAPI · MongoDB (motor) · ChromaDB (persistent) · Claude/DeepSeek/OpenAI/Gemini via emergentintegrations
- **Frontend**: React 19 · Tailwind · Shadcn-style primitives · Phosphor Icons · Sonner toasts
- **Auth**: JWT (HS256, 7-day) email + password, bcrypt; first user → admin
- **Storage**: PDF/DOCX uploaded to `/app/backend/uploads`, text extracted with pypdf / python-docx, chunked + embedded into ChromaDB
- **Email**: SMTP-compatible (Mailjet / SendGrid / SES / custom). Per-user encrypted SMTP credentials in Settings.
- **NDA PDFs**: ReportLab; signed copies stored as text snapshot in invite + downloadable PDF.

## Implemented (Feb 2026)
### Earlier sessions
- Auth + project CRUD + dashboard + analytics
- Document upload + chunking + ChromaDB indexing
- Async LLM analysis with map-reduce; HITL editing of 15+ AEC analysis sections
- 7-step Fee Builder + Global Staff Roster
- Settings (SMTP, LLM Models, Preferences, Requirements, Fee Templates, Address Book)
- PDF + XLSX export
- Light/Dark theme, custom date format + currency

### Current session — EOI → NDA → Full Details flow (P0, COMPLETE, BACKEND TESTED)
- Backend public endpoints:
  - `GET /api/public/invites/{token}/eoi` — project summary + submission date, marks EOI viewed
  - `POST /api/public/invites/{token}/interest` — interested or declined (with optional reason)
  - `GET /api/public/invites/{token}/nda` — renders NDA template with placeholders filled
  - `POST /api/public/invites/{token}/nda/sign` — typed-name e-sig + IP capture, status → nda_signed
  - `GET /api/public/invites/{token}/nda/pdf` — ReportLab signed-NDA download
  - `GET /api/public/invites/{token}/details` — full scope/discipline/dates (gated by NDA or skip_nda)
  - `POST /api/public/invites/{token}/respond` — fee submission (gated by NDA or skip_nda)
- Backend owner endpoints:
  - `PATCH /api/projects/{id}/invites/{iid}` — toggle skip_nda, anonymise_client, notes
  - `GET /api/projects/{id}/invites/{iid}/nda/pdf` — owner downloads signed NDA
  - `GET /api/library/nda/builtin` — built-in mutual NDA template starter text
- NDA Templates as `library` items (`type=nda_template`) with `is_default` → user's settings.default_nda_id
- Built-in 2-year mutual NDA template embedded in backend; used when user has no custom default
- Email notifications to project owner (best-effort): eoi_viewed, interested, declined, nda_signed, responded
- Frontend `RespondPage.jsx` rewritten as 3-step state machine: EOI → NDA → Full Details (with declined terminal state)
- Frontend `Settings.jsx` new "NDA Templates" tab with blank/built-in starter, default toggle, edit/delete
- Frontend `ProjectDetail.jsx` Disciplines tab:
  - Status pills: sent, viewed (EOI), interested, nda_signed, viewing_details, submitted, declined
  - Per-invite "NDA: required/skipped" toggle
  - Per-invite "Client: visible/hidden" anonymise toggle
  - "NDA PDF" download button when invite has signed NDA
  - "Replacement needed" banner when a discipline has only declined invites — one-click "Invite replacement" pre-fills the form

## Backlog
**P1**
- Custom Fee Template Formulas (user will provide template) — replace/enhance current Fee Builder
- Multi-tenancy: Workspaces (admin/member/viewer per workspace, per-workspace SMTP/LLM/branding, Stripe billing, DB isolation)
- Resend / SendGrid integration (server-side push instead of relying on per-user SMTP creds)
- Side-by-side fee comparison per discipline

**P2**
- 2FA / TOTP
- OAuth social login (Google / Microsoft)
- Multi-language UI
- Refactor: split `ProjectDetail.jsx` into per-tab components; move backend routes from monolithic `server.py` into `/app/backend/routes/`

## Next tasks
1. Wait on user-provided custom fee formula template (P1)
2. Multi-tenant workspaces architecture (P1)
3. Refactor ProjectDetail.jsx into smaller components (debt)
