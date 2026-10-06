---
title: PFS Code Review & Gap Analysis
tags:
  - project
  - mapims
  - review
  - security
created: 2026-10-05
---

# PFS Code Review & Gap Analysis

**Scope:** the whole repository as of commit `de04425` on `main`, plus uncommitted changes from 2026-10-05: the HOD overview screen, the login password toggle and the HOD role permissions.
**Covers:** backend (`backend/src`), frontend (`frontend/src/app`), Docker/nginx deployment files, and the repo contents.
**Method:** manual reading of the code. Where a finding says *Verified*, it was reproduced against a local run, the local database, or git history. Everything else comes from reading the code and should be confirmed before you fix it.

Related notes: [[MAPIMS Feedback System]], [[MAPIMS Feedback Workflow]]

---

## 1. Summary

| Severity | Count | Theme |
|---|---|---|
| 🔴 Critical | 6 | Patient data (PHI) open to the internet, credentials in git, unauthenticated paid-API endpoints |
| 🟠 High | 11 | Authorization gaps, duplicate tickets, wrong dashboard numbers, frozen reports |
| 🟡 Medium | 14 | Data integrity, sync bugs, timezone errors, misleading UI |
| 🔵 Low / code quality | 9 | Dead code, duplication, missing tests |

**The three things to do first:**

1. **Fix the credentials in `hod-users.csv`.** It is committed to the GitHub repo and contains the real usernames and emails of 24 HODs. Every one of them has the password `mapims`. Change those passwords today, then remove the file from git history.
2. **Require login on `POST /api/patient/lookup` and `/uploads/*`.** Right now anyone on the internet can search the hospital EMR by patient name, and can download patient voice recordings.
3. **Add rate limiting and authentication to the endpoints that call paid services.** These are speech-to-text, AI rating inference and feedback submission.

---

## 2. 🔴 Critical — security & patient privacy

### C1. HOD credentials committed to the git repo — *Verified*
- **Where:** `hod-users.csv` (repo root), added in commit `ba32668`. The remote is `github.com/Nandhu-Mapims/PFS`.
- **What:** the file has 24 HOD accounts with name, username, email and password. All 24 use the same plaintext password `mapims`.
- **Impact:** anyone with read access to the repo can log in as any HOD who has not changed this password. If the repo is public, that means anyone on the internet. Every HOD having the same password makes this worse.
- **Fix:**
  1. Reset all 24 passwords now.
  2. Delete the file and purge it from git history with `git filter-repo` or BFG, then force-push.
  3. Check whether the GitHub repo is public.
  4. Add "force password change on first login" (see gap G9).

### C2. Anyone can search hospital EMR patient records
- **Where:** `backend/src/index.js:1554` (`POST /api/patient/lookup`) and `backend/src/emrPatientLookup.js`.
- **What:** this endpoint has no authentication. It accepts a patient name or UHID and an optional date range chosen by the caller, then returns matching EMR rows: patient name, UHID, department, ward, IP number, and visit or admission date. It is enabled by default and only turns off if `EMR_PATIENT_LOOKUP_DISABLED=true` is set.
- **Impact:** the site is public at `feedback.mapims.edu.in`, so anyone on the internet can enumerate hospital patients. For example, they could search a common name across years by passing a wide `frmDate`/`toDate`. This is a reportable patient-privacy breach.
- **Other problems in the same code path:**
  - Raw EMR error text is passed back to anonymous callers (`index.js:1583-1585`), which can leak internal SQL and server details.
  - The upstream EMR "QueryBuilder" service runs **raw SQL text** sent over **plain HTTP**: `emrPatientLookup.js:4-5`, with the queries built at `:71-80`. Input is escaped with `sqlLiteral` (doubles `'`). That blocks the obvious injection, but this design depends on a single escaping function. The hospital IT team should know this service exists.
- **Fix:**
  - Require a staff session, or a short-lived kiosk token issued after a staff login.
  - Allow lookup only by exact UHID, not partial name.
  - Clamp the date range on the server.
  - Rate-limit the endpoint.
  - Return a generic error message.
  - Call the EMR over HTTPS.

### C3. Patient voice recordings are public
- **Where:** `index.js:152` (`app.use("/uploads", …, express.static(UPLOADS_ROOT))`) and the nginx `/uploads/` proxy.
- **What:** recordings are saved as `/uploads/feedback-voice/<feedbackId>.webm` and served with no authentication and `Access-Control-Allow-Origin: *`. A feedback ID is a MongoDB ObjectId, which is mostly a timestamp plus a counter, so IDs can be guessed.
- **Impact:** anyone can download recordings of patients' voices describing their care.
- **Fix:** serve recordings through an authenticated route, for example `GET /api/feedback/:id/audio` with the same permission checks as `GET /api/feedback/:id`. Alternatively, use signed, expiring URLs.

### C4. Patient recordings are committed to git and copied into the Docker image — *Verified*
- **Where:** `backend/uploads/**` has 75 tracked files, `.webm` and `.mp3`. `backend/Dockerfile` copies `uploads` into the image, and `docker-entrypoint.sh` copies them into the volume.
- **Impact:** real patient audio sits in git history and in every built image.
- **Fix:**
  - Add `backend/uploads/` to `.gitignore`. Keep only the bot intro or question assets, and move those to a separate folder such as `assets/`.
  - Purge the recordings from history.
  - Stop baking `uploads/` into the image.

### C5. Unauthenticated endpoints call paid services, with no rate limit anywhere
- **Where:**
  - `POST /api/speech-to-text` (`index.js:577`): Sarvam STT, with 60 MB uploads.
  - `POST /api/feedback/infer-voice-rating` (`index.js:1589`): OpenRouter LLM.
  - `POST /api/feedback` (`index.js:2095`): triggers up to 4 or more LLM calls per submission, plus retries.
  - `POST /api/feedback/:id/voice-recording` (`index.js:2606`): attaches a 60 MB file to any feedback that doesn't have one yet.
- **What:** there is no `express-rate-limit`, CAPTCHA or per-IP limit anywhere in the backend.
- **Impact:** anyone can run up the Sarvam and OpenRouter bills, fill the disk, or flood the dashboards and ticket queue with fake feedback.
- **Fix:**
  - Rate-limit per IP with `app.set("trust proxy", 1)` behind nginx.
  - Require an `Origin` check plus a kiosk token for the STT and inference endpoints.
  - Cap the upload size on the speech endpoint.
  - Only allow attaching a voice file within N minutes of creation, from the same `clientSubmissionId`.

### C6. Patient name sent to a third-party LLM
- **Where:** `openRouterAnalysis.js:269` (`patientName` in the prompt context) and `openRouterPrompts.js:61`.
- **What:** each analysis sends the patient's name, department and free-text complaint to OpenRouter, which then routes it to a model provider.
- **Impact:** patient data leaves the hospital to a third party. Your own roadmap note says "redact PHI per policy" ([[MAPIMS Feedback Workflow]], Phase 3), but this has not been done.
- **Fix:** don't send `patientName`, because the model doesn't need it to classify feedback. Remove names and phone numbers from comment text before sending. Record in writing whether the hospital's data policy allows this processor at all.

---

## 3. 🟠 High — bugs & authorization problems

### H1. Demoting or deleting a user doesn't take effect for up to 12 hours
- **Where:** `auth.js:86-100` (`attachUser`).
- **What:** the token holds the user's `role`, and capabilities are worked out from that role on each request. Nothing re-reads the user from the database. So:
  - A deleted user keeps full API access until the token expires (12 h by default).
  - An admin demoted to staff keeps admin capabilities until the token expires.
  - Changing a password doesn't log out other sessions.
- **Fix:** look up the user (cached for about 60 s) in `attachUser`, take the role from the database, and reject deleted users. Add a `tokenVersion` field to the user and increment it on password change or demotion.

### H2. Duplicate role records make permission edits unreliable — *Verified locally*
- **Where:** `roles.js:128-148` (`ensureRolesSeeded`), `roles.js:152-155` (`refreshRoleCache`), `index.js:1495` (`Role.updateOne({ key })`).
- **What:** seeding does `findOne`, then `create`, with no upsert. When two processes start together on an empty database, both create every role. The local database has **9 role documents for 5 keys**: two each for `superadmin`, `admin`, `hod` and `staff`. The `unique` index on `key` was never created because the duplicates were inserted before Mongoose built it.
- **Impact:**
  - `PATCH /api/roles/:key` updates only the first matching document.
  - `refreshRoleCache` builds a Map in which the later duplicate silently wins.
  - So a change saved on the RBAC screen can save "successfully" and then have no effect.
- **Fix:**
  - Use `updateOne({ key }, { $setOnInsert: role }, { upsert: true })`.
  - Write a one-off script that merges the duplicates, then run `Role.syncIndexes()`.
  - Check the production database for duplicates too.

### H3. Split tickets can be created twice
- **Where:** `index.js:1839-1907` (child creation in `applyPendingAiToFeedback`), `index.js:1938` (`reanalyzeFeedbackById`), `pendingAiWorker.js:16-36` and `:78-89`.
- **What:** a submission is analysed by up to three paths with no lock between them:
  - The `setImmediate` deferred run.
  - The background worker, which picks up any parent with no `aiSentiment` that is more than 30 s old.
  - `scheduleRetry` after a failure.
- **Example:** the LLM call takes more than 30 s, so the worker starts a second analysis of the same row. Both runs create split-child tickets. Each run also mints a **new** `submissionGroupId`, which cuts the first set of children off from their parent. The same happens when `applyPendingAi` fails after some children were already created, because the retry creates them again.
- **Fix:** claim the row atomically before analysing. For example, `findOneAndUpdate({ _id, aiLockAt: null }, { aiLockAt: now })` with a stale-lock timeout. Also make child creation idempotent by keying each child on `(parentId, issueIndex)`.

### H4. Calls to the LLM provider have no timeout, so the AI worker can stop for good
- **Where:** `openRouterAnalysis.js` (the `fetch(OPENROUTER_URL, …)` calls at about lines 161 and 289 have no `AbortController`), `pendingAiWorker.js:40-42`.
- **What:** if OpenRouter accepts the connection but never responds, `processBatch` never finishes. Its `running` flag stays `true`, so every later poll returns immediately.
- **Impact:** AI analysis stops for all new feedback until the server restarts. Tickets for negative feedback are never opened.
- **Fix:** add a 30–60 s `AbortController` timeout to every outbound `fetch`, as the EMR client already does.

### H5. When the AI can't classify feedback, it is treated as "neutral"
- **Where:** `openRouterAnalysis.js:42-46` (`normalizeSentiment` falls back to `"neutral"`) and `:137` (voice-rating `noop()` returns rating 3, neutral).
- **What:** any unexpected model output becomes "neutral". This includes a malformed response, a refusal, or a new label. If the voice-rating call fails (an HTTP error or empty reply), a bot submission is given rating 3 and neutral.
- **Impact:** a real complaint can end up with no ticket, and nobody can tell that classification failed.
- **Fix:** return `null` or "unclassified" and let the retry path handle it. Show an "AI failed" state in the ticket UI. Never turn a failure into a valid-looking result.

### H6. The status pie chart is mostly "New" — *Verified against your Admin Panel screenshot*
- **Where:** `models.js:130-134` (every feedback defaults to `status: "New"`), `index.js:2760-2764`.
- **What:** every feedback row gets a status, including positive feedback with no ticket. The "Submission Status Distribution" chart counts all rows. Your screenshot shows **16,287 New against 25 Resolved**. Most of those "New" rows are compliments that will never be worked on.
- **Impact:** management sees a backlog of about 16k that doesn't exist, and the chart can't show how tickets are progressing.
- **Fix:** give feedback without a ticket a separate status such as `"No action"`, or leave status null. Count only rows with a `ticketId` in the status chart.

### H7. The "Submission Trend (Last 14 Days)" chart shows the wrong days
- **Where:** `index.js:2781` and `index.js:2790-2793`.
- **What:**
  1. Days are grouped by UTC date (`toISOString().slice(0,10)`). Feedback submitted in India between 00:00 and 05:29 is counted on the previous day.
  2. The code keeps the last 14 days **that have data** (`.slice(-14)`), not the last 14 calendar days. Days with no feedback disappear, and if there was a gap the chart can show weeks-old data under a "last 14 days" heading.
- **Fix:** group by `Asia/Kolkata` (for example `$dateToString` with `timezone`), and build exactly the last 14 calendar days, filling missing days with 0.

### H8. Weekly and monthly summary reports are frozen almost as soon as each period starts
- **Where:** `summaryReportScheduler.js:25-36`.
- **What:** the scheduler generates the **current, still-running** period the first time it runs. After that it skips the period forever because `SummaryReport.exists(...)` is true. Nothing goes back to finish the previous period. The startup log shows a weekly report generated for `2026-10-04` with 0 departments.
- **Impact:** each weekly or monthly report reflects only the first hour or so of its period. That's the first poll that found any data. Unless someone generates it manually, the report never reflects the whole period.
- **Fix:** regenerate the current period on each poll, perhaps every few hours. Generate the **previous** period once more after it closes, and mark it final.

### H9. Report periods use UTC on the server but local time in the browser
- **Where:** `reportPeriods.js` (uses local-time `Date` methods), `docker-compose.yml` (only `mongodb` sets `TZ: Asia/Kolkata`, not `backend`), `node:20-alpine` (defaults to UTC).
- **What:** in production the backend's "local time" is UTC, while the browser's is IST. Week and month boundaries are 5.5 h apart, even though the code comments say these keys match the frontend.
- **Fix:** set `TZ: Asia/Kolkata` on the backend container, or better, do all date grouping explicitly in `Asia/Kolkata`.

### H10. Any logged-in user can list every user
- **Where:** `index.js:1279` (`GET /api/users` requires only `requireAuth`).
- **What:** staff and HODs can fetch every account, with username, role and department mapping.
- **Fix:** require `users.manage`, or `feedback.assign` for the ticket-assignment dropdown, and return a minimal list to everyone else.

### H11. HOD usernames are exposed without login
- **Where:** `index.js:974` (`GET /api/hospital-departments` is anonymous) together with `listHospitalDepartmentsFromDb()` (`index.js:944-964`), which includes `hodUserId.username`.
- **What:** this endpoint is public because the kiosk needs the department list, but it also returns the HOD username for each department. Combined with C1, that gives an attacker a complete list of accounts to target.
- **Fix:** return only `{ _id, name }` on the public endpoint.

---

## 4. 🟡 Medium — logic mistakes & data integrity

| # | Issue | Where | Detail and fix |
|---|---|---|---|
| M1 | **Duplicate-complaint rule almost never triggers** | `feedbackIssueProcessing.js:21-29, 50-` | The signature is `dept\|service\|exact comment text`. Two patients rarely write identical text, so a rating-2 duplicate-complaint ticket effectively never opens. The workflow note calls this the main automated decision. **Fix:** group on the AI's topic or issue category instead of raw text. |
| M2 | **Feedback with a rating but no comment never gets a sentiment** | `pendingAiWorker.js:24-31`, analytics `index.js:2737-2739` | The AI only runs when there is text. A 1-star tap with no comment gets a "critical" ticket but no `aiSentiment`, so it never appears in the "Negative" counts or charts. **Fix:** derive sentiment from the rating when there is no text. |
| M3 | **AI can remove a ticket the rating rule opened** | `index.js:1800-1808` | A 1-star rating opens a `critical_immediate` ticket. If the AI then reads the comment as positive, `setFields.ticketId = null` deletes the ticket. Decide which wins, and log it when the two disagree. |
| M4 | **Neutral feedback is treated inconsistently** | `botConversation.js:144-161` | `canOpenTicketForSentiment` allows neutral, but `ensureIssueTicketIds` only creates new tickets for negative. Neutral feedback gets a ticket only if the rating rule already gave it one. The workflow note says neutral means "no immediate action". Pick one rule. |
| M5 | **Changing a user's role away from HOD leaves their tickets assigned** | `index.js:1385-1389` | Deleting a user releases their tickets (`:1425`), but changing their role doesn't. The tickets stay assigned to someone who no longer has a queue. Apply the same release logic. |
| M6 | **Department rename or delete breaks history and mappings** | `index.js:1153-1256` | Feedback stores the department **name** as a string. Renaming a department splits its analytics into old and new names. Deleting one leaves `User.departmentId` pointing at nothing. Neither action is blocked when feedback still references the department. |
| M7 | **One HOD can own several departments, but the user record holds only one** | `index.js:1220-1225` | Assigning a HOD to a department overwrites `User.departmentId`, which reflects whichever assignment was made last. The previous HOD of that department is not cleared either. |
| M8 | **Ticket status can move in any direction, with no history** | `index.js:2958-3040` | Resolved → New is allowed silently, and nothing records who changed what or when. Status can also be set on rows with no ticket. For quality audits, keep a `statusHistory[]` with user and time, and enforce allowed transitions. |
| M9 | **A maintenance endpoint reopens every resolved negative ticket** | `index.js:1508-1542` | `POST /api/seed/open-negative-tickets` sets `status: "New"` on every Resolved negative row. HODs' resolutions are discarded, though the CAPA stays. Remove it, or restrict it to rows with no ticket. |
| M10 | **Ticket ID lookups can return the wrong row** | `index.js:2684-2687`, `:470` | `GET /api/feedback/:id` also accepts a `ticketId`. But one `ticketId` is deliberately shared across rows (duplicate-complaint grouping and split issues), so `findOne` returns an arbitrary match. IDs are also `Math.random()` base-36 with no collision check. |
| M11 | **Deleting feedback leaves files and child rows behind** | `index.js:3145-3156` | Hard delete with no audit record. The voice file stays on disk (a privacy issue, see C3), split children stay, and an invalid ID returns 500. |
| M12 | **Other admins' screens never remove deleted feedback** | `frontend/.../feedbackListSync.ts:7-17` | Incremental sync fetches only rows with `updatedAt > since`. A hard-deleted row never shows up in that, so it stays in other admins' cached lists until a full reload. **Fix:** soft-delete with `deletedAt`, or return deleted IDs. |
| M13 | **Ticket updates can be missed between dashboard refreshes** | `AdminTicketsPage.tsx:150`, `AdminPage.tsx:100` | The client marks the sync point with `Date.now()` **after** the response arrives, using its own clock. Rows updated while the request was running, or anything inside the device's clock drift, are skipped. **Fix:** have the server return `serverTime` with the query and use that as the next sync point. |
| M14 | **Different patients with the same name are merged on dashboards** | `frontend/.../patientFeedbackGroups.ts:77-80` | Feedback without a submission group is grouped by `name + regNo + UTC day`. Two different name-only patients called "Lakshmi" on the same day become one patient, and the day boundary is in UTC. |

---

## 5. 🟡 UI & UX problems

| # | Issue | Where | Detail |
|---|---|---|---|
| U1 | The HOD screen's "Urgent, unassigned" and "Negative, unassigned" cards always show 0 — *Verified in your HOD screenshot* | `Dashboard.tsx:410-418` | A HOD only receives tickets assigned to them, so "unassigned" can never be true. Hide these cards for HODs, or replace them with "Overdue" and "Not yet acknowledged". |
| U2 | Login shows "Invalid username or password" when the server is down | `frontend/.../auth.ts` (`login` returns `null` for every failure) | Network errors, 500s and 401s all show the same message. Users will think their password is wrong. |
| U3 | Permissions in the browser go stale until the user logs out — *Verified (you ran into this today)* | `apiClient.ts`, `Layout.tsx`, `RouteGuards.tsx` | Capabilities are saved at login and never refreshed. After a role change, the UI shows the wrong menus until the user logs out. Add `GET /api/auth/me` and call it on app load. |
| U4 | The navigation for HODs is decided by role name | `Layout.tsx` (`isHod = session?.role === "hod"`) | This contradicts the "capabilities, not role names" design used elsewhere. Granting HODs a capability doesn't show them the matching menu (the cause of today's issue). |
| U5 | A logged-in session stays on shared kiosk tablets | `apiClient.ts` (localStorage), token TTL 12 h | If staff log in on a patient kiosk ("Staff-assisted" flow), the session survives. The next patient can open `/dashboard`. Add an idle timeout, and keep kiosk mode separate from staff mode. |
| U6 | A temporary cache header was left in place | `frontend/nginx.conf` (`Clear-Site-Data "cache"`) | The comment says to remove it after a few days. Until it's removed, every device downloads the whole app on each visit. |

---

## 6. 🟡 Infrastructure & operations

| # | Issue | Where | Fix |
|---|---|---|---|
| O1 | The backend API is published directly on host port **5014**, over plain HTTP, bypassing nginx and TLS | `docker-compose.yml` (`"5014:5000"`) | Bind it to `127.0.0.1:5014`, or remove the port mapping. |
| O2 | All HTTP server timeouts are disabled | `index.js:3274-3277` (`timeout = requestTimeout = headersTimeout = keepAliveTimeout = 0`) | This leaves the server open to slow-request attacks, where slow clients hold sockets open forever. Set sensible values, such as `headersTimeout` 60 s and `requestTimeout` 10 min, for uploads. |
| O3 | No security headers | The Express app and both nginx configs | Add `helmet` or nginx headers: HSTS, `X-Content-Type-Options`, frame-ancestors, and a basic CSP. |
| O4 | MongoDB has no authentication and no backups | `docker-compose.yml` | Internal-only is fine, but set a root user and password and schedule `mongodump` backups for the database and the `pfs_uploads_data` volume. |
| O5 | Saving a branding logo larger than about 100 KB fails | `index.js:100` (`express.json()` uses its 100 KB default), `PUT /api/branding` | Raise the limit for that route, or upload the logo as a file. Also validate the colour strings and the logo type and size. |
| O6 | The login screen has no brute-force protection | `POST /api/auth/login` | Combined with C1 (one shared password), this is urgent. Rate-limit by IP and username, and add a lockout. The minimum password length is 6 characters (`index.js:693`). |
| O7 | The analytics endpoint loads every feedback row into memory | `index.js:2731` | Fine at 16k rows, but it gets slower over time. Move the counting into a MongoDB aggregation. |

---

## 7. 🔵 Code quality

- **Dead code in `POST /api/feedback`.** `deferAiProcessing` (`index.js:2173-2174`) is true for all three submission modes, so the synchronous AI branches never run: about 140 lines at `:2255-2291`, `:2349-2428` and `:2386-2428`. Remove them.
- **Duplicate endpoints.** `/api/departments` and `/api/hospital-departments` exist side by side for POST, PATCH and DELETE (`index.js:1113-1256`). Only the hospital PATCH handles `hodUserId`, so the two behave differently.
- **Leftover TMS integration.** The schema has `tms*` fields and compose has `TMS_*` variables, but responses hard-code `tmsConfigured: false`. Either finish the integration or remove it (see gap G7).
- **`index.js` is about 3,300 lines in one file.** Split it into route modules: auth, users, catalog, feedback, analytics and reports.
- **Errors are swallowed.** Most `catch` blocks return a generic 500 without logging, which makes production problems hard to diagnose.
- **Almost no tests.** The only test file is `fieldSanitize.test.js`. There is no CI (`.github/` is absent) and no lint step.
- **Types don't match the server.** `UserRole = "admin" | "staff" | "hod"` (`auth.ts`) omits `superadmin` and `management`.
- **Two comments sit stacked on one function** (`index.js:501-502` and `:1442-1443`), so they now describe the wrong function.
- **The project note is out of date.** [[MAPIMS Feedback Workflow]] still says the AI isn't implemented, and describes the duplicate-text rule as the main decision. Both are out of date.

---

## 8. Gap analysis

### 8.1 Workflow vision compared with what's built

| Capability | Vision (workflow note / UI) | Implemented today | Gap |
|---|---|---|---|
| Feedback capture: web, staff, voice, bot | Yes | ✅ Yes, plus an offline outbox | — |
| AI sentiment, topics, urgency | Planned | ✅ Yes, via OpenRouter | Reliability (H3, H4, H5), privacy (C6) |
| Smart routing to department or service | Planned | ⚠️ Partly. The AI suggests a department and service, but an admin assigns manually | **G1:** no automatic assignment to the HOD who owns the department |
| Critical complaint → immediate alert | Yes | ❌ A ticket is opened, but nobody is told | **G2:** no SMS, email or WhatsApp alert to the HOD or manager |
| Manager notification and escalation | Yes | ❌ No | **G3:** no SLA, due dates, overdue view or escalation chain |
| Positive → thank-you and review prompt | Yes | ⚠️ Only a thank-you page | **G4:** no Google review prompt or follow-up |
| Close the loop with the patient | Implied | ❌ No | **G5:** the patient is never told about the resolution, and no contact is captured or consented |
| Pattern analysis for neutral feedback | Yes | ⚠️ Topics and summary reports exist | Reports freeze early (H8) |
| Digest emails to management | Phase 4 | ❌ No | **G6:** reports exist only on screen |
| TMS ticket sync | Fields and env vars exist | ❌ Disabled or removed | **G7:** decide whether to finish or delete |

### 8.2 Missing for a hospital complaint process

These are common expectations for hospital quality and accreditation complaint handling. Check them against the policy MAPIMS actually follows.

| # | Gap | Why it matters |
|---|---|---|
| G8 | **Audit trail.** No history of status changes, assignments, deletions or logins | Quality audits need to show who did what and when. Today a ticket can be reopened or deleted without trace (M8, M11). |
| G9 | **Account security.** No forced password change, no complexity rules, no lockout, no MFA for admins | C1 shows the consequence: 24 accounts on one default password. |
| G10 | **Turnaround-time (TAT) tracking.** No time-to-acknowledge or time-to-resolve, and no breach reporting | This is the main metric for complaint handling. All the timestamps needed (`assignedAt`, `resolutionNoteAt`) already exist, but nothing calculates it. |
| G11 | **CAPA follow-up.** `capa.targetDate` is stored but never checked | There's no reminder when a preventive action is due and no confirmation that it was done. |
| G12 | **Data retention and consent.** No retention policy for recordings or personal data, and no consent step before recording | This affects patient privacy compliance (India's DPDP Act 2023 applies to patient data). |
| G13 | **HOD data scope.** On 2026-10-06 the decision was that HODs see **hospital-wide** charts and the full feedback list on their Overview. Opening or changing a ticket is still limited to its assignee | Every HOD can read every patient's comments. Review this against the hospital's privacy policy. |
| G14 | **Monitoring and alerting.** No health dashboard, error tracking or alert when the AI worker stops | H4 could stop all ticket creation and nobody would notice. |
| G15 | **Backup and disaster recovery** | See O4. |
| G16 | **Automated tests and CI** | A small set of API tests would have caught H2, H3, H6 and U1. |

---

## 9. Suggested fix plan

### Phase 0 — this week (security incident hygiene)
1. Reset the 24 HOD passwords, purge `hod-users.csv` from history and check the repo's visibility (C1).
2. Require login on `/api/patient/lookup`, and restrict it to exact UHID (C2).
3. Put `/uploads` behind authentication (C3).
4. Add rate limiting to login, feedback, speech-to-text and AI inference (C5, O6).
5. Stop publishing port 5014 on the host (O1).

### Phase 1 — next 2–3 weeks (correctness)
6. Re-check the user and role from the database on each request, and invalidate tokens (H1).
7. Remove duplicate roles, seed with upserts, and build the unique index (H2).
8. Add an AI analysis lock, make split children idempotent, and add fetch timeouts (H3, H4).
9. Store AI failure explicitly instead of "neutral" (H5).
10. Fix the status chart, the 14-day trend and IST date grouping (H6, H7, H9).
11. Fix the summary report scheduler (H8).
12. Fix the HOD screen cards, the login error message and the stale permissions (U1–U4).

### Phase 2 — next 1–2 months (process gaps)
13. Audit trail and status history (G8, M8).
14. SLA, TAT tracking and escalation, with notifications for critical tickets (G2, G3, G10).
15. Auto-assign tickets to the HOD who owns the department (G1).
16. CAPA due-date reminders (G11).
17. Stop sending patient data to the LLM, and set a retention policy (C6, G12).
18. API tests and CI, and split `index.js` into modules (G16, code quality).

---

*Line numbers refer to the working tree on 2026-10-05 and will shift as code changes.*
