# PFS — Upgrade Proposal: Flow & UI

**Date:** 2026-09-01
**Scope:** Patient Feedback System (backend + frontend)
**Basis:** Measured against the local `feedbacksystem_remote` database and the
current `main` working tree. Every number in "Where things stand" was queried,
not estimated. Recommendations are marked as such.

---

## 1. Where things stand

These figures come from the live database on 2026-09-01:

| Measure | Value | Read |
|---|---:|---|
| Feedback records | 9,011 | Healthy intake |
| Status `New` | 9,009 | — |
| Status `In Progress` | 2 | — |
| Status `Resolved` | **0** | **Nothing has ever completed** |
| Unassigned tickets | 8,832 (98%) | **Routing is not happening** |
| Departments in catalog | 48 | — |
| …of which are case-duplicates | **17** | `CARDIOLOGY` *and* `Cardiology` |
| Routing services | 21 | — |
| User accounts | 31 | 25 HOD, 3 staff, 3 admin/mgmt |

The intake side works. **The response side does not.** 9,011 pieces of patient
feedback have been collected and 0 have been resolved. That single fact should
drive the roadmap ahead of any visual work.

---

## 2. Priority 0 — Close the loop on 8,832 unassigned tickets

### The problem

Assignment is entirely manual. `PUT /api/feedback/:id/assign`
(`backend/src/index.js:3042`) sets `assignedToUserId` only when an admin picks a
HOD by hand, one ticket at a time. There is no auto-assignment anywhere in the
submission path.

At one ticket per 20 seconds of admin time, clearing the current backlog is
roughly **49 hours of uninterrupted clicking**. It will never happen, and the
backlog grows daily.

### What already exists

`frontend/src/app/lib/hodRouting.ts` already contains exactly the matching logic
this needs — `normKey()` normalises EMR department labels (case, punctuation,
`&` → `and`), plus a British→American spelling canon (`paediatric` →
`pediatric`, `gynaecology` → `gynecology`). **The matcher was built and is
sitting unused for this purpose.**

### Recommendation

1. **Move `hodRouting` matching to the backend** (`backend/src/routing.js`) so it
   runs at submission time, not just in the browser.
2. **Auto-assign on create.** When feedback is submitted, resolve
   `lookupDepartment` → department → owning HOD, and set `assignedToUserId`
   in the same write. Fall back to unassigned when confidence is low.
3. **Backfill the existing 8,832** with a one-off script
   (`backend/scripts/backfillAssignments.js`), dry-run first, printing the
   match rate before it writes anything.
4. **Add an "Unroutable" queue** for what the matcher cannot place, so those
   surface for human triage instead of vanishing into a 9,000-row list.

Expected effect: if the matcher places even 70% of tickets, the manual queue
drops from 8,832 to ~2,600, and new feedback lands in a HOD's queue the moment
it is submitted.

### Also needed

- **Ageing indicator.** A ticket sitting `New` for 30 days should be visibly
  escalated. Right now nothing distinguishes today's feedback from March's.
- **Why is `Resolved` zero?** Either the resolution flow is broken, or staff have
  never been trained on it, or it is too buried to find. Worth confirming
  which before building anything new — the answer changes the fix.

---

## 3. Priority 1 — Fix the duplicate department catalog

### The problem

17 of 48 departments exist twice under different casing:

```
CARDIOLOGY            /  Cardiology
DERMATOLOGY           /  Dermatology
EMERGENCY MEDICINE    /  Emergency Medicine
GENERAL SURGERY       /  General Surgery
GENERAL MEDICINE      /  General Medicine
MEDICAL ONCOLOGY      /  Medical Oncology
NEUROSURGERY          /  Neurosurgery
SURGICAL GASTRO…      /  Surgical Gastroenterology
… 9 more
```

This is visible in the HOD mapping checklist, where an admin picking
"Cardiology" has to guess which of two identical-looking entries is the one
tickets actually arrive under. **A HOD mapped to the wrong twin receives
nothing, and nobody finds out.** Given the routing backlog above, this is a
plausible contributor.

### Recommendation

1. **Merge script** (`backend/scripts/mergeDuplicateDepartments.js`) — pick the
   canonical casing, repoint every `Feedback.department`, `lookupDepartment`,
   `User.departmentId` and HOD mapping, then delete the loser. Dry-run first.
2. **Add a case-insensitive unique index** on `Department.name` so it cannot
   recur.
3. **Normalise on write** — trim and title-case at the API layer, and apply the
   same `normKey()` on EMR import so `CARDIOLOGY` from the EMR resolves to the
   existing `Cardiology` rather than creating a third row.

---

## 4. Priority 2 — Credentials and account hygiene

### Current state

| Finding | Detail |
|---|---|
| Shared HOD password | All 25 HOD accounts use `mapims` |
| Plaintext in repo | `hod-users.csv` carries a `Password` column, untracked but present on disk |
| Seed defaults live | `admin` / `admin123`, `staff` / `staff123` straight from `.env` |
| No forced rotation | `HodChangePasswordDialog` exists but is opt-in from the nav — nothing compels a first-login change |
| Orphaned account | `mani1995` — a staff account whose password nobody holds |
| No account lifecycle | `userSchema` is `username, passwordHash, role, departmentId, serviceId`. No disable flag, no last-login, no email |

For a system holding patient names, registration numbers, ward and IP numbers,
25 clinicians sharing one six-letter password is the most serious issue in this
document after the backlog.

### Recommendation

1. **`mustChangePassword: Boolean`** on `userSchema`, set on creation and on
   admin reset. Gate the app behind the change dialog when true — reuse the
   existing `HodChangePasswordDialog`, just make it non-dismissible.
2. **Rotate all 25 HOD passwords** to unique values via
   `npm run reset-password` (added this session), distributed individually.
3. **Delete `hod-users.csv` from disk**, or strip the password column and add it
   to `.gitignore`. It has not been committed — keep it that way.
4. **Change `admin123` / `staff123` before the Hostinger deployment.** These are
   in `backend/.env`, which the compose file loads directly into production.
5. **Add `isActive`** so a departing clinician can be disabled without deleting
   their ticket history (`assignedToUsername` is denormalised onto feedback —
   deleting the user orphans the trail).
6. **Add `lastLoginAt`** so dormant accounts are visible.
7. **Audit log** for user create / role change / delete. A hospital system that
   cannot answer "who granted this person admin, and when" will struggle any
   compliance review. `roles.manage` currently lets a super admin grant any
   capability with no record.

---

## 5. Priority 3 — The list endpoint will not scale

`GET /api/feedback` (`backend/src/index.js:2608`) builds
`Feedback.find(filter).sort({_id:-1})` with **no `limit` or `skip`**. A `lite=1`
projection trims the columns, but every matching document is still serialised
and sent.

At 9,011 documents this already means a multi-megabyte response on the admin
dashboard. It grows linearly and unboundedly.

### Recommendation

1. **Cursor pagination** — `?limit=50&before=<_id>`. Sorting is already by
   `_id` descending, so keyset pagination drops in without an offset scan.
2. **Return a total count separately** so the UI can show "50 of 9,011" without
   fetching 9,011.
3. **Virtualised or paged table** on the client. `ListPagination.tsx` already
   exists — wire it to the server rather than slicing a fully-loaded array.
4. **Index review** — confirm compound indexes on
   `{assignedToUserId, status, _id}` and `{department, _id}`, the two filters
   that matter most.

---

## 6. UI and interaction

### 6.1 Users page — remaining gaps

The page was rebuilt this session (table, stat-tile filters, search, slide-over
form). What it still lacks:

- **Native `confirm()` for delete.** `onDeleteUser` uses the browser dialog,
  which is unstyled and inconsistent with the rest of the app. `ui/alert-dialog.tsx`
  is already in the design system and unused here.
- **No bulk actions.** Mapping 25 HODs one at a time is the same manual-labour
  problem as ticket assignment, in miniature. Multi-select + bulk role or
  department assignment would help.
- **No pagination.** Fine at 31 users; revisit past ~100.
- **No link to `/admin/roles`.** A role badge should be clickable through to the
  capability matrix that defines it.
- **Password strength is unenforced beyond length.** `minLength={6}` on the form
  and 6 in the reset script; `mapims` (6 chars) passes both.

### 6.2 Route sprawl

`routes.tsx` carries 12 legacy redirect paths:

```
feedback-mode, feedback-form, voice-feedback, bot-feedback,
userfeed, userfeed/mode, userfeed/give, userfeed/bot,
userfeed/paper, userfeed/thank-you,
admin/usercreation, usercreation, manage/access
```

Plus `overview`, `submissions`, `tickets`, `sentiment`, `summary-report` are
each registered **twice** (once under management, once under admin). Every
duplicate is a place where a guard can drift out of sync with its twin.

**Recommendation:** keep the redirects for one release with a deprecation note,
then delete. Consolidate the duplicated insight routes behind one definition
with a capability check.

### 6.3 Consistency

Three different card idioms coexist:

- `rounded-xl shadow-md` — older pages (`AdminPage`, `Dashboard`)
- `rounded-2xl border shadow-sm` — `AdminRolesPage`
- `rounded-xl border-gray-200/80` — the new `AdminUsersPage`

**Recommendation:** pick one — the bordered, low-shadow idiom reads best at
this density — and extract `Card`/`PageHeader`/`Toolbar` into
`components/ui/`. `ui/card.tsx` already exists and is unused by the admin pages.

### 6.4 The patient-facing flow

Not audited in depth this session, but two things are worth checking given the
numbers above:

- **Submission is working well** (9,011 records) — do not destabilise it.
- **`FeedbackMode` offers form / voice / bot.** Worth measuring which mode
  patients actually complete versus abandon; `submissionMode` is already stored
  on every record, so the data to answer this exists today.

---

## 7. Suggested sequence

| Phase | Work | Why first |
|---|---|---|
| **1** | Merge duplicate departments | Routing depends on a clean catalog |
| **2** | Backend auto-routing + backfill | Turns 8,832 dead tickets into queues |
| **3** | Forced password change + rotate HOD passwords | Highest security exposure |
| **4** | Feedback list pagination | Before the dataset doubles |
| **5** | Audit log + `isActive` + `lastLoginAt` | Compliance groundwork |
| **6** | Shared UI primitives, route cleanup | Quality-of-life; no user-facing risk |

Phases 1 and 2 are the ones that change what this system *does*. Everything
after is making it safe and maintainable.

---

## 8. One thing to decide first

**Why has nothing ever been marked Resolved?**

9,011 in, 0 out. Before building auto-routing, confirm whether the resolution
flow is broken, undiscoverable, or simply unused — because if HODs cannot close
a ticket, routing 8,832 of them to their queues will produce 25 overwhelmed
inboxes rather than a working process.

Everything in this document assumes the answer is "nobody was assigned anything,
so nobody had anything to resolve." That is the likely explanation given 98%
unassigned, but it is worth ten minutes of confirmation before committing to
Phase 2.

---

## Appendix — reproducing the figures

```bash
docker exec pfs_mongo mongosh feedbacksystem_remote --quiet --eval '
print("feedback: " + db.feedbacks.countDocuments({}));
print("by status: " + JSON.stringify(db.feedbacks.aggregate([
  {$group:{_id:"$status",n:{$sum:1}}}]).toArray()));
print("unassigned: " + db.feedbacks.countDocuments({assignedToUserId:null}));
const names = db.departments.find({},{name:1}).toArray().map(d=>d.name);
const lower = names.map(n=>n.toLowerCase().trim());
print("case-dupes: " + [...new Set(lower.filter((n,i)=>lower.indexOf(n)!==i))].length);
'
```
