# SPM-71 manual acceptance — event staff assignment

Status: **Human acceptance not run**. A read-only backfill dry run was performed on the configured Firebase project; see `docs/evidence/spm-71-backfill-dry-run.md`. Use an isolated test project with at least two eligible Venue Staff and two eligible Technical Support Staff accounts. Reseed only if that project is disposable. Record each result, account, event ID and screenshot or API response in the Sprint evidence before marking the story Done.

| Check | Result |
|---|---|
| Count each staff member's Planning, Confirmed and Preparation events. As the assigned Coordinator, approve an Under Review event. Verify one staff member per role is assigned, each has the fewest active events, and a tie selects the least recently assigned member. | Not run |
| Open the event as Coordinator. Verify both staff names. As each assignee, verify the in-app assignment notice and event on `/requests`; verify an unrelated staff member cannot open the event by URL or API. | Not run |
| In Planning, verify both preparation cards are read-only. Submit a venue booking and an equipment request; verify each goes to the event's matching assignee and can be decided only by that request's assignee. | Not run |
| Complete the venue, technical and safety approvals; move the event through Confirmed to Preparation. Verify each assignee can update only their own preparation section. Try the other section through the UI and a direct `PATCH /api/requests/:id`. | Not run |
| Complete or cancel an assigned event. Approve another Under Review event and verify the closed event no longer contributes to either workload. Return a separate assigned event to Planning and verify its assignees do not change or receive duplicate assignment notices. | Not run |
| Run `node backend/scripts/backfillEventStaff.js` without write flags against the intended project. Review every reported choice and warning, especially an event with several venue reviewers. After approval for that project, run `--write --project=<FIREBASE_PROJECT_ID>`, sample the saved event and old request records, and run it again to verify no further changes. | Dry run complete: 139 events; report review, write mode and sample checks not run. |

The backfill changes event assignment metadata and sends assignment notices; it never changes historical booking or equipment request assignees. A dry run is read-only. The local automated tests use in-memory persistence, a Firestore emulator, and an in-memory browser double; they do not establish live-project acceptance.
