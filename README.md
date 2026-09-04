# Pathport

Check a whole folder's names before sending it to another operating system.

`Docs/guide.md` and `docs/notes.md` are separate folders on some systems and the same folder on others. Pathport checks the tree, not just the last filename, then builds a deterministic original → destination map. It never renames the source files.

## Current stage

The portable path engine is available now. A browser interface and portable-copy ZIP export are in development; they are not part of this first source release.

```js
import { inspectPaths } from './core/paths.mjs';

const report = inspectPaths([
  'Brand/Logo.svg',
  'Brand/logo.svg',
  'Invoices/CON.pdf',
]);
console.table(report.entries);
```

Run the dependency-free engine tests with Node 22 or newer:

```sh
node --test tests/*.test.mjs
```

## Checks and limits

- Windows reserved names, invalid characters, trailing dots/spaces.
- Case and NFC Unicode collisions, including directory names and file/directory conflicts.
- Invisible formatting characters, conservative 120-byte segments and 240-unit destination paths.
- Suffixes that avoid both existing source names and other planned destinations.

Use forward slashes for relative paths. Absolute paths, traversal segments, duplicate source paths and oversized input are rejected. The engine accepts up to 10,000 files, 32 path levels and 30,000 tree entries. A literal backslash inside a name is treated as a Windows-invalid character, not a path separator.

Case comparison uses NFC plus JavaScript uppercase. It is intentionally conservative, not an implementation of every filesystem's Unicode table. The 240-unit destination budget includes a configurable root prefix and the future archive's `files/` directory. Over-budget plans remain blocked; they are not silently flattened.

Renaming can break relative links, imports or project references. Pathport does not rewrite file contents and cannot certify compatibility with a particular application, filesystem, sync service or legacy ZIP reader.

Rules are grounded in [Microsoft's naming documentation](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file). The stricter delivery budgets are project choices, not Windows limits.

MIT licensed.
