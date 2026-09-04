export const LIMITS: Readonly<{ files: number; nodes: number; depth: number; inputChars: number; pathChars: number; segmentBytes: number; destinationChars: number }>;
export type Entry = { index: number; original: string; target: string; changed: boolean; reasons: string[]; blocked: boolean; destinationLength: number };
export type Report = { options: { rootLength: number }; entries: Entry[]; issues: { code: string; path: string; detail: string }[]; counts: Record<string, number>; summary: { files: number; directories: number; changed: number; affected: number; blocked: number } };
export function portableKey(name: string): string;
export function parseManifest(text: string): string[];
export function inspectPaths(paths: string[], options?: { rootLength?: number }): Report;
export function manifestJSON(report: Report): string;
