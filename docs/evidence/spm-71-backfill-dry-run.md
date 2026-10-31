# SPM-71 live-project backfill dry run — 29 October 2026

Project: `connectsphere-6546c`. This was a read-only inspection. No event, lock, activity, notification, booking, or equipment request document was written.

The report found **139 active events** missing at least one canonical staff assignee. Two events have conflicting historical Venue Staff reviewers; the newest current eligible booking reviewer is proposed. No historical reviewer was ineligible. Thirty-three role assignments require the workload fallback. The choices below are a snapshot; write mode recalculates each choice in a transaction, so review fresh output again before applying.

## Proposed assignments

```text
Active events requiring backfill: 139
seed-req-a1-planning: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-technical-staff"}
seed-req-a1-confirmed: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
seed-req-a1-confirmed-past: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
seed-req-b1-planning: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-technical-staff"}
QVaAz9wJlwx5fx00dp9c: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-venue-technical-staff"} — venue_staff: conflicting historical reviewers; newest eligible request wins
seed-vsu-event-01-basic-suitability: {"venue_staff":"seed-venue-staff","technical_staff":"seed-venue-technical-staff"} — venue_staff: no eligible historical assignee; use current workload; technical_staff: no eligible historical assignee; use current workload
seed-vsu-event-02-capacity-boundary: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-venue-technical-staff"} — venue_staff: no eligible historical assignee; use current workload; technical_staff: no eligible historical assignee; use current workload
seed-vsu-event-03-missing-facility: {"venue_staff":"seed-venue-staff","technical_staff":"seed-venue-technical-staff"} — venue_staff: no eligible historical assignee; use current workload; technical_staff: no eligible historical assignee; use current workload
seed-vsu-event-04-preference-warnings: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-technical-staff"} — venue_staff: no eligible historical assignee; use current workload; technical_staff: no eligible historical assignee; use current workload
seed-vsu-event-05-operating-hours: {"venue_staff":"seed-venue-staff","technical_staff":"seed-venue-technical-staff"} — venue_staff: no eligible historical assignee; use current workload; technical_staff: no eligible historical assignee; use current workload
seed-s3-event-conflict-booked-event: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-venue-technical-staff"}
seed-s3-event-conflict-held-event: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-venue-technical-staff"}
seed-s3-event-eqr-01: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-technical-staff"}
seed-s3-event-eqr-02: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"} — venue_staff: no eligible historical assignee; use current workload
seed-s3-event-replacement-conflict-event: {"venue_staff":"seed-venue-staff","technical_staff":"seed-venue-technical-staff"} — venue_staff: no eligible historical assignee; use current workload; technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vbr-01: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-venue-technical-staff"}
seed-s3-event-vbr-02: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-venue-technical-staff"}
seed-s3-event-vbr-03: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"} — venue_staff: no eligible historical assignee; use current workload; technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vbr-04: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"} — technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vbr-05: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"} — technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vbr-06-cancel-reuse: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-venue-technical-staff"} — venue_staff: no eligible historical assignee; use current workload; technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vbr-06-reject: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"} — technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vbr-06-reject-reuse: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-venue-technical-staff"} — venue_staff: no eligible historical assignee; use current workload; technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vcf-01: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"} — venue_staff: no eligible historical assignee; use current workload; technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vpq-01-closed: {"venue_staff":"seed-venue-staff","technical_staff":"seed-venue-technical-staff"} — technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vpq-01-newer: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"} — technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vpq-01-older: {"venue_staff":"seed-venue-staff","technical_staff":"seed-venue-technical-staff"} — technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vpq-02-other-staff: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-venue-technical-staff"}
seed-s3-event-vpq-03: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"} — technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vsu-06: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-technical-staff"} — venue_staff: no eligible historical assignee; use current workload; technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vsu-07-planning: {"venue_staff":"seed-venue-staff","technical_staff":"seed-venue-technical-staff"} — technical_staff: no eligible historical assignee; use current workload
seed-s3-event-vsu-07-unassigned: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-technical-staff"} — venue_staff: no eligible historical assignee; use current workload; technical_staff: no eligible historical assignee; use current workload
sVh1PVHZVrqVsm1ChR91: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-venue-technical-staff"} — venue_staff: conflicting historical reviewers; newest eligible request wins
9lke7ZvsP9myOfpcu1Qi: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-venue-technical-staff"}
manual-s3-20261019-a-tc-eap-01-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eap-02-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eap-03-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eap-03-event-10: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eap-03-event-19: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eap-04-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eav-01-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eav-02-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eav-03-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eav-04-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eav-05-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eav-06-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eav-06-event-15: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eav-07-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eav-07-event-11: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eav-07-event-8: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-eav-08-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-erj-01-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-erj-02-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-erj-03-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-erj-04-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-01-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-01-event-16: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-02-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-02-event-16: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-02-event-19: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-02-event-22: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-03-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-03-event-16: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-04-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-04-event-16: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-04-event-19: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-04-event-34: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-04-event-37: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-04-event-52: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-05-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ero-05-event-16: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ers-01-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ers-02-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ers-02-event-13: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ers-02-event-16: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ers-03-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ers-03-event-10: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ers-04-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ers-05-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ers-05-event-15: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ers-06-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-ers-06-event-15: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vap-01-event-1: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vap-02-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vap-02-event-11: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vap-02-event-6: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vap-03-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vap-04-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vap-05-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vap-05-event-11: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vap-05-event-16: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vap-05-event-6: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vap-06-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vap-06-event-6: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vhx-01-event-1: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vhx-02-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vhx-03-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vhx-04-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vhx-05-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vrj-01-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vrj-02-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vrj-03-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vrj-04-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vsr-07-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vsr-08-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vsr-09-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261019-a-tc-vsr-09-event-6: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261021-ui-tc-vhx-02-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-s3-20261021-ui-tc-vhx-04-event-1: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-back-to-back: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-multi-venue: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-race-A: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-race-B: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-release-cancel: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-release-reject: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-separate-suitability: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-setup-clash: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-setup-neighbour: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-turnaround-clash: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-turnaround-neighbour: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-b-back-to-back: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-b-multi-venue: {"venue_staff":"seed-venue-technical-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-b-race-A: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-b-race-B: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-b-release-cancel: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-b-release-reject: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-b-separate-suitability: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-b-setup-clash: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-b-setup-neighbour: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-b-turnaround-clash: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-20261023-b-turnaround-neighbour: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-1792743359255-back-to-back: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-1792743359255-race-A: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-1792743359255-race-B: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-1792743359255-separate-suitability: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-1792743359255-setup-clash: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-1792743359255-setup-neighbour: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-1792743359255-turnaround-clash: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
manual-remaining-1792743359255-turnaround-neighbour: {"venue_staff":"seed-venue-staff","technical_staff":"seed-technical-staff"}
```

Write mode and manual sample verification have **not** been run. Review the two conflicts and the fallback choices before applying the migration.
