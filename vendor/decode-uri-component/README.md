Expo Router 57 depends on query-string 7, whose CommonJS `require` expects a
callable decoder. Upstream decode-uri-component 0.5 is ESM. This small MIT
backport uses the fixed bounded UTF-8 scanner with a CommonJS entry point,
and replaces percent sequences as it scans (no recursion or repeated
whole-input replacements). The root npm override covers all consumers.

Source: https://github.com/SamVerschueren/decode-uri-component/tree/v0.5.0
Remove this package once Expo ships a compatible fixed dependency path.
Run `npm run test:security` for decoder and actual query-string regressions.
