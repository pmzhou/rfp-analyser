# RFP Analyser — Product Requirements Doc

## Original problem statement
Build an RFP Analyser web app for the AEC (Engineering, Architecture, Construction) industry.
Workflow: Receive RFP from client → upload RFP + accompanying documents → AI analyses to
produce a table of requirements, dates, scope, program, disciplines → distribute disciplines to
sub-consultants → receive fee responses → merge into a single proposal.
User specified: Sovrium-inspired UI, ChromaDB for semantic retrieval, self-host friendly.

## User personas
- **Bid Manager / Principal (admin)**: creates projects, uploads RFPs, runs analysis, sends invites, merges fees.
- **Member**: editor on shared projects.
- **Sub-consultant (no auth)**: opens shareable link, reviews their discipline scope, submits fee + timeline.

## Architecture
- **Backend**: FastAPI · MongoDB (motor) · ChromaDB (persistent) · Claude Sonnet 4.5 via emergentintegrations
- **Frontend**: React 19 · Tailwind · Shadcn-style primitives · Phosphor Icons · Sonner toasts
- **Auth**: JWT (HS256, 7-day) email + password, bcrypt, Sovrium-inspired admin/member/viewer roles, first user becomes admin
- **Storage**: PDF/DOCX uploaded to `/app/backend/uploads`, text extracted with pypdf / python-docx, chunked & embedded into ChromaDB at `/app/backend/chroma_db`
- **Email distribution**: `mailto:` link prefilled with shareable URL (no SMTP key needed); each invite also has a public share link `/respond/{token}`
- **Self-host friendly**: All paths/keys configurable via `.env`; ChromaDB persistent + local FS storage

## Implemented (Feb 2026)
- Auth flow (signup/login/me) with JWT + bcrypt; first user → admin
- Project CRUD + dashboard (Swiss/High-Contrast aesthetic, Satoshi + IBM Plex)
- Document upload (drag & drop, PDF/DOCX/TXT) with text extraction + ChromaDB indexing
- AI analysis (Claude Sonnet 4.5) → structured JSON: summary, scope, requirements, key_dates, disciplines, evaluation_criteria, risks, program
- Sub-consultant invites with shareable token, copy link, mailto email
- Public response portal (`/respond/:token`) — no auth, only shows their discipline + scope + key dates
- Fee Merger view with totals by currency
- Chat with RFP (semantic search via ChromaDB + Claude)
- Backend tested 21/21 pytest pass; frontend signup/dashboard/modal verified

## Backlog
**P1**
- Email integration (Resend/SendGrid) for sending invites server-side instead of `mailto:`
- Export merged fee proposal as PDF/Excel
- Multi-user collaboration (share project with team members)
- Auto-navigate or fewer manual reload points (mostly addressed)

**P2**
- Two-factor auth (mirroring Sovrium TOTP option)
- OAuth social login (google/github/microsoft)
- Multi-language UI (Sovrium offers `$t:` translation pattern)
- Compare multiple sub-consultant fees side-by-side per discipline
- Custom analysis prompts per project type (Architecture-only, Civil-only)

## Next tasks
1. Add Resend integration for server-side emailing of invites
2. PDF/Excel export of fee summary
3. Project sharing / team collaboration
