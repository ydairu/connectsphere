# SPM-4 Test Map

SPM-4 covers saving and reopening an event request as a draft.

## Integration

- `integration/eventRequestService.test.js`
  - Exercises the backend draft load/update service with the in-memory Firestore double.
  - Covers owned draft reopen, retained values, owner-only access, draft-only access, protected-field stripping, and update-in-place behaviour.

## Commands

```bash
npm run test:spm4
```
