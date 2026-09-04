import type { Report } from '@/core/paths.mjs';

type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type Context = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};

export function registerPathTools(actions: {
  apply: (paths: string, rootLength: number) => Report;
  read: () => Report | null;
}) {
  const context = (document as Document & { modelContext?: Context })
    .modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const tools: Tool[] = [
    {
      name: 'inspect_delivery_paths',
      description:
        'Replace the pasted path list and display a portable delivery plan. Clears any selected folder; does not download, upload or rename files.',
      inputSchema: {
        type: 'object',
        properties: {
          paths: { type: 'string', maxLength: 2000000 },
          rootLength: { type: 'integer', minimum: 0, maximum: 200 },
        },
        required: ['paths'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input !== 'object')
          throw new Error('Expected a paths string.');
        const values = input as Record<string, unknown>;
        if (
          typeof values.paths !== 'string' ||
          Object.keys(values).some(
            (key) => key !== 'paths' && key !== 'rootLength',
          ) ||
          (values.rootLength !== undefined &&
            typeof values.rootLength !== 'number')
        )
          throw new Error('Expected paths and an optional numeric rootLength.');
        return actions.apply(
          values.paths,
          (values.rootLength as number | undefined) ?? 40,
        ).summary;
      },
    },
    {
      name: 'read_delivery_summary',
      description:
        'Read the currently displayed file delivery summary. Does not return file contents.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute() {
        return actions.read()?.summary ?? { ready: false };
      },
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  }
  return () => lifecycle.abort();
}
