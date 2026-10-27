# SPM-90 manual acceptance checklist

Use an event in Planning with two approved venue bookings, an assigned Coordinator, its owning Organiser, and an Attendee account. Record the event ID and booking IDs before starting. Use a separate single-venue event for the automatic-selection check.

- [ ] As the assigned Coordinator, open Venue Details. Both current bookings appear and each can be chosen as primary.
- [ ] Before choosing, attempt Confirm. It is refused with a primary-venue message and the event stays in Planning.
- [ ] Set one booking as primary. Exactly one current booking has the Primary venue badge. Confirm the event.
- [ ] As an Attendee, check the event list and detail page. Both show the primary venue name and physical location; the other booking is absent. Direct access to venue bookings and change history is refused.
- [ ] As the owning Organiser, check Venue Details. All associated bookings remain visible, with the primary one identified.
- [ ] As the assigned Coordinator, switch to the other approved booking. The event stays Confirmed. The Attendee location changes.
- [ ] As the Coordinator and owning Organiser, open Change Log. The initial choice and switch show the previous and new venue, actor, and time.
- [ ] Cancel a non-primary booking. The primary remains selected; the other booking and its reservation are unchanged.
- [ ] Cancel the primary booking on another Confirmed event. The event returns to Planning, the selection clears, and the clearing appears in Change Log. After its replacement is approved, Confirm is still blocked until the Coordinator explicitly chooses a primary venue.
- [ ] Try selecting a pending, cancelled, replaced, or unrelated booking through the API. Each is refused without a write.
- [ ] Try the selection API as an unassigned Coordinator and a non-Coordinator. Both are refused.
- [ ] Confirm a separate event with just one approved booking. It becomes primary automatically, and Change Log identifies the system change.
- [ ] Send two selections using the same expected previous booking ID. One succeeds and the stale attempt returns 409.

Record the account, event IDs, date, result, and any screenshots or defects beside this checklist. The automated API tests use mocked identity and in-memory persistence; browser tests use the local Firebase double. They do not establish live Firebase behavior.
