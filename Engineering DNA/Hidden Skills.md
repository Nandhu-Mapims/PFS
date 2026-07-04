# Hidden Skills

**Related:** [[Skill Matrix]] · [[Engineering Profile]] · [[AI Engineering]]

---

## Cross-Project Capabilities

Skills inferred from **Iink + MAPIMS** — often spanning roles labeled separately in org charts.

---

## System Design ★★★★

**Iink:** Hybrid Mongo + FS, SSE job protocol, workflow snapshots, Docker GPU compose.

**MAPIMS:** Lite/detail API split, incremental sync contract, offline outbox, split-aggregate ticket model, EMR read bridge.

**Hidden skill:** Designing **read-optimized APIs** for fat documents (transcripts, layout JSON) without jumping to microservices.

---

## AI / ML Engineering ★★★★★

**Iink:** VL OCR multi-backend, prompt catalog, VRAM routing, salvage paths.

**MAPIMS:** OpenRouter structured extraction, multi-issue split, Tamil-aware prompts, Sarvam STT integration, deferred inference worker, topic post-filter heuristics.

**Hidden skill:** **LLM as workflow engine** (triage, route, ticket) not chat UI — different from RAG tutorial projects.

---

## NLP / Speech ★★★★

**MAPIMS-specific:**
- Tamil bot conversation design
- STT → comments → LLM pipeline
- Voice rating inference
- AI summary as display surrogate for megabyte transcripts

**Iink:** Document structure IR, LaTeX/MathML export.

---

## Backend Engineering ★★★★

**Dual stack fluency:** Python FastAPI + Node Express — same patterns (monolith, inline validation, deferred work).

**MAPIMS extras:** Mongoose indexing for sync, multer upload pipeline, hospital EMR SOAP integration.

---

## Frontend Architecture ★★★★

Often underplayed when labeled "backend/AI engineer":

- React Router 7 nested layouts + guards
- Module singleton caches (not only React Query)
- Outlet context data sharing (`InsightsHub`)
- Offline-first IndexedDB + service worker
- Incremental merge algorithms client-side
- Performance: visibility-gated polling, rAF chart mount

---

## Database / Data Modeling ★★★★

**MAPIMS advancement over Iink:**
- Explicit indexes for delta sync
- Split-child document pattern for multi-assignee tickets
- Partial unique index for idempotency
- Read-time donor enrichment vs duplicate blob storage

---

## Performance Engineering ★★★★★

**Rare combination:**
- GPU inference optimization (Iink)
- **Network payload optimization** (MAPIMS) — lite, delta, role filter, in-memory cache

Most engineers optimize one side; you iterate on **both** based on where pain appears.

---

## DevOps / Deployment ★★★

- Docker multi-service (mongo, backend, nginx frontend)
- Volume strategy for uploads persistence
- Entrypoint seed/repair on boot
- Env.example as integration contract
- `docker compose up -d --build` workflow

**Gap:** No CI/CD in either repo.

---

## Domain Expertise ★★★★

| Domain | Evidence |
|--------|----------|
| Educational publishing | Iink textbook layout, IEEE matcher patterns |
| Hospital operations | OP/IP encounters, UHID, departments vs routing services |
| Ticket triage | Sentiment rules, HOD assignment, status workflow |
| Accessibility | Iink alt-text VL |
| Bilingual ops | Tamil hospital feedback |

---

## Integration Engineering ★★★★

**MAPIMS EMR bridge:**
- Legacy SOAP QueryBuilder
- SQL date literal localization (mdy/dmy)
- Column alias normalization in `csvExcel.js`
- Graceful disable flag `EMR_PATIENT_LOOKUP_DISABLED`

**Hidden skill:** Connecting modern SPA to **enterprise hospital systems** without ETL pipeline.

---

## Product / Workflow Design ★★★★

- Iink submit → review → revert → re-OCR
- MAPIMS feedback → AI split → ticket → HOD assign → resolve
- Admin insights vs operational tickets vs patient kiosk — three UX surfaces one backend

---

## Security Awareness ★★★

- Iink: RBAC + audit designed
- MAPIMS: role model clear; **execution gap recognized** in iteration (HOD filter added server-side)

Awareness present; hardening is known deferred work — not blind spot.

---

## Technical Writing ★★★

- `.env.example` documentation
- Bot/admin UI copy
- Inline comments on EMR date order, Transformers pin
- This Engineering DNA vault
- Karpathy behavioral rules for AI-assisted dev

---

## Automation Engineering ★★★

- Iink processing logs CSV/Excel
- MAPIMS pendingAiWorker, repair scripts, seed scripts
- Service worker background sync

---

## Skills Less Evident

- Kubernetes / multi-region
- Formal ML evaluation harness
- Payment/compliance (HIPAA hardening not evidenced)
- Blockchain / crypto
- Native mobile

See [[Skill Matrix]] for numeric ratings.
