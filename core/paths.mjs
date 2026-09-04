export const LIMITS = Object.freeze({
  files: 10_000,
  nodes: 30_000,
  depth: 32,
  inputChars: 2_000_000,
  pathChars: 4096,
  segmentBytes: 120,
  destinationChars: 240,
});

const encoder = new TextEncoder();
const reserved = /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i;
// Control characters are disallowed in Windows file names.
// eslint-disable-next-line no-control-regex
const forbidden = /[<>:"\\|?*\u0000-\u001f\u007f]/u;
const invisible = /\p{Cf}/u;
const loneSurrogate = /[\uD800-\uDFFF]/u;
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const portableKey = (name) => name.normalize('NFC').toUpperCase();
const bytes = (text) => encoder.encode(text).length;

function prefixWithin(text, limit) {
  let result = '',
    length = 0;
  for (const character of text) {
    const size = bytes(character);
    if (length + size > limit) break;
    result += character;
    length += size;
  }
  return result;
}

function fitName(name, suffix = '') {
  const dot = name.lastIndexOf('.');
  const extension =
    dot > 0 && bytes(name.slice(dot)) <= 20 ? name.slice(dot) : '';
  const stem = extension ? name.slice(0, dot) : name;
  const budget = LIMITS.segmentBytes - bytes(suffix) - bytes(extension);
  const shortened = prefixWithin(stem, budget).replace(/[ .]+$/u, '') || '_';
  return shortened + suffix + extension;
}

function safeName(name) {
  let result = [...name.normalize('NFC')]
    .map((character) =>
      forbidden.test(character) ||
      invisible.test(character) ||
      loneSurrogate.test(character)
        ? '_'
        : character,
    )
    .join('');
  result = result.replace(/[ .]+$/u, '') || '_';
  if (reserved.test(result)) result = '_' + result;
  return fitName(result);
}

export function parseManifest(text) {
  if (typeof text !== 'string' || text.length > LIMITS.inputChars)
    throw new Error('Use a path list of at most 2 million characters.');
  return text
    .replace(/^\uFEFF/u, '')
    .split(/\r?\n/u)
    .filter((line) => line !== '');
}

function validatePath(path, index) {
  if (typeof path !== 'string' || !path || path.length > LIMITS.pathChars)
    throw new Error(
      `Path ${index + 1}: expected a nonempty relative path, at most ${LIMITS.pathChars} characters.`,
    );
  if (/^[\\/]|^[A-Za-z]:/u.test(path))
    throw new Error(`Path ${index + 1}: absolute paths are not accepted.`);
  const segments = path.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..'))
    throw new Error(
      `Path ${index + 1}: empty, . and .. segments are not accepted. Use / between folders.`,
    );
  if (segments.length > LIMITS.depth)
    throw new Error(
      `Path ${index + 1}: at most ${LIMITS.depth} levels are supported.`,
    );
  return segments;
}

export function inspectPaths(paths, options = {}) {
  if (!Array.isArray(paths) || !paths.length || paths.length > LIMITS.files)
    throw new Error(
      `Choose between 1 and ${LIMITS.files.toLocaleString('en-US')} files.`,
    );
  if (
    !options ||
    typeof options !== 'object' ||
    Object.keys(options).some((key) => key !== 'rootLength')
  )
    throw new Error('Expected only a rootLength option.');
  const rootLength = options.rootLength ?? 40;
  if (!Number.isInteger(rootLength) || rootLength < 0 || rootLength > 200)
    throw new Error(
      'Destination root length must be a whole number from 0 to 200.',
    );
  let inputChars = 0;
  const root = { children: new Map(), path: '', target: '', parent: null };
  const nodes = [];
  const files = [];
  const issues = [];
  const seen = new Set();

  for (const [index, path] of paths.entries()) {
    const parts = validatePath(path, index);
    inputChars += path.length;
    if (inputChars > LIMITS.inputChars)
      throw new Error('The combined path list exceeds 2 million characters.');
    if (seen.has(path))
      throw new Error(
        `Path ${index + 1}: duplicate source path. Each file must occur once.`,
      );
    seen.add(path);
    let parent = root;
    for (let part = 0; part < parts.length; part++) {
      const name = parts[part];
      const kind = part === parts.length - 1 ? 'file' : 'directory';
      const key = kind + '\0' + name;
      let node = parent.children.get(key);
      if (!node) {
        node = {
          name,
          kind,
          parent,
          children: new Map(),
          path: parent.path ? parent.path + '/' + name : name,
          target: '',
          issues: [],
        };
        parent.children.set(key, node);
        nodes.push(node);
        if (nodes.length > LIMITS.nodes)
          throw new Error(
            `The folder tree exceeds ${LIMITS.nodes.toLocaleString('en-US')} entries.`,
          );
      }
      parent = node;
    }
    files.push({ index, node: parent });
  }

  function add(node, code, detail) {
    const issue = { code, path: node.path, detail };
    node.issues.push(issue);
    issues.push(issue);
  }

  for (const node of nodes) {
    if (forbidden.test(node.name))
      add(
        node,
        'invalid-character',
        'Windows rejects a character in this name.',
      );
    if (invisible.test(node.name) || loneSurrogate.test(node.name))
      add(
        node,
        'invisible-character',
        'An invisible formatting character or invalid Unicode unit makes this name hard to verify.',
      );
    if (/[ .]$/u.test(node.name))
      add(
        node,
        'trailing-character',
        'Windows applications can drop trailing dots or spaces.',
      );
    if (reserved.test(node.name.replace(/[ .]+$/u, '')))
      add(
        node,
        'reserved-name',
        'Windows reserves this device name, including when it has an extension.',
      );
    if (bytes(node.name) > LIMITS.segmentBytes)
      add(
        node,
        'long-name',
        'This segment exceeds the conservative 120-byte delivery budget.',
      );
    if (node.name !== node.name.normalize('NFC'))
      add(
        node,
        'unicode-normalization',
        'Normalize this spelling to NFC for consistent delivery.',
      );
  }

  function allocate(parent) {
    const children = [...parent.children.values()];
    const groups = new Map();
    for (const child of children) {
      const key = portableKey(child.name.replace(/[ .]+$/u, ''));
      const group = groups.get(key) ?? [];
      group.push(child);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const fileAndDirectory =
        new Set(group.map((child) => child.kind)).size > 1;
      for (const child of group)
        add(
          child,
          fileAndDirectory ? 'file-directory-collision' : 'name-collision',
          `${group.length} sibling entries share a conservative case/Unicode destination name${fileAndDirectory ? ', including a file and a directory' : ''}.`,
        );
    }
    // Keep existing valid spellings when a repaired name competes with them.
    children.sort(
      (a, b) =>
        Number(safeName(a.name) !== a.name) -
          Number(safeName(b.name) !== b.name) ||
        compare(a.name, b.name) ||
        compare(a.kind, b.kind),
    );
    const protectedNames = new Set(
      children.map((child) => portableKey(safeName(child.name))),
    );
    const used = new Set();
    const sequences = new Map();
    for (const child of children) {
      const base = safeName(child.name);
      const baseKey = portableKey(base);
      let name = base,
        sequence = sequences.get(baseKey) ?? 2;
      while (used.has(portableKey(name))) {
        do {
          name = fitName(base, `~${sequence++}`);
        } while (protectedNames.has(portableKey(name)));
      }
      used.add(portableKey(name));
      sequences.set(baseKey, sequence);
      child.target = parent.target ? parent.target + '/' + name : name;
      allocate(child);
    }
  }
  allocate(root);

  const entries = files.map(({ node, index }) => {
    const reasons = new Set();
    for (let ancestor = node; ancestor !== root; ancestor = ancestor.parent) {
      for (const issue of ancestor.issues) reasons.add(issue.code);
    }
    // The ZIP keeps user files under files/ and its manifest outside that tree.
    const destinationLength = rootLength + 6 + node.target.length;
    const blocked = destinationLength > LIMITS.destinationChars;
    if (rootLength + 6 + node.path.length > LIMITS.destinationChars || blocked)
      reasons.add('long-path');
    if (blocked)
      add(
        node,
        'long-path',
        `The planned destination uses ${destinationLength} UTF-16 units, over the ${LIMITS.destinationChars}-unit budget. Shorten the source folders or choose a shorter destination root.`,
      );
    return {
      index,
      original: node.path,
      target: node.target,
      changed: node.path !== node.target,
      reasons: [...reasons],
      blocked,
      destinationLength,
    };
  });
  const counts = {};
  for (const entry of entries)
    for (const reason of entry.reasons)
      counts[reason] = (counts[reason] ?? 0) + 1;
  return {
    options: { rootLength },
    entries,
    issues,
    counts,
    summary: {
      files: entries.length,
      directories: nodes.length - files.length,
      changed: entries.filter((entry) => entry.changed).length,
      affected: entries.filter((entry) => entry.reasons.length || entry.changed)
        .length,
      blocked: entries.filter((entry) => entry.blocked).length,
    },
  };
}

export function manifestJSON(report) {
  return (
    JSON.stringify(
      {
        format: 'pathport-manifest',
        version: 1,
        ...report,
        notice:
          'Planned paths are relative to files/ in the ZIP. File contents, internal references and permissions are not rewritten. Original names remain in this manifest. This is a conservative naming check, not a filesystem guarantee.',
      },
      null,
      2,
    ) + '\n'
  );
}
