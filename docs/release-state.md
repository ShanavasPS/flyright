# FlyRight release state

Shared release log for Codex and Claude. Read before a release and prepend dated observations afterwards. Query EAS and both stores before acting; this file records observations, not automatically refreshed status. Follow [release-workflow.md](release-workflow.md).

## 2026-09-14 — memory migration and repository observation

No store or EAS queries were made during this documentation migration. The current repository is already ahead of the latest release recorded in Claude's private memory:

| Source | Observed value |
| --- | --- |
| `app.json` and `package.json` | Version `1.0.34` |
| `app.json` native numbers | iOS `49`, Android `48` |
| Latest local commit | `7262b75` — Bump to 1.0.34 with release notes, 2026-09-14 |
| EAS builds/uploads, store submission, hosting and local installations for 1.0.34 | Unverified in this session; inspect live state before resuming or starting another release |

Do not infer a new version or current EAS counter from the historical entry below.

## 2026-09-13 — 1.0.33 (imported historical observation)

Imported from Claude's `flyright-release-state.md` on 2026-09-14; not re-queried during migration.

| Item | Last recorded result |
| --- | --- |
| iOS | Build `46`, `WAITING_FOR_REVIEW`, automatic release after approval |
| ASC version ID | `82a336d7-8283-464d-84ac-ea694267bf96` |
| ASC review submission ID | `2054d333-caaa-4561-aa65-19c4f55fb244` |
| Android | versionCode `47`, production release `1.0.33 (47)`, completed rollout |
| Hosting | Deployment `m2z7goht7p`, served entry hash prefix `327ce825` verified |
| Reviewer notes | `store/apple/review-notes-1.0.33.txt`, PATCHed onto existing ASC detail |
| Screenshots | Carried over because the store panels had not changed; previous reshoot was 1.0.30 on 2026-09-10 |
| Local iOS app | iPhone 16 Pro simulator, `1.0.33 (46)` |
| Local Android app | Pixel_9a, `1.0.33 (47)` |
| Git | `ac1e002` version bump and `d2bd76b` reviewer notes, recorded as pushed |
| Backend | Convex production deployed, including app-update cron/table |

At that observation, iOS 1.0.32 was live, and `APP_UPDATE_PUSH_ENABLED` remained unset on production. Enabling release-announcement pushes was explicitly left to the user; a routine release request does not enable it. Verify current state before applying this historical observation.
