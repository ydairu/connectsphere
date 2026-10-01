# SPM-3 Test Map

SPM-3 covers submitting an event request.

## Unit

- `unit/eventRequestSubmission.test.js`
  - Exercises shared submission validation.
  - Covers all mandatory submission fields, complete submissions, and format errors that must be preserved.

## Integration

- `integration/eventRequestService.test.js`
  - Exercises the backend submit service with the in-memory Firestore double.
  - Covers successful `Draft` to `Submitted` transition, missing mandatory fields, owner-only submit, and non-draft rejection.

## Commands

```bash
npm run test:spm3
```
