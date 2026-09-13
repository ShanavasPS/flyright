# App icon notifications

The home-screen icon shows one attention indicator whenever People has unseen activity, a support reply is unread, or a newer store version is available. People retains its detailed count inside the app. Reading activity clears that source; opening Settings does not clear an available update. Launching the updated binary clears the update source.

iOS uses the system badge API and requires Badges permission. Settings shows a link to system settings when notifications are allowed but badges are disabled. Android uses quiet, active notifications because Pixel and other launchers derive their dots from notifications. The app removes only its own consumed attention notifications and OneSignal groups, preserving flight alerts and live flight notifications. Android launchers and system notification settings still control whether a dot is displayed.

The last confirmed store release survives restarts and temporary lookup failures. Loading auth or store data is treated as unknown, so it cannot erase a badge that arrived while the app was closed. Badge writes are serialized and retried on notification-permission changes and app-state changes.

## Background delivery

`convex/appUpdates.ts` checks the existing `/api/app-version` endpoint every 15 minutes, independently for iOS and Android. It announces only the version confirmed by the corresponding public store listing. The endpoint's caches may add to that delay; delivery also depends on the OS and OneSignal subscription.

Each announcement targets opted-in native subscriptions whose OneSignal `app_version` is older than the released version, including anonymous installations. A quiet iOS notification sets the indicator to 1; Android receives a notification in the update group. The link opens Settings, which older binaries support. These announcements contain public release information. Private People and support pushes continue to use secret recipient aliases.

The announcement row stores a OneSignal idempotency key before sending. Overlapping runs are held for five minutes, failures retry at the next check using the same key, and completed announcements never repeat. A valid response with no matching subscribers completes the announcement too. Retries stop before OneSignal's 30-day deduplication window expires. No request keys, credentials, or private notification payloads are logged.

## Rollout

1. Deploy the Convex functions and schema. Leave `APP_UPDATE_PUSH_ENABLED` unset on development deployments.
2. Release updated iOS and Android binaries using the full `AGENTS.md` release workflow. This also ships the pending private push-registration change from the September 12 security deployment. Existing store binaries cannot acquire that change through hosting or a JavaScript reload.
3. Set `APP_UPDATE_PUSH_ENABLED=true` on the production Convex deployment to enable release announcements. The existing `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY` are reused. **Enabling this sends an announcement for the currently available release to eligible subscribers on the next check**, then once for each later release on each platform.
4. Verify with controlled devices: grant notifications and badges; receive a People request while the app is closed; read it and check the indicator clears when no update remains; open Settings with an available update and check the indicator remains; open the updated binary and check the update notification clears. On Android, verify a live flight notification remains after reading People.

Regression tests cover local badge writes, loading and permission transitions, Android source-specific dismissal, persisted release information, platform/version targeting, announcement deduplication, and failed delivery retries. They stub native APIs and outbound delivery; they do not replace physical-device acceptance checks.
