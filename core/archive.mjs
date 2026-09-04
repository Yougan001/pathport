import { Zip, ZipPassThrough, strToU8 } from 'fflate';
import { inspectPaths, manifestJSON } from './paths.mjs';

export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const CHUNK_BYTES = 256 * 1024;

export async function portableArchive(sources, options = {}, control = {}) {
  if (!Array.isArray(sources))
    throw new Error('Choose a folder before exporting a copy.');
  const report = inspectPaths(
    sources.map((source) => source?.path),
    options,
  );
  if (report.summary.blocked)
    throw new Error('Shorten the over-budget paths before exporting.');
  let totalBytes = 0;
  for (const source of sources) {
    if (!(source.blob instanceof Blob))
      throw new Error(
        'A selected file is no longer available. Choose the folder again.',
      );
    totalBytes += source.blob.size;
    if (totalBytes > MAX_ARCHIVE_BYTES)
      throw new Error(
        'Portable copies are limited to 100 MiB of selected file contents.',
      );
  }
  const checkAbort = () => {
    if (control.signal?.aborted)
      throw new DOMException(
        'Copy canceled. Original files are unchanged.',
        'AbortError',
      );
  };
  checkAbort();
  const chunks = [];
  let failure,
    completed = false,
    outputBytes = 0,
    readBytes = 0;
  const zip = new Zip((error, data, final) => {
    if (error) {
      failure = error;
      return;
    }
    outputBytes += data.byteLength;
    if (outputBytes > MAX_ARCHIVE_BYTES + 24 * 1024 * 1024) {
      failure = new Error('The archive exceeds the output size limit.');
      return;
    }
    chunks.push(data);
    completed = final;
  });
  const addEntry = (name) => {
    const entry = new ZipPassThrough(name);
    entry.mtime = new Date(1980, 0, 1);
    zip.add(entry);
    return entry;
  };

  for (const entry of report.entries) {
    checkAbort();
    const file = sources[entry.index].blob;
    const output = addEntry('files/' + entry.target);
    if (file.size === 0) output.push(new Uint8Array(), true);
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
      const data = new Uint8Array(
        await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer(),
      );
      checkAbort();
      const expected = Math.min(CHUNK_BYTES, file.size - offset);
      if (data.byteLength !== expected)
        throw new Error('A selected file could not be read completely.');
      output.push(data, offset + data.length === file.size);
      readBytes += data.length;
      if (failure) throw failure;
    }
    control.onProgress?.({
      files: entry.index + 1,
      totalFiles: sources.length,
      bytes: readBytes,
      totalBytes,
    });
    if (entry.index % 32 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  checkAbort();
  addEntry('pathport-manifest.json').push(strToU8(manifestJSON(report)), true);
  zip.end();
  if (failure) throw failure;
  if (!completed)
    throw new Error(
      'The ZIP could not be completed. No partial download was created.',
    );
  return { blob: new Blob(chunks, { type: 'application/zip' }), report };
}
