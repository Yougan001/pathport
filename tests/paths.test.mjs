import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectPaths,
  parseManifest,
  portableKey,
  LIMITS,
  manifestJSON,
} from '../core/paths.mjs';

const targets = (paths, options) =>
  inspectPaths(paths, options).entries.map((entry) => entry.target);

test('ordinary trees keep their names, extensions and input order', () => {
  const input = ['docs/guide.md', '.config', 'images/你好.jpg'];
  const report = inspectPaths(input);
  assert.deepEqual(
    report.entries.map((entry) => entry.target),
    input,
  );
  assert.equal(report.summary.affected, 0);
  assert.equal(report.summary.directories, 2);
});

test('reserved Windows device names include extensions and superscript digits', () => {
  assert.deepEqual(
    targets(['CON.pdf', 'com¹.txt', 'LPT²', 'aux', 'COM0.txt', 'COM10.txt']),
    ['_CON.pdf', '_com¹.txt', '_LPT²', '_aux', 'COM0.txt', 'COM10.txt'],
  );
});

test('literal backslashes, invalid characters, trailing spaces and bidi controls are repaired', () => {
  assert.deepEqual(
    targets([
      'my\\file?.txt',
      'report. ',
      'invisible\u202eexe.txt',
      'emoji🙂.txt',
    ]),
    ['my_file_.txt', 'report', 'invisible_exe.txt', 'emoji🙂.txt'],
  );
});

test('directory case collisions do not merge their children', () => {
  const report = inspectPaths([
    'Docs/one.txt',
    'docs/two.txt',
    'docs/three.txt',
  ]);
  assert.deepEqual(
    report.entries.map((entry) => entry.target),
    ['Docs/one.txt', 'docs~2/two.txt', 'docs~2/three.txt'],
  );
  assert.equal(report.counts['name-collision'], 3);
});

test('Unicode normalization conflicts are reported and resolved', () => {
  const report = inspectPaths(['photos/café.jpg', 'photos/cafe\u0301.jpg']);
  assert.deepEqual(
    report.entries.map((entry) => entry.target),
    ['photos/café.jpg', 'photos/café~2.jpg'],
  );
  assert.equal(report.counts['unicode-normalization'], 1);
});

test('allocation preserves an existing suffixed name', () => {
  assert.deepEqual(targets(['Logo.svg', 'logo.svg', 'logo~2.svg']), [
    'Logo.svg',
    'logo~3.svg',
    'logo~2.svg',
  ]);
});

test('repair collisions and prototype-shaped names cannot overwrite files', () => {
  assert.deepEqual(
    targets([
      'CON.txt',
      '_CON.txt',
      '__proto__',
      'constructor',
      'a?.txt',
      'a*.txt',
    ]),
    [
      '_CON~2.txt',
      '_CON.txt',
      '__proto__',
      'constructor',
      'a_~2.txt',
      'a_.txt',
    ],
  );
});

test('a file and a same-named directory get separate destination names', () => {
  const report = inspectPaths(['folder', 'folder/child.txt']);
  assert.deepEqual(
    report.entries.map((entry) => entry.target),
    ['folder~2', 'folder/child.txt'],
  );
  assert.equal(report.counts['file-directory-collision'], 2);
});

test('manifest lines preserve meaningful whitespace and reject ambiguous duplicate paths', () => {
  assert.deepEqual(parseManifest('\uFEFF a.txt\r\nb.txt \r\n\n'), [
    ' a.txt',
    'b.txt ',
  ]);
  assert.throws(() => inspectPaths(['a', 'a']), /duplicate/);
  assert.throws(() => inspectPaths(parseManifest('')), /between 1/);
});

test('absolute paths and traversal segments never reach a portable plan', () => {
  for (const path of [
    '/a',
    '\\server\\share',
    'C:/a',
    '../a',
    'a/../b',
    './a',
    'a//b',
    'a/',
  ])
    assert.throws(() => inspectPaths([path]), /absolute|segments/);
});

test('byte-budget shortening preserves extensions and full Unicode code points', () => {
  const [name] = targets(['好'.repeat(100) + '.jpeg']);
  assert.ok(new TextEncoder().encode(name).length <= 120);
  assert.ok(name.endsWith('.jpeg'));
  assert.ok(!name.includes('\ufffd'));
});

test('destination root and the files wrapper count toward the path budget', () => {
  const path = 'a'.repeat(110) + '/' + 'b'.repeat(100) + '.txt';
  const report = inspectPaths([path]);
  assert.equal(report.entries[0].destinationLength, 40 + 6 + path.length);
  assert.equal(report.summary.blocked, 1);
  assert.equal(inspectPaths([path], { rootLength: 0 }).summary.blocked, 0);
  for (const rootLength of [-1, 201, NaN, 1.5, '40'])
    assert.throws(() => inspectPaths(['a'], { rootLength }), /root length/);
});

test('work is bounded by files, tree depth, nodes, path length and input size', () => {
  assert.throws(
    () => inspectPaths(Array(LIMITS.files + 1).fill('a')),
    /between/,
  );
  assert.throws(() => inspectPaths(['a/'.repeat(32) + 'file']), /levels/);
  assert.throws(() => inspectPaths(['a'.repeat(4097)]), /4096/);
  assert.throws(
    () => parseManifest('a'.repeat(LIMITS.inputChars + 1)),
    /2 million/,
  );
  assert.throws(
    () =>
      inspectPaths(
        Array.from(
          { length: 1000 },
          (_, n) =>
            Array.from({ length: 31 }, (_, d) => `${n}-${d}`).join('/') + '/f',
        ),
      ),
    /entries/,
  );
});

test('plan is independent of input ordering and safe when inspected again', () => {
  const paths = [
    'A/z.txt',
    'a/y.txt',
    'NUL.x',
    '_NUL.x',
    'a?/a*.txt',
    'a*/a?.txt',
    'Straße',
    'STRASSE',
    '🙂'.repeat(80) + '.png',
  ];
  const mapping = (items) =>
    Object.fromEntries(
      inspectPaths(items).entries.map((entry) => [
        entry.original,
        entry.target,
      ]),
    );
  assert.deepEqual(mapping(paths), mapping([...paths].reverse()));
  const repaired = targets(paths);
  assert.equal(new Set(repaired.map(portableKey)).size, paths.length);
  const second = inspectPaths(repaired);
  assert.equal(second.summary.changed, 0);
  assert.equal(second.summary.affected, 0);
});

test('many sibling collisions have distinct, bounded, stable targets', () => {
  const paths = Array.from(
    { length: 1500 },
    (_, n) =>
      'abcdefghijk'
        .split('')
        .map((letter, bit) => (n & (1 << bit) ? letter.toUpperCase() : letter))
        .join('') + '.txt',
  );
  const report = inspectPaths(paths);
  assert.equal(
    new Set(report.entries.map((entry) => portableKey(entry.target))).size,
    1500,
  );
  assert.equal(report.summary.blocked, 0);
});

test('JSON manifest preserves exact originals including controls as escaped data', () => {
  const report = inspectPaths(['x\ny.txt', 'x\ty.txt']);
  const json = manifestJSON(report);
  assert.deepEqual(JSON.parse(json).entries, report.entries);
  assert.equal(JSON.parse(json).format, 'pathport-manifest');
});
