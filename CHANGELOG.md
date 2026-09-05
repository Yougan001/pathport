# Changelog

## 0.1.0 — 2026-09-05

First public release.

- Checks entire relative path trees for Windows naming hazards, case/NFC collisions and conservative length budgets.
- Allocates deterministic destination names without changing originals.
- Accepts pasted paths or a browser-selected folder.
- Exports a JSON manifest, or a byte-preserving ZIP copy when real files are selected.
- Includes bounded/cancellable archive creation, 20 automated tests and real browser screenshots.

Copies do not preserve permissions, timestamps, empty directories or symbolic links. File contents and relative references are not rewritten. Compatibility with every filesystem, sync service or extraction tool is not guaranteed.
