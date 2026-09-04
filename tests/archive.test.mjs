import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { portableArchive } from '../core/archive.mjs';

test('a portable ZIP preserves every file byte and maps directory collisions', async () => {
  const binary = Uint8Array.from({ length: 700_000 }, (_, i) => i % 256);
  const sources = [
    { path: 'Docs/logo.bin', blob: new Blob([binary]) },
    { path: 'docs/readme.txt', blob: new Blob(['second folder']) },
    { path: 'CON.txt', blob: new Blob(['reserved']) },
    { path: 'empty', blob: new Blob([]) },
    { path: 'pathport-manifest.json', blob: new Blob(['user-owned']) },
    { path: '__proto__', blob: new Blob(['ordinary name']) },
  ];
  const progress = [];
  const { blob, report } = await portableArchive(
    sources,
    {},
    { onProgress: (value) => progress.push(value.files) },
  );
  const unpacked = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.equal(Object.keys(unpacked).length, sources.length + 1);
  for (const entry of report.entries)
    assert.deepEqual(
      unpacked['files/' + entry.target],
      new Uint8Array(await sources[entry.index].blob.arrayBuffer()),
    );
  assert.deepEqual(
    JSON.parse(strFromU8(unpacked['pathport-manifest.json'])).entries,
    report.entries,
  );
  assert.deepEqual(progress, [1, 2, 3, 4, 5, 6]);
});

test('ZIP export refuses missing content, unresolved paths and oversized selections', async () => {
  await assert.rejects(portableArchive([{ path: 'a' }]), /no longer available/);
  await assert.rejects(
    portableArchive([
      { path: 'a'.repeat(120) + '/' + 'b'.repeat(120), blob: new Blob([]) },
    ]),
    /over-budget/,
  );
  class OversizedBlob extends Blob {
    get size() {
      return 101 * 1024 * 1024;
    }
  }
  await assert.rejects(
    portableArchive([{ path: 'large', blob: new OversizedBlob() }]),
    /100 MiB/,
  );
});

test('cancel before or between reads does not return a partial archive', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    portableArchive(
      [{ path: 'a', blob: new Blob(['a']) }],
      {},
      { signal: controller.signal },
    ),
    { name: 'AbortError' },
  );
  const during = new AbortController();
  await assert.rejects(
    portableArchive(
      [
        { path: 'a', blob: new Blob(['a']) },
        { path: 'b', blob: new Blob(['b']) },
      ],
      {},
      { signal: during.signal, onProgress: () => during.abort() },
    ),
    { name: 'AbortError' },
  );
});

test('read failures are surfaced rather than producing incomplete ZIP files', async () => {
  class UnreadableBlob extends Blob {
    slice() {
      return { arrayBuffer: () => Promise.reject(new Error('File moved')) };
    }
  }
  await assert.rejects(
    portableArchive([{ path: 'a', blob: new UnreadableBlob(['a']) }]),
    /File moved/,
  );
});
