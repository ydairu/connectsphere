# ConnectSphere architecture

Reviewed 27 October 2026 against source revision `34bd89a`. These documents describe the codebase, not a deployment inventory or a declaration that backlog stories are Done.

- [C4 model](c4-model.md) shows the current system, containers, and application components.
- [Codebase architecture](codebase-architecture.md) records API and data boundaries, key transactions, and verification environments.
- [Effective requirements](../requirements/effective-requirements.md) distinguishes customer requirements, team decisions, and open questions. The [briefing](../requirements/customer-briefing.md), [Session 1](../requirements/clarification-session-1.md), and [Session 2](../requirements/clarification-session-2.md) preserve chronology.

The later customer requirements include a Coordinator Lead, Safety Officer and safety approval checkpoints. The code still has five roles and automatic Coordinator assignment. It has a Preparation status and local edit gate, but the production safety verifier prevents entry until the review integration is implemented. See [project context](../../project_context.md) for the current increment and its limits. The chronological briefing and clarification files retain their original statements.

## Functionality-area map

This compact map identifies current code paths, not acceptance or workbook status. Areas follow [effective requirements §4](../requirements/effective-requirements.md#4-remaining-core-functionality-areas). “Partial” includes workflows whose current behavior is superseded by the later Week 7 requirements.

| Area | Current code path | Remaining boundary |
| --- | --- | --- |
| 1. Authentication and authorisation | Firebase sign-in, five-role profile and API permissions | Lead and Safety Officer roles; organisation membership |
| 2. Event request creation | Draft creation and submission | New Lead assignment handoff |
| 3. Draft requests | Private save, reopen and list | No new architecture gap identified here |
| 4. Review and approval | Coordinator review, return, approve and reject actions | New safety review gate |
| 5. Coordinator assignment | Automatic assignment and Coordinator reassignment | Lead-controlled unassigned queue and reassignment |
| 6. Event status management | Status actions, arrangement decisions, cancellation, Preparation status and start action | Persisted safety decision and checkpoints still required |
| 7. Event information management | Scoped section edits, preparation sections, change history, significant-change effects | General post-submission field validation; safety re-review after significant Preparation edits |
| 8. Venue catalogue | Create, edit, list, detail; setup/turnaround fields | Operational completeness against backlog criteria requires separate review |
| 9. Availability calendar | Booking, hold and maintenance display | Verify all Week 7 acceptance criteria separately |
| 10. Venue search/filter | Catalogue filters and time availability | Verify all suitability/filter criteria separately |
| 11. Venue suitability | Event/venue suitability endpoint | Full multi-venue suitability acceptance remains a separate check |
| 12. Venue booking request | Per-need requests, holds and replacements | Lead/safety handoff and remaining human acceptance |
| 13. Venue booking approval | Assigned Venue Staff approve/reject a booking | Human acceptance and downstream preparation alignment |
| 14. Booking conflict detection | Venue locks and buffered overlap checks | Existing conflicts introduced by changed buffers need review handling |
| 15. Equipment request management | Submission, assigned queue and decisions | Full technical requirement matching remains unresolved |
| 16. Equipment availability checking | Type/unit count with reservation overlap | Structured technical attribute matching and breakdown handling |
| 17. Equipment reservation | Reserve, view and release on whole-event close | Reconfirmation after significant changes remains separate scope |
| 18. Attendee registration | Account registration and attendee projection only | Event registration, capacity and waitlist absent |
| 19. Event change requests | Significant edits and consequences | Formal change-request/review workflow absent |
| 20. Notifications | Recipient-scoped in-app records for selected actions | Full event/attendee coverage and delivery policy incomplete |

## Evidence and limits

The model was checked against [frontend routes](../../frontend/src/App.jsx), [API mounts](../../backend/src/app.js), [request routes](../../backend/src/routes/requestRoutes.js), [venue routes](../../backend/src/routes/venueRoutes.js), [equipment routes](../../backend/src/routes/equipmentRoutes.js), [shared permissions](../../shared/permissions.js), [status policy](../../shared/statusTransitions.js), [Firestore rules](../../firestore.rules), and the service files linked in the model. Diagram arrows are current interactions. Shared JavaScript runs inside frontend/backend processes; it is not a separate service.

Existing test files are evidence locations only. This documentation update does not deploy rules, exercise the live Firebase project, or change workbook status.
