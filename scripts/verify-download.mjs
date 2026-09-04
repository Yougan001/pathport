import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';

const archive = unzipSync(
  new Uint8Array(
    await readFile(
      new URL('../work/downloads/pathport-copy.zip', import.meta.url),
    ),
  ),
);
const expected = {
  'files/Pack/Docs/a.txt': 'alpha',
  'files/Pack/docs~2/b.txt': 'beta',
  'files/Pack/_CON.txt': 'reserved',
  'files/Pack/empty.txt': '',
};
for (const [path, content] of Object.entries(expected))
  assert.equal(strFromU8(archive[path]), content);
assert.equal(Object.keys(archive).length, 5);
const manifest = JSON.parse(strFromU8(archive['pathport-manifest.json']));
assert.equal(manifest.summary.files, 4);
assert.equal(manifest.summary.changed, 2);
console.log(
  'Browser download verified: 4 original file contents, 4 mapped paths, one manifest.',
);
