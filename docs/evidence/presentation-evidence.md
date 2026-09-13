# Presentation Evidence Tracker

Last reviewed: 13 September 2026

## Purpose

This is the team's living evidence register for the self-contained Week 11 slide deck. The final deck must use the course template released in Week 11 and should explain how the team addressed the project rubric. The deck is submitted for assessment but is not presented.

Update this file during each Sprint. Record evidence when the activity happens; do not reconstruct unsupported evidence at the end of the project.

## Evidence Rules

An item counts as strong evidence when it is:

- **Relevant:** it directly supports a rubric criterion or assessed deliverable.
- **Traceable:** it identifies the requirement, story, task, test, decision, or outcome involved.
- **Verifiable:** a reviewer can open the repository-relative location and inspect the evidence.
- **Outcome-based:** it shows the result and why it matters, not merely that an activity occurred.
- **Contemporaneous:** it is recorded during or immediately after the Sprint activity.
- **Honest:** planned or incomplete work is not labelled as completed.
- **Owned:** a team member is responsible for maintaining or closing the evidence gap.

Use repository-relative paths only. Do not add personal filesystem paths, temporary download links, private chat links, or evidence that teammates cannot access.

## Status Legend

| Status | Meaning |
|---|---|
| Verified | The artefact exists in the repository and its relevant content has been checked. |
| In progress | Work or evidence exists but does not yet satisfy the intended rubric claim. |
| Planned | The team intends to produce the evidence, but it does not exist yet. |
| Gap / blocker | Required evidence is absent, contradictory, or cannot currently support the claim. |
| Not applicable | The criterion does not apply; include a short justification. |

## Rubric Readiness Matrix

| Rubric dimension | What strong evidence should demonstrate | Current repository evidence | Status | Next evidence needed |
|---|---|---|---|---|
| Scrum process and evidence | Sprint Planning, visible task-board movement, Daily Scrum records, Sprint Review outcomes, Sprint Retrospective actions, burndown, and required final-Sprint recordings. | Sprint 1 goal, forecast, ownership, and planning facts are summarised in [`project_context.md`](../../project_context.md). | In progress | Commit the authoritative Sprint Planning record and Product Backlog workbook; maintain the task board and burndown; add Review and Retrospective records; preserve the required final-Sprint recordings. |
| Estimation and planning | Planning Poker participation and results, reference-story rationale, consensus estimates, capacity reasoning, ownership, dependencies, and a defensible Sprint forecast. | Sprint 1 reference story, 18-point forecast, selected stories, ownership totals, and conservative-capacity rationale are recorded in [`project_context.md`](../../project_context.md). | In progress | Commit the estimation record and Sprint Planning record; reconcile the SPM-2 displayed estimate and the ownership inconsistency. |
| User stories and customer needs | Stories and acceptance criteria trace to the briefing and chronological clarifications; changes and overlaps are explained; scope reflects customer value. | [`customer-briefing.md`](../requirements/customer-briefing.md), [`clarification-session-1.md`](../requirements/clarification-session-1.md), [`clarification-session-2.md`](../requirements/clarification-session-2.md), and [`effective-requirements.md`](../requirements/effective-requirements.md). | Verified | Add story-level traceability from each implemented story and acceptance criterion to these requirement records and associated tests. |
| System design | C4 diagrams explain context, containers, major components, responsibilities, interfaces, data stores, and relevant design trade-offs; diagrams agree with the implementation. | Current stack and observed implementation state are summarised in [`project_context.md`](../../project_context.md). | Gap / blocker | Create and commit the required C4 design artefacts after the target architecture is agreed; verify them against the implemented system. |
| Working software | Demonstrable end-to-end increments satisfy selected acceptance criteria and the Definition of Done; screenshots or recordings show real behaviour using representative data. | Authentication/profile prototype code exists under [`frontend/src/`](../../frontend/src/) and [`backend/src/`](../../backend/src/), but it does not yet match the full Sprint 1 role model or event-request workflow. | In progress | Implement and verify Sprint 1 stories; capture representative user flows and acceptance results without claiming unfinished roles or workflows. |
| Testing and traceability | Core features have positive, negative, authorisation, and relevant boundary tests; each acceptance criterion maps to test evidence and results. | No tracked automated test suite was found during the current audit. | Gap / blocker | Add a requirements-to-tests traceability matrix, automated tests, test data, and reproducible test results for all core features. |
| Code quality and CI | The repository has agreed conventions, reviewable changes, lint/build/test automation, and a CI pipeline that executes relevant quality checks. | [`AGENTS.md`](../../AGENTS.md) defines evidence and implementation guardrails. The frontend has lint/build scripts, but no tracked CI workflow or automated test scripts were found. | Gap / blocker | Define repository-wide quality commands, add tests, add CI, preserve successful run evidence, and record how failures were resolved. |
| Accountability and explainability | Contributions, decisions, changes, ownership, review feedback, limitations, and individual understanding are visible and credible. | Sprint 1 story ownership and current decisions/gaps are recorded in [`project_context.md`](../../project_context.md); source priority and evidence rules are in [`AGENTS.md`](../../AGENTS.md). | In progress | Keep contribution and decision records current; link commits or merge requests to stories; record review feedback, rationale, and individual responsibilities. |

## Verified Evidence Register

Add a row only when there is an inspectable artefact. If the artefact is incomplete, use **In progress** rather than **Verified**.

| Date / Sprint | Rubric dimension | Activity or decision | Evidence produced | Repository-relative location | Why it matters | Verification performed | Owner | Status | Remaining gap / next evidence | Candidate Week 11 slide message |
|---|---|---|---|---|---|---|---|---|---|---|
| 13 Sep 2026 / Sprint 1 | User stories and customer needs | Preserved the original briefing and both clarification sessions as chronological sources, then reconciled their effective requirements. | Four requirement records with provenance, refinements, conflicts, team choices, and open items. | [`docs/requirements/`](../requirements/) | Shows that backlog and design decisions are grounded in customer evidence rather than assumptions. | Files checked for required content, internal links, UTF-8 validity, and placeholders. | Team | Verified | Add story/acceptance-criterion identifiers to the traceability matrix as implementation begins. | “We managed changing requirements chronologically and separated customer rules from team decisions.” |
| 13 Sep 2026 / Sprint 1 | User stories and customer needs | Reconciled the assessed scope across all 20 functionality areas. | Current effective-requirements record. | [`effective-requirements.md`](../requirements/effective-requirements.md) | Provides a shared implementation reference and exposes unresolved decisions before code is written. | Compared against the source records and checked for the 20-area scope and unresolved-decision section. | Team | Verified | Keep it updated when later customer decisions supersede an earlier rule. | “One effective source reduced ambiguity while preserving the audit trail.” |
| 12–13 Sep 2026 / Sprint 1 | Estimation and planning | Selected seven Sprint 1 stories, chose SPM-2 as the 3-point reference, forecast 18 points, and allocated work across three Developers. | Sprint 1 goal, selected-story table, point totals, and capacity explanation. | [`project_context.md`](../../project_context.md) | Shows collaborative estimation, reference sizing, ownership, and a conservative first-Sprint commitment. | Totals and story allocation were reconciled against the current team decision; known source inconsistencies are disclosed. | Product Owner, Scrum Master, Developers | In progress | Commit the primary estimation and Sprint Planning records; correct the ownership and SPM-2 display inconsistencies. | “With no historical velocity, we used Planning Poker, a reference story, availability, dependencies, and DoD effort to forecast 18 points.” |
| 13 Sep 2026 / Sprint 1 | Accountability and explainability | Established repository working rules, source priority, status honesty, and scope guardrails. | Team and coding-agent operating guide. | [`AGENTS.md`](../../AGENTS.md) | Makes decisions reproducible and reduces unsupported claims or accidental scope expansion. | Required rules and placeholders checked. | Team | Verified | Team members should review and agree to follow the guide; update it only when the workflow changes. | “We made evidence discipline and requirement provenance part of the development workflow.” |
| 13 Sep 2026 / Sprint 1 | Working software; testing and traceability | Audited the clean repository against Sprint 1 requirements. | Documented mismatch between the prototype and effective account/role/event-request requirements. | [`project_context.md`](../../project_context.md), [`RegisterPage.jsx`](../../frontend/src/pages/RegisterPage.jsx), [`RoleGuard.jsx`](../../frontend/src/components/RoleGuard.jsx), [`requireRole.js`](../../backend/src/middleware/requireRole.js) | Prevents the team from claiming SPM-42 or the event-request stories Done before all roles, multi-role permissions, ownership rules, and workflows are implemented and tested. | Repository structure and current scripts inspected; absent test and CI artefacts recorded as gaps. | Team | Verified | Convert each identified gap into traceable tasks and tests; rerun the audit after implementation. | “Our baseline audit exposed a single-role prototype mismatch early, before it became misleading completion evidence.” |

## Sprint-by-Sprint Evidence Index

### Sprint 1 — Secure Access and Event Request Foundation

**Sprint Goal**

> Deliver the first usable end-to-end workflow that enables users to securely register and access ConnectSphere according to their roles, while allowing Event Organisers to create, save, resume, and submit event requests for review.

**Current evidence**

- Requirement chronology and reconciliation: [`docs/requirements/`](../requirements/)
- Sprint scope, estimates, ownership, capacity reasoning, decisions, and known inconsistencies: [`project_context.md`](../../project_context.md)
- Repository operating and evidence rules: [`AGENTS.md`](../../AGENTS.md)
- Existing implementation baseline: [`frontend/src/`](../../frontend/src/) and [`backend/src/`](../../backend/src/)

**Evidence still required before Sprint 1 can be represented as completed**

- committed Product Backlog, Planning Poker/estimation, Sprint Planning, task-board, and burndown records;
- Definition of Done and acceptance results for every selected story;
- working Event Organiser registration, authentication, authorisation, create, draft, resume/list, and submit flows within the agreed story boundaries;
- a clear scope decision for SPM-42 if all five roles and combined multi-role permissions cannot be completed in Sprint 1;
- traceable positive, negative, validation, ownership, and authorisation tests;
- Sprint Review evidence showing the working increment and stakeholder feedback;
- Sprint Retrospective evidence with specific improvement actions and owners;
- reproducible build, lint, test, and CI results.

### Future Sprints

Create a subsection for each Sprint containing:

- Sprint Goal and stakeholder value;
- forecast versus completed story points;
- selected stories and ownership;
- key decisions and requirement changes;
- task-board and burndown evidence;
- working increment and acceptance results;
- test and CI results;
- Review feedback and resulting backlog changes;
- Retrospective actions, owners, and whether previous actions were completed;
- gaps carried forward and their effect on the next Sprint.

## Assessed Deliverable Checklist

| Deliverable / evidence | Expected quality | Repository location | Status |
|---|---|---|---|
| Final Product Backlog | Current, prioritised, estimated, grouped by Functionality Area, and consistent with accepted requirement changes. | Add the committed workbook path here. | Planned |
| Sprint goals, backlogs, and tasks | Each Sprint has a value-focused goal, selected stories, actionable tasks, owners, and DoD alignment. | Add committed Sprint records here. | Planned |
| Estimation records | Show voters, rounds where needed, discussion/rationale, consensus, and reference-story calibration. | Add committed estimation record here. | Planned |
| Scrum task boards | Show work moving through agreed states during each Sprint, not a reconstructed final snapshot. | Add board export or repository record here. | Planned |
| Burndowns | Use the team's chosen consistent unit and show daily progress from the Sprint baseline; explain material deviations. | Add committed burndown evidence here. | Planned |
| Sprint Reviews | Show demonstrated increment, acceptance outcome, stakeholder feedback, and backlog adaptation. | Add Review records here. | Planned |
| Sprint Retrospectives | Show what worked, what did not, specific improvement actions, owners, and follow-through. | Add Retrospective records here. | Planned |
| C4 system design | Diagrams are legible, internally consistent, implementation-aligned, and explain responsibilities and interfaces. | Add design paths here. | Planned |
| Test cases and traceability | Every core feature and relevant acceptance criterion maps to executable test evidence and results. | Add test and traceability paths here. | Gap / blocker |
| Working code and README | A teammate can set up, run, verify, and understand the implemented scope without relying on one person's machine. | [`README.md`](../../README.md), [`frontend/`](../../frontend/), [`backend/`](../../backend/) | In progress |
| CI pipeline and results | Pipeline runs the relevant build, lint, and test checks; recorded evidence comes from real runs. | Add workflow path here. | Gap / blocker |
| Final-Sprint ceremony recordings | Sprint Planning, Sprint Review, Sprint Retrospective, and one Daily Scrum are retained as required evidence. | Store only an approved repository-accessible reference or submission reference. | Planned |
| Repository-access evidence | Assessors can access the correct repository/version and contribution history. | Record the approved submission reference when available. | Planned |
| Week 11 slide deck | Uses the released template; self-contained; concise; every completion claim is supported by this register. | Add the final deck path here. | Planned |

## Evidence Entry Template

Copy this row into the Verified Evidence Register when new evidence is produced:

| Date / Sprint | Rubric dimension | Activity or decision | Evidence produced | Repository-relative location | Why it matters | Verification performed | Owner | Status | Remaining gap / next evidence | Candidate Week 11 slide message |
|---|---|---|---|---|---|---|---|---|---|---|
| YYYY-MM-DD / Sprint N | Rubric dimension | What actually happened | Inspectable artefact or result | `relative/path` | Direct rubric relevance | Check actually performed and result | Name | Verified / In progress / Planned / Gap / Not applicable | Specific next evidence | One concise evidence-based message |

## Week 11 Deck Assembly Rules

When the course releases the Week 11 template:

1. Preserve the required slide order and fields in the template.
2. Select the strongest verified evidence for each rubric dimension; do not paste this entire tracker into slides.
3. Use short claims supported by screenshots, diagrams, results, or repository references.
4. Show adaptation and learning, not only final outputs—for example, requirement changes, estimate calibration, test failures fixed, or retrospective actions completed.
5. Use figures consistently across the backlog, Sprint records, burndown, test summary, repository, and slides.
6. Do not label an incomplete story, mocked path, planned test, local-only result, or absent CI run as completed.
7. State limitations that materially affect the claim and show the next action where appropriate.
8. Before submission, verify every slide claim against the latest repository evidence and the released marking rubric.
