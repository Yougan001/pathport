import type { Report } from './paths.mjs';
export const MAX_ARCHIVE_BYTES: number;
export type Source = { path: string; blob: Blob };
export type CopyProgress = {
  files: number;
  totalFiles: number;
  bytes: number;
  totalBytes: number;
};
export function portableArchive(
  sources: Source[],
  options?: { rootLength?: number },
  control?: {
    signal?: AbortSignal;
    onProgress?: (progress: CopyProgress) => void;
  },
): Promise<{ blob: Blob; report: Report }>;
