# PFS — UX & Analytics Upgrade Proposal

**Date:** 2026-09-01
**Scope:** Usability of the feedback/ticket flow, and the insight dashboards
**Companion to:** [`UPGRADE.md`](./UPGRADE.md) (routing, data integrity, security)

Every figure below was queried against the live `feedbacksystem_remote`
database, and every palette verdict is the output of a validator run — not
opinion. Commands to reproduce are in the appendix.

---

## Part A — User-friendliness

### A1. The core UX problem: 9,011 items, one undifferentiated pile

The data has a shape the interface completely ignores:

| Slice | Count | Share |
|---|---:|---:|
| Total feedback | 9,011 | 100% |
| Rated 4–5 ★ | 8,658 | **96%** |
| Rated 1–3 ★ | 353 | 4% |
| AI sentiment `positive` | 7,597 | 84% |
| AI sentiment `negative` | 648 | 7% |
| AI urgency `high` | **23** | **0.26%** |
| High urgency **and** unassigned | **22** | — |

**The actionable queue is 23 tickets, not 9,011.** The AI has already done the
triage — `aiSentiment` and `aiUrgency` are populated on 8,976 of 9,011 records
(99.6% coverage). That signal exists and the UI does not lead with it.

Today an administrator opens the ticket list and sees nine thousand rows sorted
by recency, where 96% are patients saying thank you. The 22 unassigned urgent
complaints are indistinguishable from them.

**Recommendation — a triage-first landing screen.** Replace "most recent first"
with a queue ordered by what needs a human:

```
┌─ Needs attention ────────────────────────────────────┐
│  🔴  22  High urgency, unassigned      → Review now  │
│  🟠 470  Negative, unassigned          → Assign      │
│  ⚪ 731  Neutral                        → Sample     │
│  🟢 7,597 Positive                      → Digest     │
└──────────────────────────────────────────────────────┘
```

Positive feedback does not need a ticket queue — it needs a weekly digest and a
"share with the department" action. Treating praise and complaints with the same
workflow is what made the queue unusable.

### A2. Nothing has ever been closed — the exit is missing

`Resolved: 0` out of 9,011. `capa.rootCause` populated: **0**.

Two possibilities, and they need different fixes:

- **The flow is undiscoverable.** Resolution and CAPA live inside `TicketDetail`,
  reachable only after opening an individual ticket from a 9,000-row list.
- **The flow is unusable.** CAPA asks for root cause, corrective action,
  preventive action and a target date — a heavy form for "the food was cold."

**Recommendation:**
1. **Tiered closure.** A one-click *Acknowledge* for low-severity items; the full
   CAPA form only for `high` urgency or negative sentiment. Requiring a root-cause
   analysis on all 9,011 guarantees zero get closed.
2. **Bulk acknowledge** for positive feedback — select-all on a filtered view.
3. **Make the action visible in the list**, not only in the detail page.

### A3. Voice is 76% of intake — design for it

| Mode | Count | Share |
|---|---:|---:|
| `voice` | 6,824 | **76%** |
| `bot` | 1,355 | 15% |
| `standard` form | 832 | 9% |

Patients overwhelmingly choose voice. This deserves a check the data can't
answer alone: **is the reviewer experience for a voice ticket good?** Reviewing
6,824 audio clips is only viable if the transcript and AI summary lead, with
audio as confirmation — not if a reviewer must press play on each one.

**Recommendation:** transcript-first ticket rendering, audio inline as a
secondary control; make `aiSummary` the row preview in the list.

### A4. Smaller usability fixes

| Issue | Where | Fix |
|---|---|---|
| Native `confirm()` for delete | `AdminUsersPage.onDeleteUser` | `ui/alert-dialog.tsx` exists and is unused |
| No bulk actions | Users, tickets | Multi-select + bulk assign/acknowledge |
| No ticket ageing cue | Ticket list | Days-open badge; escalate past a threshold |
| Weak password rule | Form `minLength={6}` | See `UPGRADE.md` §4 |
| 12 legacy redirect routes | `routes.tsx` | Deprecate then delete |
| Three card idioms coexist | Admin pages | Extract shared `Card`/`PageHeader` |

---

## Part B — Analytics

### B1. The chart palette fails validation — measured, not guessed

`SubmissionTrendsDashboard.tsx:49` and `TicketsTrendsDashboard.tsx:33` share:

```js
const DEPT_COLORS = ["#2A6FDB","#2FBF71","#8B5CF6","#F4A261","#E5533D","#6B7280"];
```

Validator output (light surface):

```
[FAIL] Lightness band    outside band: #F4A261 (0.781)
[FAIL] Chroma floor      below floor (reads gray): #6B7280 (0.023)
[PASS] CVD separation    worst pair ΔE 9.9 (protan)
[PASS] Normal-vision     worst pair ΔE 17.2
[WARN] Contrast          below 3:1: #2FBF71 (2.32), #F4A261 (2.01)
→ FAILED
```

The sentiment triple `#10b981 / #fbbf24 / #ef4444` also fails — `#fbbf24`
(neutral) sits at lightness 0.837, far outside the band, and contrasts 1.63:1
against the surface. On a projector or a clinician's older monitor, neutral
effectively disappears.

**A validated replacement**, passing every check in *both* light and dark:

| Slot | Light | Dark |
|---|---|---|
| 1 blue | `#2a78d6` | `#3987e5` |
| 2 orange | `#eb6834` | `#d95926` |
| 3 aqua | `#1baf7a` | `#199e70` |
| 4 yellow | `#eda100` | `#c98500` |
| 5 magenta | `#e87ba4` | `#d55181` |
| 6 green | `#008300` | `#008300` |

```
light → ALL CHECKS PASS
dark  → ALL CHECKS PASS
```

The remaining light-mode contrast WARN is dischargeable with visible labels or a
table view — both recommended below regardless.

### B2. Colour is assigned by rank, not identity

All three dashboards do:

```js
color: DEPT_COLORS[index % DEPT_COLORS.length]
```

Two defects in one line:

1. **Cycling.** A 7th department silently reuses slot 1. Two different
   departments render in the same blue with nothing distinguishing them.
2. **Rank-based assignment.** `index` is the position in a *sorted, filtered*
   array. Change the date range and Cardiology can go from blue to orange —
   the same entity changes colour between two views of the same dashboard.

**Recommendation:** assign colour by a stable key (department `_id`), fixed at
load. Beyond 6 series, fold the tail into "Other" or switch to small multiples —
never generate a 7th hue.

### B3. `TOPIC_COLORS` is a rainbow used for identity

`ManagementOverviewDashboard.tsx:42` defines a red→orange→yellow→green ramp and
indexes it by topic position. That is a *sequential* ramp doing a *categorical*
job: it implies cleanliness is "worse" than food purely because it sorted first.
Recolour on any filter change and the implied severity ordering changes with it.

**Recommendation:** categorical hues for topic identity. If severity is the
intended message, encode it as bar *length* or an explicit status colour — not
as position in a rainbow.

### B4. Chart forms are lopsided

Current inventory across all dashboards:

| Form | Count |
|---|---:|
| Bar | 16 marks / 11 charts |
| Pie | 4 |
| Line | **2** |

You hold **three months of daily data** (2 Jun – 28 Aug 2026, 9,011 records) and
render it with two line charts. Change-over-time is the question management
actually asks — "are complaints rising in Cardiology?" — and it is the least
served form here.

**Recommendation:**
1. **Promote trends.** Complaint volume over time, per department, as the primary
   management view. One axis; never dual-axis.
2. **Retire the pies.** Four pie charts across the dashboards — all are
   part-to-whole comparisons better read as horizontal bars. A pie is defensible
   only at 2–3 slices with one dominant share; sentiment (3 slices, 84/8/7) is
   the single case worth keeping, and even it reads better as a stacked bar.
3. **Add a hover layer.** Crosshair + tooltip on every line chart, per-mark
   tooltip on bars. Currently the charts are static pictures of numbers.
4. **Table view behind every chart** — this also discharges the contrast WARN.

### B5. Metrics that are missing

The scorecard computes `closeRate` and `capaCoverage`. Both are **0 everywhere**,
because nothing is closed — so today every dashboard renders an empty story.
Once §A2 is fixed, these become meaningful. Until then, the metrics worth adding
measure the *intake* side, which is working:

| Metric | Why | Data available? |
|---|---|---|
| **Time to first assignment** | The real bottleneck (98% unassigned) | `_id` timestamp → `assignedAt` ✅ |
| **Time to resolution** | The outcome measure | `assignedAt` → `resolutionNoteAt` ✅ |
| **Backlog age histogram** | Shows the 3-month pile-up | `_id` timestamp ✅ |
| **Negative rate by department** | Normalises for volume — a big department with 20 complaints may be healthier than a small one with 5 | `aiSentiment` + `department` ✅ |
| **Completion rate by submission mode** | Is voice or bot abandoned more? | `submissionMode` ✅ |
| **Topic trend over time** | Is cleanliness improving? | `aiTopics` + `_id` ✅ |

Every one of these is computable from fields already stored. None require a
schema change.

### B6. Rating: show the distribution, never the mean

Ratings are extremely skewed:

```
5★ ██████████████████████████████████ 6,718
4★ ██████████ 1,940
3★ ▌ 148
2★ ▌ 133
1★ ▌ 72
```

A mean of ~4.7 is technically true and tells you nothing — it will sit near 4.7
whether the 1★ count is 72 or 720. **Show the bar distribution, and track the
1–2★ count as its own headline number.** That figure moves when something is
actually wrong.

### B7. Topic normalisation — half-solved already

The raw `aiTopics` field fragments badly:

```
cleanliness 3,482  /  Cleanliness 1,191     ← same theme, split
staff interaction 1,201  /  staff 1,043      ← same theme, split
doctor 852  /  doctors 691                   ← same theme, split
```

Un-normalised topic charts undercount the leading theme by roughly half.

**Good news:** `frontend/src/app/lib/complaintTopics.ts` (298 lines, currently
untracked) already folds these into canonical buckets — "Cleanliness &
Housekeeping", "Transport & Access", "Food & Diet" — with a documented
first-match-wins ordering.

**Recommendation:** commit it, and move the canonicalisation **server-side** so
every consumer (dashboards, exports, the summary-report worker) counts the same
way. Client-only normalisation means an xlsx export and the dashboard disagree.

---

## Suggested sequence

| Phase | Work | Effort | Impact |
|---|---|---|---|
| 1 | Triage-first queue (§A1) | M | **Highest** — makes 9,011 usable |
| 2 | Tiered closure + bulk acknowledge (§A2) | M | Unblocks `Resolved: 0` |
| 3 | Palette swap + stable colour keys (§B1–B3) | **S** | Cheap correctness win |
| 4 | Trend charts, retire pies, add tooltips (§B4) | M | Answers the real questions |
| 5 | Time-to-assign / time-to-resolve metrics (§B5) | M | Measures the bottleneck |
| 6 | Topic canonicalisation server-side (§B7) | S | Fixes ~2× undercount |

Phase 3 is a few hours and makes every existing chart correct. Phase 1 is the
one that changes whether this system is used.

---

## Appendix — reproducing the figures

**Data:**

```bash
docker exec pfs_mongo mongosh feedbacksystem_remote --quiet --eval '
printjson(db.feedbacks.aggregate([{$group:{_id:"$aiSentiment",n:{$sum:1}}}]).toArray());
printjson(db.feedbacks.aggregate([{$group:{_id:"$aiUrgency",n:{$sum:1}}}]).toArray());
printjson(db.feedbacks.aggregate([{$group:{_id:"$submissionMode",n:{$sum:1}}}]).toArray());
printjson(db.feedbacks.aggregate([{$group:{_id:"$rating",n:{$sum:1}}},{$sort:{_id:1}}]).toArray());
print("high+unassigned: " + db.feedbacks.countDocuments({aiUrgency:"high",assignedToUserId:null}));
print("neg+unassigned: "  + db.feedbacks.countDocuments({aiSentiment:"negative",assignedToUserId:null}));
'
```

**Palette validation** (script ships with the `dataviz` skill):

```bash
node scripts/validate_palette.js "#2A6FDB,#2FBF71,#8B5CF6,#F4A261,#E5533D,#6B7280" --mode light
node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300" --mode light
node scripts/validate_palette.js "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300" --mode dark
```
