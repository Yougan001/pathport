# Testing notes

## Automated coverage

`npm test` runs 20 tests: 16 path-planning cases and 4 archive cases. The suite checks:

- Reserved Windows names, control/formatting characters, trailing spaces and Unicode normalization.
- Case collisions in both files and directory names, file/directory conflicts, and existing suffixes.
- Byte-bounded names, root-prefix accounting, traversal rejection and input limits.
- Deterministic output regardless of input order; 1,500 colliding sibling names remain distinct.
- ZIP extraction reproduces every original byte, including binary and empty files.
- Unavailable content, oversized inputs, read failures and cancellation never return a partial archive.

Run `npm run typecheck` and `npm run lint` for application code. Vendored `components/ui` is excluded from lint; its primitives are composed at call sites, not modified. Generated components that the app does not use are not shipped.

## Browser checks

- Initial nine-path example yields five renamed destinations, including a directory-level collision.
- Four synthetic `File` objects were supplied to the real folder-input change handler. The ZIP was downloaded through the actual export button, then checked with `node scripts/verify-download.mjs`: four original contents, four distinct mapped paths, one manifest.
- The native operating-system folder dialog has not been automated. Browser file-injection attempts did not provide a selection. The synthetic fixture check is not claimed as a native-dialog test.
- Desktop layout was inspected at 1440px; no horizontal document overflow.
- At a real 390px viewport the document width stays 390px. The narrow layout stacks the editor and report.
- A 65-path list spans three pages; page three shows the final five files, starting with file-60.txt.
- Editing the input clears the old report. A traversal path displays an error with zero old result rows.

## Boundaries

These are functional tests, not filesystem certification or a performance benchmark. No actual Windows/macOS/Linux extraction matrix has been completed. The planned names use conservative rules and cannot promise compatibility with every application or ZIP utility.

The production release gate is the Linux GitHub Actions build. The first browser-stage build caught a missing local-only hosting manifest in the clean checkout; Vite now loads that optional hosting integration only when the manifest exists. GitHub Pages needs no private local configuration.

On this Windows environment the native build exits nonzero during client output, without a complete static export; that is a failed command, not a passing build.
