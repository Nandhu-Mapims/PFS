# PFS — Gap Analysis

**Date:** 2026-08-31
**Scope:** Application loading time, logic correctness, and role/RBAC model
**Status:** Phase 1 complete (see below). Phases 2–4 outstanding.

> ### Phase 1 — completed 2026-08-31
>
> | Item | Result |
> |------|--------|
> | A1 gzip compression | 30-day payload **6.50 MB → 0.55 MB (11.7x)**. `compression` middleware in `index.js`; `gzip` block in `nginx.conf` (syntax validated). |
> | A3 missing indexes | Added `{assignedToUserId:1, createdAt:-1}` and `{status:1, createdAt:-1}`. HOD queue now examines **65 docs instead of 9,011** (1 ms). |
> | B4 orphaned assignments | All **4** repaired — unassigned from deleted users `demo` / `house123`; ticket status and department preserved. Repeatable via `npm run repair-orphan-assignments` (dry-run by default). |
>
> Verified: 11/11 endpoint smoke tests pass, 9,011 rows decode cleanly through gzip,
> analytics totals unchanged.
>
> ### Phase 3 — completed 2026-08-31
>
> | Item | Result |
> |------|--------|
> | A2 query projection | `lite` list + donor queries now exclude `botConversationAnswers` (fetched, then discarded, previously). Output proven byte-identical: same key set on all 9,011 rows. 30-day query 0.50 s → 0.35 s. |
> | A4/B1 analytics | Field projection + accepts the same filters as Insights. Response **identical to baseline**; 0.51 s → 0.26 s. Filtered scoping now possible (`?startMs=&endMs=`). |
> | A5 code splitting | Route-level `lazy` for all 24 screens + framework chunk. First paint **1,478 kB → 478 kB raw (129 kB gzip), 68% smaller**; 60 on-demand chunks. |
> | A5 logo | 1254² → 512², palette-optimised: **438 kB → 27 kB (94%)**. Max perceptual delta at render size 9/255. |
> | A6 persistent cache | IndexedDB L2 behind the in-memory L1, 24 h TTL, 8-entry LRU. Survives reload, so a refresh is now an incremental `sinceMs` sync. Degrades to memory-only if IDB is unavailable. |
> | **Bug found:** boot migration | `{clientSubmissionId: null}` also matches *absent* fields, so `repairClientSubmissionIds` rewrote **6,574 documents on every boot**, bumping `updatedAt`. That made the client's incremental sync re-download the full window after each restart. Fixed with `$type:"null"`; rows rewritten per boot now **0**. |
>
> Verified: 14/14 smoke tests pass, analytics byte-identical to baseline, production
> build clean, all changed modules transform.
>
> ### Phase 2 — completed 2026-08-31
>
> | Item | Result |
> |------|--------|
> | C1 authentication | Login now issues a signed JWT (12 h, `JWT_SECRET` in `backend/.env`). `attachUser` decodes it globally; routes opt in via `requireAuth` / `requireCapability`. |
> | Capability model | `backend/src/auth.js` defines 14 capabilities and the role→capability map. **Guards check capabilities, never role strings**, so Phase 4 adds roles as data. |
> | B7 endpoint guards | **32 routes** guarded (28 in `index.js`, 4 admin bot-conversation). Verified: 14/14 protected endpoints return 401 anonymously — previously all were open. |
> | HOD read scoping | `GET /api/feedback` now forces `assignedToUserId` server-side for queue-scoped roles. HOD sees **65 rows, admin 9,011**. Was a client-side filter only. |
> | B3 CAPA author | Taken from the token, never the body. **Proven:** resolving with a forged `writtenByUsername:"admin"` recorded the real session user. |
> | B5 resolver ownership | Queue-scoped users get 403 on tickets not assigned to them (status change and read). |
> | B8 change-password | Now requires auth, targets **only the session user** (a client-supplied `userId` could hit another account), and works for every role, not just HOD. |
> | C7 CORS | Locked to configured origins + localhost. Verified: `evil.example.com` gets no `Access-Control-Allow-Origin`. |
>
> **Kiosk stays anonymous** — health, branding, bot-conversation, hospital-departments,
> patient lookup, speech-to-text, feedback submission and voice upload are all
> deliberately unauthenticated. Verified end-to-end: anonymous multipart submission
> returned 201 (test row removed; collection back to 9,011).
>
> Frontend: all **44** call sites routed through `apiFetch` (`lib/apiClient.ts`), which
> attaches the bearer token and redirects to `/login` on 401 — but never on 403, which
> is a permission decision, not an expired session.
>
> RBAC matrix verified: **15/15** assertions across admin, staff and HOD tokens.
>
> ### Phase 4 — completed 2026-08-31
>
> | Item | Result |
> |------|--------|
> | C2 roles as data | New `roles` collection + registry (`roles.js`). The role enum is gone from all four places it was duplicated; `User.role` is validated against the registry. |
> | Super Admin | Seeded via `npm run seed-superadmin`. Holds all 15 capabilities; its grant set is **locked** so the RBAC screen cannot lock everyone out. |
> | Management | Read-only executive role. Verified: 200 on analytics/feedback/summary-reports, **403 on users, assign, delete and roles**. |
> | C4 RBAC screen | `/admin/roles` — role × capability matrix, grouped, per-role save/reset, live user counts. Visible only with `roles.manage`. |
> | C3 capability guards | `RequireCapability` gates `/management` on `insights.view`; `AdminGuard` checks per-screen capabilities; login redirect and admin nav are capability-driven, not role-name-driven. |
> | B6 assignment ownership | Assigning to a head who does not own the ticket's department returns **409 + `requiresConfirmation`** naming what they do own. Deliberate cross-routing (Housekeeping, Transport) still allowed after confirmation. |
> | B4 root cause | Deleting a user now **releases their tickets** — Phase 1 only repaired the existing 4 orphans; this stops new ones. |
> | Lockout protection | Verified: admin cannot create/demote/delete a Super Admin (403); last Super Admin cannot be demoted or deleted (409); no self-deletion. |
>
> **Capabilities resolve per request, not from the token** — verified live: revoking
> `insights.view` from `staff` flipped an *already-issued* token from 200 to 403, and
> restoring it flipped back, with no re-login.
>
> Final state: 9,011 feedbacks (unchanged), 31 users, 5 roles, 0 orphaned assignments.

---

## Remaining / not done

- **Server-side pagination** (Phase 3, A2). Insights aggregate client-side over the
  whole window, so paginating the endpoint would break them. Becomes safe once
  analytics aggregation moves server-side.
- **`/api/analytics` as an aggregation pipeline** (A4). Deliberately skipped: the
  slice logic in `feedbackSlices.js` has multi-issue dedup and fuzzy topic matching
  that a pipeline would likely get subtly wrong. Projection + filters delivered the
  same latency win at no correctness risk. Pin the slice logic with tests first.
- **B2 mixed KPI denominators.** Sentiment counts include split children; average
  rating does not. Left alone because fixing it changes numbers management already
  reads — a product decision, not a bug fix.
- **Browser click-through.** All work is verified via API, build and module
  transform. No browser was available in this environment.

Measured against the live application running on the restored production dataset
(`feedbacksystem_remote`: 9,011 feedbacks, 48 departments, 21 services, 29 users,
109 summary reports, 2026-06-02 → 2026-08-28). OpenRouter and Sarvam are disabled.

---

## Executive summary

| # | Gap | Severity | Effort |
|---|-----|----------|--------|
| 1 | **Every API endpoint is unauthenticated** — no token, no middleware | 🔴 Critical | M |
| 2 | No response compression — 21 MB payloads that gzip 12x | 🔴 Critical | XS |
| 3 | `/api/feedback` has no pagination or projection — returns up to 39 MB | 🔴 Critical | M |
| 4 | Only 3 roles exist; superadmin + management are missing | 🔴 Critical | M |
| 5 | `assignedToUserId` has no index — HOD dashboard COLLSCANs 9,011 docs | 🟠 High | XS |
| 6 | `StaffGuard` checks only that a session exists, not the role | 🟠 High | S |
| 7 | CAPA author is taken from the client request body (spoofable) | 🟠 High | S |
| 8 | Deleting a user orphans their tickets — 4 already orphaned in prod | 🟠 High | S |
| 9 | No RBAC administration screen | 🟠 High | M |
| 10 | Frontend ships one 1.48 MB bundle, zero code splitting | 🟡 Medium | S |
| 11 | `/api/analytics` ignores all filters and recomputes over the full collection | 🟡 Medium | M |
| 12 | Sentiment and average-rating KPIs use different denominators | 🟡 Medium | S |
| 13 | No status transition rules; no check that resolver owns the ticket | 🟡 Medium | S |
| 14 | `change-password` works only for `hod` — admin/staff cannot rotate | 🟡 Medium | XS |

The single highest-value fix is **#2 (gzip)** — one middleware line turns a 6.5 MB
dashboard load into 0.54 MB. The most urgent risk is **#1**: the entire API is
open, so the RBAC work in Part C is security theatre until it is closed.

---

## Part A — Loading time

### A1. No response compression anywhere 🔴

Neither Express nor nginx compresses responses. Verified: a request sent with
`Accept-Encoding: gzip` comes back with **no `Content-Encoding` header**.

- `backend/src/index.js:72-73` — only `cors()` and `express.json()` are registered
- `frontend/nginx.conf` — no `gzip` directive in the production config

Measured on the 30-day insights payload:

| | Raw | gzip | Ratio |
|---|-----|------|-------|
| 30-day `lite` payload | 6.50 MB | 0.54 MB | **12.1x** |
| Transfer @ 10 Mbps | 5.5 s | 0.5 s | |
| Transfer @ 50 Mbps | 1.1 s | 0.1 s | |

This is the cheapest win in the entire document: `app.use(compression())` plus a
`gzip_types application/json` block in nginx.

### A2. `/api/feedback` returns the entire collection 🔴

`backend/src/index.js:2423` — `Feedback.find(mongoFilter).sort({_id:-1}).lean()`
with **no `.limit()`, no `.skip()`, and no `.select()`**.

Measured payloads:

| Endpoint | Time (localhost) | Size |
|----------|------------------|------|
| `/api/feedback` | 1.21 s | **38.96 MB** |
| `/api/feedback?lite=1` | 0.97 s | 21.03 MB |
| `?lite=1` + 90-day window | 1.64 s | 21.00 MB |
| `?lite=1` + 30-day window | 0.50 s | 6.50 MB |
| `?lite=1` + 7-day window | 0.10 s | 1.27 MB |

Three compounding problems:

1. **`lite=1` does not reduce database work.** Full documents are fetched and
   enriched first; `toFeedbackListRow` (`index.js:135`) trims fields only at
   serialisation time. The projection should be pushed into the Mongo query.
2. **Enrichment doubles the read.** `enrichFeedbackListWithGroupDonor`
   (`index.js:248`) issues a *second* query for all parent rows in the result set
   — roughly 3,087 extra documents on an unfiltered call.
3. **No server-side pagination**, so the browser must parse a multi-megabyte JSON
   array before first paint.

Note these timings are localhost. On a hospital LAN the transfer dominates, which
is why A1 and A2 together are the loading-time story.

### A3. Missing index on `assignedToUserId` 🟠

The HOD dashboard (`Dashboard.tsx:365`) filters by `assignedToUserId`, and
`buildFeedbackInsightsFilter` (`insightsFeedbackQuery.js`) turns it into a Mongo
filter — but no index backs it. `explain()` confirms a full collection scan:

```
docsExamined: 9011    nReturned: 0
```

Present indexes: `_id`, `ticketId`, `tmsTicketId`, `lookupDepartment`,
`submissionGroupId`, `createdAt:-1`, `{createdAt:-1, patientEncounterType:1}`,
`clientSubmissionId` (unique), `complaintSignature`, `tmsTicketNumber`,
`updatedAt:-1`.

Recommended additions: `{ assignedToUserId: 1, createdAt: -1 }` and
`{ status: 1, createdAt: -1 }`.

### A4. `/api/analytics` loads the whole collection into Node 🟡

`backend/src/index.js:2455` — `Feedback.find().lean()` pulls all 9,011 documents
into process memory and aggregates them in JavaScript on **every request**, with
no caching. This belongs in a Mongo aggregation pipeline. The endpoint signature
is `(_req, res)` — it accepts no parameters at all (see B1).

### A5. Single 1.48 MB bundle, no code splitting 🟡

```
dist/assets/index-B3e95t7T.js     1,513,600 bytes  (1.48 MB)
dist/assets/index-BtQFIQwN.css      132,582 bytes
dist/assets/feedback_logo-*.png     438,649 bytes  (428 KB)
```

`frontend/src/app/routes.tsx` uses **26 static imports and zero `React.lazy`**, so
the patient kiosk screen downloads the full admin console, Recharts, MUI, xlsx and
react-slick before it renders. Route-level lazy loading plus a `manualChunks`
split would cut first paint substantially. The 428 KB PNG logo should also be
compressed — it is served on every screen.

### A6. Insights cache is in-memory only 🟡

`frontend/src/app/lib/feedbackCache.ts` is a module-scoped `Map`. It is **lost on
every page reload**, so each hard refresh re-downloads the full window. It is also
unbounded — every distinct filter combination retains its full row set for the
session's lifetime.

*Positive note:* `useInsightsData.ts` already implements date-windowed queries and
incremental `sinceMs` sync. That design is sound; it just needs a persistent
store (IndexedDB) behind it.

---

## Part B — Logic correctness

### B1. Dashboard and Insights disagree by construction 🟡

`/api/analytics` takes no filters and always aggregates the entire collection,
while the Insights screens fetch a **date-windowed** slice and compute client-side.
Two screens therefore report different numbers for the same metric with no
explanation to the user. `submissionsByDay` is additionally hardcoded to
`.slice(-14)` regardless of the selected period.

### B2. Mixed denominators in the KPI block 🟡

In `/api/analytics` (`index.js:2457-2470`):

- `positive` / `neutral` / `negative` count **all 9,011 rows**, including the
  5,924 split children
- `averageRating` divides by **`sessions` only** (3,087 non-split rows)

So sentiment share and average rating are computed over different populations
and cannot be reconciled. `byStatus` has the same issue — it counts split
children, inflating every status bucket relative to real submissions.

### B3. CAPA author is client-supplied 🟠

`backend/src/index.js:2689` reads `capaInput.writtenByUserId` **from the request
body** and stamps it onto the audit record. With no authentication (C1), any
caller can attribute a CAPA to any user. For a quality audit trail this is the
most damaging correctness defect in the system — the actor must come from the
authenticated session, never the payload.

### B4. Deleting a user orphans their tickets 🟠

`DELETE /api/users/:id` (`index.js:1305`) clears the HOD's department/service
catalog mappings but leaves `assignedToUserId` pointing at the deleted document.

**Confirmed in production data: 4 tickets are assigned to users that no longer
exist.** (183 tickets assigned in total across 16 distinct assignees.)

Deleting a user should either reassign, unassign, or be blocked while tickets are
open — and a repair script should clear the existing 4.

### B5. No status transition rules, no ownership check 🟡

`PATCH /api/feedback/:id/status` (`index.js:2647`) accepts any of the three
statuses in any order. A ticket can jump `New → Resolved`, and **any** caller can
resolve **any** ticket — there is no check that the actor is the assigned HOD.

CAPA fields *are* correctly enforced as mandatory on resolve, which is good — but
the enforcement is undermined by B3 and C1.

### B6. Assignment ignores department ownership 🟡

`PATCH /api/feedback/:id/assign` (`index.js:2724`) validates only that the target
user has `role === "hod"`. It does not check that the HOD actually owns the
ticket's department or service, so a Cardiology ticket can be assigned to the
Housekeeping HOD without warning. The frontend has rich matching logic for this
(`hodRouting.ts:defaultHodForTicket`) but it is advisory only — the server never
validates it.

### B7. Destructive endpoints are unguarded 🟠

`DELETE /api/feedback/:id` (`index.js:2767`) permanently deletes a patient
feedback record with no authentication, no role check, and no soft-delete or audit
trail. Same for `POST /api/seed/open-negative-tickets`, which bulk-mutates ticket
state.

### B8. `change-password` is HOD-only 🟡

`backend/src/index.js:627` returns *"HOD user not found"* for any non-HOD account:

```js
if (!user || user.role !== "hod") { ... }
```

Admin and staff users have no way to rotate their own password. The seeded
credentials in `backend/.env` are therefore permanent for those accounts.

### B9. Workflow has never completed end-to-end ⓘ

Data observation, not a code defect, but it validates the concerns above:

- Tickets with `status: "Resolved"` — **0**
- Tickets with `capa.writtenAt` set — **0**
- Tickets ever assigned — 183 of 9,011

The CAPA/resolution path has never been exercised in production. Treat it as
unproven and test it explicitly.

---

## Part C — Roles and RBAC

### C1. There is no authentication 🔴

This is the foundation gap. `POST /api/auth/login` (`index.js:594`) verifies the
bcrypt hash and then returns **a plain user object — no JWT, no session cookie, no
token of any kind**. The client stores it in `localStorage`
(`frontend/src/app/lib/auth.ts:39`) and every later request is sent anonymously.

Consequences:

- **No endpoint requires authentication.** The only middleware is `cors()` and
  `express.json()` (`index.js:72-73`). Every command in this analysis was run
  unauthenticated against the live API, including `/api/users`.
- **Roles are cosmetic.** A user can grant themselves any role by editing one
  `localStorage` value; the server never re-checks.
- `cors()` is wide open to all origins.

*Credit where due:* passwords are properly bcrypt-hashed, `/api/users` correctly
strips `passwordHash` via `.select("-passwordHash")`, and the login handler
returns a generic "Invalid credentials" for both bad username and bad password.
The primitives are right — the session layer is simply absent.

### C2. Only three roles exist 🔴

Hardcoded in **four** places that must stay in sync:

| Location | Definition |
|----------|-----------|
| `backend/src/models.js:34` | `enum: ["admin", "staff", "hod"]` |
| `backend/src/index.js:1215` | create-user validation |
| `backend/src/index.js:1259` | update-user validation |
| `frontend/src/app/lib/auth.ts:1` | `type UserRole = "admin" \| "staff" \| "hod"` |

Neither **superadmin** nor **management** exists.

### C3. `StaffGuard` does not check roles 🟠

`frontend/src/app/components/RouteGuards.tsx:5`:

```tsx
export function StaffGuard() {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace ... />;
  return <Outlet />;   // ← any authenticated user, any role
}
```

Every route under `StaffGuard` — `/dashboard`, `/management/overview`,
`/management/submissions`, `/management/tickets`, `/management/sentiment`,
`/management/summary-report`, `/workflow` — is reachable by **any** logged-in user.
HODs are bounced out of `/management` only by a redirect inside `InsightsHub.tsx:16`,
which is a UI convenience, not a guard. `AdminGuard` does check `role === "admin"`,
so the pattern exists — it is simply not applied.

### C4. No RBAC administration screen 🟠

`AdminUsersPage.tsx` assigns a role and maps HODs to departments/services. There
is no screen to define **what a role may do** — permissions are scattered as
`role === "admin"` string comparisons across at least 12 components. Adding a role
today means editing every one of those sites.

### C5. Requested vs. current model

| Requirement | Today | Gap |
|-------------|-------|-----|
| **Super admin** | ✗ Absent | New role; needs to own role/permission definitions and be protected from self-deletion and demotion |
| **Management user** (read-only exec view) | ✗ Absent | `/management/*` exists but is open to all authenticated users; no read-only role to bind it to |
| **HOD → CAPA** | ◑ Partial | CAPA capture works and is enforced on resolve, but the author is client-supplied (B3), any user can resolve any ticket (B5), and no HOD has ever completed the flow (B9) |
| **Admin → assign tickets to dept heads** | ◑ Partial | Assignment works and only accepts HODs, but is unauthenticated (C1) and ignores department ownership (B6) |
| **RBAC screen** | ✗ Absent | No permission model to render |
| **Staff** | ✓ Exists | Retain |

### C6. Proposed target model

A capability-based model, so new roles do not require code changes:

```
superadmin   → all capabilities, incl. role/permission management; cannot be deleted
management   → read-only: insights, summary reports, scorecards. No mutations.
admin        → user/department/service CRUD, ticket assignment, settings
hod          → own assigned queue only; resolve + author CAPA
staff        → submit feedback on behalf of patients; own submissions
```

Suggested capability keys: `feedback.read.all`, `feedback.read.assigned`,
`feedback.assign`, `feedback.resolve`, `capa.write`, `insights.view`,
`reports.generate`, `users.manage`, `roles.manage`, `settings.manage`,
`branding.manage`.

Store role→capability grants in a `roles` collection so the RBAC screen edits data
rather than code, and derive every server-side guard from the capability — not from
a role string.

---

## Recommended sequence

**Phase 1 — Stop the bleeding (fast, high impact)**
1. Add `compression` middleware + nginx `gzip` (A1) — 12x payload reduction
2. Add `{assignedToUserId:1, createdAt:-1}` and `{status:1, createdAt:-1}` indexes (A3)
3. Repair the 4 orphaned ticket assignments (B4)

**Phase 2 — Close the security hole (blocks everything in Phase 4)**
4. Issue a signed JWT on login; add `requireAuth` + `requireCapability` middleware (C1)
5. Apply guards to every mutating and data-returning endpoint (B7)
6. Derive the CAPA author and the resolver from the session, not the body (B3, B5)
7. Lock CORS to known origins

**Phase 3 — Loading time**
8. Server-side pagination + real `.select()` projection for `lite` (A2)
9. Rewrite `/api/analytics` as an aggregation pipeline, accept the same filters as
   Insights (A4, B1)
10. Route-level `React.lazy` + `manualChunks`; compress the logo (A5)
11. Move the insights cache to IndexedDB (A6)

**Phase 4 — Roles and RBAC**
12. Introduce the `roles` collection and capability checks; migrate the four
    hardcoded enums to one shared source (C2)
13. Add `superadmin` and `management`; seed a superadmin
14. Replace `StaffGuard` with capability-driven guards (C3)
15. Build the RBAC administration screen (C4)
16. Validate assignment against department ownership (B6)
17. Open `change-password` to all roles (B8)

---

## Appendix — file reference

| Concern | Location |
|---------|----------|
| Middleware stack (no auth, no gzip) | `backend/src/index.js:72-73` |
| Login — returns no token | `backend/src/index.js:594` |
| `change-password` — HOD only | `backend/src/index.js:627` |
| Role enum — create / update | `backend/src/index.js:1215`, `:1259` |
| Delete user — no cascade | `backend/src/index.js:1305` |
| `/api/feedback` — no pagination | `backend/src/index.js:2423` |
| `/api/analytics` — full scan, no filters | `backend/src/index.js:2455` |
| Status + CAPA — client-supplied author | `backend/src/index.js:2647`, `:2689` |
| Assign — no ownership check | `backend/src/index.js:2724` |
| Delete feedback — unguarded | `backend/src/index.js:2767` |
| List enrichment — second full query | `backend/src/index.js:248` |
| Role enum — schema | `backend/src/models.js:34` |
| Feedback indexes | `backend/src/models.js:141-152` |
| `UserRole` type | `frontend/src/app/lib/auth.ts:1` |
| Session in `localStorage` | `frontend/src/app/lib/auth.ts:39` |
| `StaffGuard` — no role check | `frontend/src/app/components/RouteGuards.tsx:5` |
| Eager route imports | `frontend/src/app/routes.tsx` |
| In-memory insights cache | `frontend/src/app/lib/feedbackCache.ts` |
| HOD routing (advisory only) | `frontend/src/app/lib/hodRouting.ts` |
| nginx — no gzip | `frontend/nginx.conf` |
