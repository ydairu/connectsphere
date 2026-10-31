# SPM-20 and SPM-40 acceptance criteria and verification

Operational source: Product Backlog workbook rows for SPM-20 (Request and Process Changes to Submitted Events) and SPM-40 (Trigger a Re-Review of Venue and Equipment Arrangements When a Significant Change Is Requested), Event Change Requests, as supplied by the team on 31 October 2026. The criteria below are quoted from those rows. "SPM-67" in them is now SPM-91/92. Requirement source: `docs/requirements/effective-requirements.md` §4.19.

**[Team decision]** marks a choice recorded there as pending PO confirmation.

## SPM-20

| Acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| Given their own event at an eligible post-submission status, when the Organiser submits permitted changes, then the change request is sent to the assigned Event Coordinator for processing. | `POST /api/requests/:id/change-requests`; `canSubmitChangeRequest` and `normaliseChangeRequest` in `shared/changeRequests.js`; a notice to the assigned Coordinator. **[Team decision]** Eligible: Submitted, Under Review, Planning, Confirmed, Preparation; a Coordinator must be assigned; the event must not have started; one open request; none while a cancellation request is open. | `tests/spm-20/integration/changeRequestApi.test.js`; `tests/spm-20/integration/changeRequestPage.test.jsx`; `tests/spm-20/e2e/spm20.changeRequest.spec.js` |
| Significant changes use the shared SPM-10 classification ... These changes follow the SPM-40 review workflow. | `isSignificantField` and `normaliseSignificantPatch` from `shared/significantChanges.js`. | API and page suites |
| Ordinary changes, such as correcting descriptive text or contact information, do not trigger venue/equipment arrangement re-review. | Accepting one saves it through the section-edit save, where `significantChangeEffects` finds nothing to do. The event has no contact field, so ordinary means title, purpose and description. | API suite |
| Submitting a change request or postponement does not automatically release existing venue bookings or equipment reservations, or reset venue/technical sign-offs. | A submission writes only `changeRequests`, an activity entry and the notice. **[Team decision]** A postponement is a date or time change. | API suite (AC1) |
| The change-request process does not handle financial transactions, pricing, invoices or cancellation fees. | No such field or step exists; only the permitted event fields may be requested. | API suite (unpermitted fields refused) |
| The assigned Coordinator can accept, decline, or return the change request for modification through SPM-40. | `POST /api/requests/:id/change-requests/decision`; `canDecideChangeRequest`. A message is required to decline or return. A returned request is resubmitted as the same request. | API, page and E2E suites |
| When a significant change to a Confirmed event is accepted, the event returns to planning/reviewing and follows ... mandatory safety re-review and SPM-87's Coordinator-directed arrangement review, without automatically resetting venue/technical sign-offs. | Accepting calls `saveEdit` in `backend/src/controllers/requestController.js`, the same save as PATCH, so SPM-10, SPM-87, SPM-91 and SPM-41 all apply in one transaction. | API suite (Confirmed and Preparation); E2E |

## SPM-40

| Acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| The assigned Coordinator can see the proposed significant changes and which arrangements may be affected. (**[Team decision]** A pending significant request also blocks Confirm and submission for the safety check.) | `changeRequestSummary` gives current and proposed values with a significant flag; `GET /api/requests/:id/change-requests/assessment` (`backend/src/services/changeRequestService.js`) lists the sign-offs that may be affected (`affectedArrangements`). | API and page suites; E2E |
| The Coordinator assesses venue suitability and equipment needs and decides which arrangements require re-review. | The assessment runs `checkVenueSuitability` for each approved booked venue against the event as proposed. After accepting, the Coordinator chooses in the SPM-87 card. | API suite |
| Neither submission nor acceptance automatically releases bookings or resets venue/technical sign-offs. | As above; acceptance keeps and marks them (SPM-87). | API suite |
| When a significant change to a Confirmed event is accepted, the event returns to planning/reviewing and must pass the safety checkpoint again before confirmation. | SPM-10's return to Planning and `safetyReviewInvalidation`. | API suite; E2E |
| If essential changed requirements cannot be met, the request is returned for modification or rejected. | Return and decline, each with a required message. | API suite |

## Known gaps

- **No equipment assessment detail.** The assessment names the technical sign-off as possibly affected, but does not check equipment availability against the proposal.
- **Earlier requests are kept but not shown.** The event page shows the current request only.
- **Reassignment.** The notice goes to the Coordinator assigned at submission; a new Coordinator sees the request on the event page.
- **No withdrawal.** The Organiser cannot withdraw an open request; the Coordinator declines it.

## Verification record

31 October 2026, local (Windows): lint and build passed (existing large-chunk warning); 147 Node, 101 frontend and 2,331 Vitest tests passed (57 opt-in skips); Playwright 124 of 124 passed before the final assessment layout fix, and the SPM-20, SPM-87 and SPM-92 journeys passed again after it. API tests use mocked identity and in-memory persistence; Playwright uses the local Firebase double. Neither verifies the deployed Firebase project. Firestore rules were neither edited nor deployed. Human acceptance and peer review have not been done, so keep both stories In Progress until they are.
