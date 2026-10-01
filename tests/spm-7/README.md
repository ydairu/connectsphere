# SPM-7 Test Map

SPM-7 covers creating an event request without submitting it.

## Unit

- `unit/eventRequest.test.js`
  - Exercises shared draft creation and update input rules.
  - Covers initial `Draft` status, organiser ownership, field normalisation, optional information, format validation, and protected-field stripping.

## Integration

- `integration/eventRequestService.test.js`
  - Exercises the backend create-draft service with the in-memory Firestore double.
  - Covers valid draft persistence, server-owned metadata, and validation failure with no write.

## Commands

```bash
npm run test:spm7
```
