# SPM-89 manual acceptance checklist

Use an event with two current approved venue bookings, an assigned Coordinator, the booking assignees, an assigned Technical Support Staff member, its owning Organiser, and an Attendee. Record the environment, date, account and event/booking IDs for each result. Obtain safety approval and enter Preparation through the normal actions.

- [ ] Each approved booking shows its own Not Started status and empty notes. A pending, rejected, cancelled or replaced attempt is not offered for preparation editing.
- [ ] As the first booking's assigned Venue Staff member, change its status and notes. Reload both bookings; only the chosen one changes. A different Venue Staff member cannot save it by direct API call.
- [ ] Before Preparation and after the event closes, direct preparation PATCH requests are refused without a booking or history write. Invalid status, unknown fields and notes over 2,000 characters return 400 without a write.
- [ ] As the Coordinator, see both venue names and statuses. The event is Not ready while either venue or equipment is not Ready; it becomes Ready when all three are Ready. This indicator does not prevent the existing Completed action.
- [ ] Cancel or replace one booking on a separate event. The inactive booking does not make the event Ready; the new approved booking starts Not Started. Re-approval pending after a significant change also does not make it Ready.
- [ ] As the Organiser and Attendee, inspect event details, booking responses and history. No venue or equipment preparation values or notes are returned. A direct preparation PATCH is refused.
- [ ] As the Coordinator, open Change Log. Each changed preparation field shows old and new value, actor, time and the correct venue name. No history entry appears for an unchanged save or a refused write.
- [ ] Run `backend/scripts/backfillVenuePreparation.js` in dry-run mode against the intended project, review the one-venue candidates and multi-venue manual cases, then separately approve write mode before executing it. Re-running must not overwrite a booking value.

Record failures and evidence locations. Do not mark SPM-89 Done until the team completes human acceptance, peer review and the applicable Definition of Done checks. The automated local tests do not establish deployed Firebase behavior.
