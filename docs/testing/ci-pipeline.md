# CI pipeline

The [CI workflow](../../.github/workflows/ci.yml) runs on every push and on pull requests targeting `main`. It has three independent jobs with no `needs` dependencies, so GitHub Actions can run them at the same time on separate Ubuntu runners. Each job checks out the repository, uses Node.js 22, runs `npm ci`, and sets `CI=true`. A newer run for the same Git ref cancels the older run.

| Job | Checks, in order within that job | Additional setup | Uploaded artifacts |
|---|---|---|---|
| `code_checks` | `npm run lint`, `npm run test:existing`, `npm run test:coverage`, `npm run build` | None | `coverage` from the root Vitest suite |
| `firestore_emulator` | SPM-14, SPM-54, SPM-58, SPM-78, SPM-79, SPM-81, SPM-90 transaction suites | Java 21; pinned `firebase-tools@15.34.0`; local Firestore emulator | `booking-emulator-results` (SPM-14 JSON), `equipment-reservation-emulator-results` (SPM-58 JSON) |
| `e2e` | `npm run test:e2e` | Cached Playwright Chromium and browser dependencies | `playwright-report`, including the HTML report and `test-results` |

The emulator suites run one after another in their job. Each command starts and stops its own local emulator on port 8085 with a `demo-connectsphere-*` project ID. SPM-54 uses `tests/spm-54/firebase.emulator.json`; the other six use `firebase.spm14.json`. The [package scripts](../../package.json) name each suite as `test:spm<story>:emulator`. Only SPM-14 and SPM-58 currently produce JSON result files; the other suites report in the job log.

The [Playwright configuration](../../playwright.config.js) uses one worker because its tests reset a shared in-memory Firebase double before each test. The separate CI runner lets the browser job run alongside the other jobs without sharing that double. The code-check job includes the shared/backend Node tests, frontend co-located tests, and all root Vitest unit and in-memory integration tests with coverage.

## Running and reading CI

Commit and push to any branch to start CI. A pull request into `main` also starts it. Open **Actions → CI** in GitHub and check all three job results; the workflow passes only when every job passes. Open a failed job to find the failing step, then download its artifacts if a report was produced. Artifact uploads use `always()`, so available reports are retained even when an earlier check fails. If branch protection required the former single job name, replace it with the three current job names.

If dependency installation is slow, open that job's **Install dependencies** log. It prints whether `setup-node` restored the npm package cache and includes `npm ci --timing` phase durations. The cache holds downloaded npm packages, not `node_modules`, so even a cache hit still runs a clean install in each job. Compare the install phases across jobs before changing emulator startup or dependency caching.

For a local equivalent of the code and browser jobs, run the four `code_checks` commands above, then `npm run test:e2e` after installing Chromium with `npx playwright install chromium`. Emulator checks require Java and the pinned Firebase CLI; run each `test:spm<story>:emulator` script inside `firebase emulators:exec` with the corresponding config and demo project shown in the [workflow](../../.github/workflows/ci.yml). Do not start two emulator suites at once on port 8085.

The code-check API tests use mocked identity and in-memory persistence; E2E uses the local Firebase double. The emulator job verifies Firestore transactions against a local emulator. No CI job contacts a deployed Firebase project or runs the opt-in `test:api:live` harness, and the emulator transaction tests do not verify deployed Firestore rules. A local passing run does not establish that the GitHub jobs overlapped or that GitHub uploaded the artifacts; use an actual Actions run for that evidence.
