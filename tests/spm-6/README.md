# SPM-6 Test Map

SPM-6 covers adding a venue to the catalogue.

## Unit

- `unit/venue.test.js`
  - Validates the shared venue model.
  - Covers required fields, positive capacity, multi-value facilities/accessibility/layout fields,
    operating hours, value normalisation, and server-owned audit metadata.

## Integration

- `integration/venueService.test.js`
  - Exercises the backend service with the in-memory Firestore double.
  - Covers successful persistence, validation failure with no write, and missing authenticated staff identity.
- `integration/venueRoutes.test.js`
  - Exercises the real Express route and middleware over HTTP with mocked token/profile loading.
  - Covers Venue Staff success, invalid request body, non-Venue Staff denial, and missing-token denial.

## Commands

```bash
npm run test:spm6
```

The broader CI coverage command also includes these tests:

```bash
npm run test:coverage
```
