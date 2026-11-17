# Sprint 2 Midpoint Client-User Review Record (PM-52)

* **Parent Task:** [PM-22](https://soksambath2317.atlassian.net/browse/PM-22) (*Sprint 2 Midpoint Client Walkthrough Preparation*)
* **Subtask:** [PM-52](https://soksambath2317.atlassian.net/browse/PM-52)
* **Date:** 7 November 2026 (Preserving Sprint 2 midpoint milestone)
* **Attendees:** Yann LaiE (Product Owner / Client-User), Mai Sreynuth (Client-User / QA), Chhim Soksambath (Scrum Master)
* **Increment Reviewed:** Sprint 2 Data Ingestion & Storage Foundation (Export Upload, Preview Reconciliation, and Local Persistence).

---

## 1. Walkthrough & Capabilities Demonstrated

1. **Client Questionnaire Review (PM-32):**
   * Confirmed the 15-question discovery questionnaire targeting the upcoming interview with the capstone representative/advisor.
   * Priority questions confirmed: 10-hour rule unit definition, attribution rules, and raw vs. approved export availability.
2. **Import & Preview Reconciliation UI (PM-56):**
   * Demonstrated file selection and drag-and-drop for Label Studio JSON exports.
   * Verified that proposed records are staged into a **preview mode** rather than blindly committed.
   * Reconciled candidate tasks against existing workspace: shows exact counts for New Records, Updates/Overwrites, and Duration Unknown.
   * Demonstrated explicit **Confirm** (persists valid data) and **Cancel** (discards candidate without mutating workspace).
3. **Local Storage Hydration & Error Feedback (PM-61):**
   * Demonstrated that refreshing the page restores the dataset from browser storage with a clear loading indicator.
   * Verified non-blocking save toast notifications and recoverable retry banner if storage is unavailable.

---

## 2. Client-User Feedback (LaiE & Sreynuth)

* **Positive Findings:**
  * The staging table and explicit Confirm/Cancel prevent accidental data overwrites when testing new sample files.
  * Preserving "Duration Unknown" rather than guessing `0` seconds accurately mirrors the client's current Label Studio export reality.
* **Observed Adjustments / Feedback:**
  * Ensure that when the client interview (PM-33) concludes, the attribution toggle (credit by collector vs. annotator) can be adjusted dynamically across all dashboard views.
  * Requested that repeated imports preserve earlier task snapshots for audit purposes.

---

## 3. Action Items & Follow-up Ownership

| Item | Action Required | Owner | Target Date |
| :--- | :--- | :--- | :--- |
| 1 | Conduct actual client interview using PM-32 questionnaire | Soksambath | 10 Nov 2026 |
| 2 | Connect attribution toggle to member progress cards | LaiE / Phavy | Sprint 3 |
| 3 | Maintain automated regression tests for export parsing | Sreynuth | Continuous |
