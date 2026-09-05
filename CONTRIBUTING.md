# Contributing to Pathport

The most useful bug report is a short list of paths that produces an unexpected copy plan. English and Chinese are welcome.

## Reproduce a naming problem

Use the [path issue form](https://github.com/Yougan001/pathport/issues/new?template=path-problem.yml). Replace sensitive folder and file names while preserving the collision: letter case, trailing spaces, Unicode spelling and directory levels can all matter. Include the destination root length and the expected mapping.

For a ZIP problem, use tiny invented files and say whether the manifest, file bytes or destination paths differ from what you expected. Include the browser, operating system and extraction tool. Do not attach a real customer folder or an unreviewed manifest; original names appear in reports.

The naming budgets are conservative delivery rules, not exact emulation of every filesystem. An application rejecting a name is worth reporting, but a rule change needs a reproducible example or a primary specification.

## Change the engine or interface

Use Node.js 22.13+:

```sh
npm ci
npm test
npm run lint
npm run typecheck
```

Path allocation belongs in `core/paths.mjs`. Add cases to `tests/paths.test.mjs` for directory-level collisions as well as filenames. Results must remain deterministic when the input order changes, and newly chosen suffixes must not collide with existing names.

Archive changes belong in `core/archive.mjs` and `tests/archive.test.mjs`. Check byte-for-byte round trips, cancellation and read failures. Never return a partial ZIP as a successful copy or modify original files.

For interface changes, check both pasted paths and real folder selection, an invalid path, pagination and a narrow viewport. Say explicitly if a check used synthetic `File` objects rather than the native folder picker. See [testing notes](docs/testing.md) for current gaps.

Run `npm run build` when supported; the Linux Pages workflow is the release build gate because the documented Windows export failure is unresolved. Keep pull requests focused and include actual test results, including failures.
