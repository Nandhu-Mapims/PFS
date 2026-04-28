Design a complete, production-ready Patient Feedback & Experience Management System for a multi-specialty hospital (MAPIMS).

This is not a simple feedback form. This is a full UX system that connects patient experience → AI analysis → complaint resolution → management insights.

Focus on real hospital usage where:
- Many patients are elderly
- Many are not tech-savvy
- Staff-assisted workflows are critical
- Speed and simplicity matter more than visual complexity

---

## 🎯 CORE UX PRINCIPLES

1. Zero Friction Feedback (under 30 seconds)
2. Emotion-first interaction (not form-heavy)
3. Multi-channel adaptability (staff / patient / attender / voice)
4. Trust-building through instant acknowledgement
5. Clear escalation visibility for staff
6. Action-driven dashboards (not just analytics)

---

## 🧩 DESIGN SYSTEM

Create a consistent design system:

### Colors
- Primary: Hospital Blue (#2A6FDB)
- Secondary: Soft Green (#2FBF71)
- Alert: Red (#E5533D)
- Warning: Orange (#F4A261)
- Neutral: Light Grey (#F5F7FA)

### Typography
- Large readable fonts (16–18px minimum)
- Headings bold, clear hierarchy
- Accessible contrast

### Components
- Cards (rounded, shadow-light)
- Status badges (color-coded)
- Emotion icons (happy → angry)
- Large CTA buttons
- Input fields (minimal, wide, touch-friendly)

---

## 📱 SCREEN FLOW (END-TO-END EXPERIENCE)

---

### 🟢 SCREEN 1: Service Completion Trigger
Goal: Emotional closure + feedback initiation

UI:
- Illustration (staff helping patient)
- Message: “Thank you for visiting MAPIMS Hospital”
- Subtext: “Your feedback helps us improve care”
- CTA:
  - “Give Feedback”
  - “Staff will assist you”

UX:
- Calm, reassuring tone
- No clutter

---

### 🔵 SCREEN 2: Smart Feedback Mode Selection
Goal: Let system adapt to patient capability

Display 6 cards:

1. Staff Assisted  
2. WhatsApp / SMS Link  
3. Attender Feedback  
4. Voice Feedback  
5. Missed Call  
6. Paper Feedback  

Each card:
- Icon
- Title
- Micro description

UX:
- Grid layout (2x3)
- Large touch targets
- Highlight “Recommended” option

---

### 🟡 SCREEN 3: Emotion-Based Feedback Capture
Goal: Capture feedback in <20 seconds

UI:
- Question: “How was your experience today?”
- Emotion scale:
  😍 😃 😐 😟 😡
- Dynamic text appears based on selection

Example:
- Positive → “What did you like?”
- Negative → “What went wrong?”

Components:
- Large emoji buttons
- Optional text field
- Submit CTA

UX:
- No scrolling ideally
- Instant response feel

---

### 🎙️ SCREEN 4: Voice Feedback Interface
Goal: Remove typing barrier

UI:
- Center microphone button (large)
- Pulse animation when recording
- Text preview appears live

States:
- Idle
- Recording
- Processing
- Completed

UX:
- Minimal instructions
- Tamil + English support note

---

### 📄 SCREEN 5: Paper Upload Interface
Goal: Bridge offline to digital

UI:
- Drag & drop zone
- Upload button
- Preview card

UX:
- Simple, no confusion
- Staff-focused usability

---

### ✅ SCREEN 6: Instant Acknowledgement
Goal: Build trust

UI:
- Success icon (green tick)
- Message:
  “Your feedback has been received”
- Conditional display:
  - Ticket ID (if negative)
- CTA:
  - “Return Home”

UX:
- Immediate reassurance
- No delay

---

## ⚙️ SYSTEM FLOW VISUALIZATION (IMPORTANT)

Design a horizontal process diagram:

Feedback Input
→ Data Storage
→ AI Analysis
→ Decision Engine
→ Outcome

Outcomes:
- Positive → Review Prompt
- Neutral → Dashboard
- Negative → Complaint Ticket
- Critical → Alert + Escalation

Use:
- Icons
- Arrows
- Color-coded states

---

## 🧾 SCREEN 7: Complaint Management Dashboard

UI:
- Table layout

Columns:
- Ticket ID
- Patient
- Department
- Priority
- Status
- Time

Features:
- Filter by department
- Filter by status
- Search

UX:
- Clean, fast scanning
- Color-coded rows

---

## 🔍 SCREEN 8: Ticket Detail View

UI Sections:
- Patient Info
- Feedback Content
- AI Sentiment Tag
- Priority Badge
- Timeline (Created → Action → Resolved)

Actions:
- Update status
- Add notes
- Assign staff

UX:
- Clear hierarchy
- No clutter

---

## 📊 SCREEN 9: Management Dashboard

Goal: Decision-making, not decoration

Cards:
- Total Feedback
- Positive %
- Negative %
- Critical Alerts

Charts:
- Feedback trend (line)
- Department breakdown (pie)
- Complaint categories (bar)

Insights Panel:
- “Top issues this week”
- “Departments with highest complaints”

---

## 📱 MOBILE EXPERIENCE

- Fully responsive layout
- Bottom navigation:
  Home | Feedback | Tickets | Dashboard

UX:
- Thumb-friendly
- Minimal typing

---

## 🔥 MICRO-INTERACTIONS

Include:
- Button hover/press states
- Smooth transitions
- Feedback submission animation
- Loading states (AI processing)

---

## 🎯 FINAL OUTPUT EXPECTATION

- Full wireframe + high-fidelity UI
- All screens in one canvas
- Connected flow arrows
- Consistent design system
- Real-world usability focus

---

## ⚠️ IMPORTANT

Avoid:
- Over-complex forms
- Too many fields
- Fancy but useless UI
- Startup-style unrealistic flows

Focus on:
- Speed
- Clarity
- Accessibility
- Real hospital usage