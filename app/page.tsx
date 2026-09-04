'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  FolderCheck,
  ArrowRight,
  Download,
  FolderOpen,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import {
  inspectPaths,
  parseManifest,
  manifestJSON,
  LIMITS,
  type Report,
} from '@/core/paths.mjs';
import {
  MAX_ARCHIVE_BYTES,
  portableArchive,
  type Source,
  type CopyProgress,
} from '@/core/archive.mjs';
import { download } from '@/lib/download';

const SAMPLE =
  'Brand/Logo.svg\nBrand/logo.svg\nInvoice/CON.pdf\nNotes/meeting?.txt\nPhotos/café.jpg\nPhotos/café.jpg\nDocs/brief.md\ndocs/notes.md\nReadme.txt';
const SAMPLE_REPORT = inspectPaths(parseManifest(SAMPLE));
const PAGE_SIZE = 30;
const labels: Record<string, string> = {
  'invalid-character': 'Invalid character',
  'invisible-character': 'Invisible character',
  'trailing-character': 'Trailing dot or space',
  'reserved-name': 'Reserved name',
  'long-name': 'Long name',
  'unicode-normalization': 'Unicode spelling',
  'name-collision': 'Name collision',
  'file-directory-collision': 'File / folder collision',
  'long-path': 'Long destination path',
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'The check could not be completed.';
const shownPath = (value: string) => JSON.stringify(value).slice(1, -1);

function rootBudget(value: string) {
  if (!/^\d{1,3}$/.test(value))
    throw new Error('Enter a destination root length between 0 and 200.');
  return Number(value);
}

export default function Home() {
  const [paths, setPaths] = useState(SAMPLE);
  const [rootLength, setRootLength] = useState('40');
  const [sources, setSources] = useState<Source[] | null>(null);
  const [report, setReport] = useState<Report | null>(SAMPLE_REPORT);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(
    'Sample paths — choose your folder or paste your own.',
  );
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [copying, setCopying] = useState(false);
  const [progress, setProgress] = useState<CopyProgress | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const activeCopy = useRef<AbortController | null>(null);

  function invalidate() {
    activeCopy.current?.abort();
    activeCopy.current = null;
    setCopying(false);
    setProgress(null);
    setReport(null);
    setError('');
    setNotice('');
    setPage(0);
  }

  function publishReport(next: Report) {
    setReport(next);
    setPage(0);
    setFilter('all');
  }

  function checkPaths() {
    invalidate();
    try {
      const input = sources
        ? sources.map((source) => source.path)
        : parseManifest(paths);
      publishReport(
        inspectPaths(input, { rootLength: rootBudget(rootLength) }),
      );
    } catch (failure) {
      setError(message(failure));
    }
  }

  function useSample() {
    invalidate();
    setSources(null);
    setPaths(SAMPLE);
    setRootLength('40');
    publishReport(SAMPLE_REPORT);
    setNotice('Sample paths — no file contents selected.');
  }

  function selectFolder(list: FileList | null) {
    if (!list?.length) return;
    invalidate();
    setSources(null);
    setPaths('');
    try {
      if (list.length > LIMITS.files)
        throw new Error('Choose a folder with at most 10,000 files.');
      const selected = Array.from(list, (file) => ({
        path: file.webkitRelativePath || file.name,
        blob: file,
      }));
      const next = inspectPaths(
        selected.map((source) => source.path),
        { rootLength: rootBudget(rootLength) },
      );
      setSources(selected);
      setPaths(
        selected
          .slice(0, 100)
          .map((source) => shownPath(source.path))
          .join('\n'),
      );
      publishReport(next);
      setNotice(
        `${selected.length.toLocaleString()} file names inspected. Contents have not been read.`,
      );
    } catch (failure) {
      setError(message(failure));
    }
    if (folderInput.current) folderInput.current.value = '';
  }

  async function exportCopy() {
    if (!sources || !report || copying) return;
    const controller = new AbortController();
    activeCopy.current = controller;
    setCopying(true);
    setError('');
    setNotice('');
    try {
      const result = await portableArchive(sources, report.options, {
        signal: controller.signal,
        onProgress: (value) => {
          if (activeCopy.current === controller) setProgress(value);
        },
      });
      if (activeCopy.current !== controller) return;
      download(result.blob, 'pathport-copy.zip');
      setNotice(
        'ZIP download requested. The manifest includes the original file names.',
      );
    } catch (failure) {
      if (activeCopy.current !== controller) return;
      if (controller.signal.aborted)
        setNotice('Copy canceled. Original files are unchanged.');
      else setError(message(failure));
    } finally {
      if (activeCopy.current === controller) {
        activeCopy.current = null;
        setCopying(false);
        setProgress(null);
      }
    }
  }

  useEffect(() => {
    return () => {
      activeCopy.current?.abort();
    };
  }, []);

  const entries =
    report?.entries.filter(
      (entry) =>
        filter === 'all' ||
        (filter === 'changed' ? entry.changed : entry.blocked),
    ) ?? [];
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const selectedBytes =
    sources?.reduce((sum, source) => sum + source.blob.size, 0) ?? 0;
  const tooLarge = selectedBytes > MAX_ARCHIVE_BYTES;

  return (
    <div className="delivery">
      <header>
        <Link className="wordmark" href="/">
          <FolderCheck aria-hidden="true" />
          PATHPORT
        </Link>
        <span>FILE DELIVERY / PREFLIGHT</span>
        <a href="https://github.com/Yougan001/pathport">GitHub ↗</a>
      </header>
      <main>
        <div className="intro">
          <div>
            <p className="eyebrow">CHECK BEFORE YOU SEND</p>
            <h1>
              Works here.
              <br />
              Will it open there?
            </h1>
          </div>
          <p>
            Check the whole folder. Keep every file.
            <br />
            Originals are never renamed or uploaded.
          </p>
        </div>
        <div className="workbench">
          <section className="input-side" aria-labelledby="input-title">
            <div className="section-bar">
              <h2 id="input-title">Delivery manifest</h2>
              <span>01 / INPUT</span>
            </div>
            <div className="input-actions">
              <Button
                variant="outline"
                onClick={() => folderInput.current?.click()}
              >
                <FolderOpen />
                Choose folder
              </Button>
              <Button variant="ghost" onClick={useSample}>
                Sample
              </Button>
            </div>
            <input
              ref={folderInput}
              type="file"
              multiple
              {...{ webkitdirectory: '' }}
              hidden
              aria-label="Choose delivery folder"
              onChange={(event) => selectFolder(event.target.files)}
            />
            <label htmlFor="paths">
              {sources
                ? `Selected file names${sources.length > 100 ? ' · first 100 shown' : ''}`
                : 'Or paste relative file paths, one per line'}
            </label>
            <Textarea
              id="paths"
              value={paths}
              rows={11}
              readOnly={!!sources}
              maxLength={LIMITS.inputChars}
              spellCheck={false}
              onChange={(event) => {
                invalidate();
                setPaths(event.target.value);
              }}
            />
            {sources && (
              <div className="selection-meta">
                <span>
                  {sources.length.toLocaleString()} files ·{' '}
                  {(selectedBytes / 1024 / 1024).toFixed(2)} MiB
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    invalidate();
                    setSources(null);
                    setPaths('');
                  }}
                >
                  Use pasted paths
                </Button>
              </div>
            )}
            <div className="budget">
              <label htmlFor="root-length">Destination root length</label>
              <Input
                id="root-length"
                type="number"
                min={0}
                max={200}
                value={rootLength}
                onChange={(event) => {
                  invalidate();
                  setRootLength(event.target.value);
                }}
              />
            </div>
            <p className="subtle">
              Reserve characters for the extraction folder, including its final
              separator. The plan adds <code>files/</code> and checks a
              240-character budget.
            </p>
            <Button className="check-button" onClick={checkPaths}>
              Check paths <ArrowRight />
            </Button>
            {error && (
              <p className="error" role="alert">
                <AlertTriangle aria-hidden="true" />
                {error}
              </p>
            )}
            {notice && <output className="status">{notice}</output>}
            <p className="privacy">
              Names stay in this browser. File contents are read only when you
              export a copy.
            </p>
          </section>
          <section className="report-side" aria-labelledby="report-title">
            <div className="section-bar">
              <h2 id="report-title">Delivery report</h2>
              <span>02 / REVIEW</span>
            </div>
            {!report ? (
              <div className="empty-report">
                <FolderCheck />
                <h3>Ready for a fresh check</h3>
                <p>Your previous result was cleared when the input changed.</p>
              </div>
            ) : (
              <>
                <div
                  className={`verdict ${report.summary.affected ? '' : 'clear'}`}
                >
                  <b>
                    {report.summary.blocked
                      ? 'SHORTER PATHS NEEDED'
                      : report.summary.affected
                        ? 'REVIEW THE COPY PLAN'
                        : 'NO NAMING RISKS FOUND'}
                  </b>
                  <strong>{report.summary.changed}</strong>
                  <span>
                    of {report.summary.files.toLocaleString()} files get a new
                    destination name
                  </span>
                </div>
                <div className="issue-summary">
                  {Object.entries(report.counts).map(([code, count]) => (
                    <span key={code}>
                      {labels[code]} <b>{count}</b>
                    </span>
                  ))}
                  {!report.summary.affected && (
                    <span>
                      <Check size={16} /> All names pass these checks
                    </span>
                  )}
                </div>
                <div className="report-tools">
                  <label htmlFor="filter">Show</label>
                  <NativeSelect
                    id="filter"
                    value={filter}
                    onChange={(event) => {
                      setFilter(event.target.value);
                      setPage(0);
                    }}
                  >
                    <NativeSelectOption value="all">
                      All files
                    </NativeSelectOption>
                    <NativeSelectOption value="changed">
                      Renamed in copy
                    </NativeSelectOption>
                    <NativeSelectOption value="blocked">
                      Over budget
                    </NativeSelectOption>
                  </NativeSelect>
                  <span>{entries.length.toLocaleString()} files</span>
                </div>
                <div className="plan-list">
                  {entries
                    .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                    .map((entry) => (
                      <article
                        className={`plan-row ${entry.blocked ? 'blocked' : ''}`}
                        key={entry.index}
                      >
                        <div className="path-line">
                          <span>FROM</span>
                          <code>{shownPath(entry.original)}</code>
                        </div>
                        <div className="path-line target">
                          <span>{entry.changed ? 'TO' : 'KEEP'}</span>
                          <code>{shownPath(entry.target)}</code>
                        </div>
                        <p>
                          {entry.reasons
                            .map((code) => labels[code])
                            .join(' · ') || 'No change needed'}
                          {entry.blocked
                            ? ` · ${entry.destinationLength} / 240 characters`
                            : ''}
                        </p>
                      </article>
                    ))}
                  {!entries.length && (
                    <p className="no-matches">No files in this view.</p>
                  )}
                </div>
                {pages > 1 && (
                  <Pagination aria-label="File report pages">
                    <PaginationContent>
                      <PaginationItem>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page === 0}
                          onClick={() => setPage(page - 1)}
                        >
                          Previous
                        </Button>
                      </PaginationItem>
                      <PaginationItem>
                        <span>
                          {page + 1} / {pages}
                        </span>
                      </PaginationItem>
                      <PaginationItem>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page + 1 === pages}
                          onClick={() => setPage(page + 1)}
                        >
                          Next
                        </Button>
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
                <div className="export-panel">
                  <h3>Take a copy, not a chance</h3>
                  <p>
                    Renaming may break links, imports or project references.
                    Contents are not rewritten. Review the plan before using the
                    copy.
                  </p>
                  <div className="export-actions">
                    <Button
                      variant="outline"
                      disabled={copying}
                      onClick={() => {
                        download(
                          new Blob([manifestJSON(report)], {
                            type: 'application/json',
                          }),
                          'pathport-manifest.json',
                        );
                        setNotice(
                          'Manifest download requested. It includes the original names.',
                        );
                      }}
                    >
                      <Download />
                      Manifest JSON
                    </Button>
                    <Button
                      disabled={
                        !sources ||
                        report.summary.blocked > 0 ||
                        tooLarge ||
                        copying
                      }
                      onClick={exportCopy}
                    >
                      <Download />
                      Portable ZIP
                    </Button>
                    {copying && (
                      <Button
                        variant="outline"
                        onClick={() => activeCopy.current?.abort()}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                  <output className="subtle">
                    {copying
                      ? `Copying ${progress?.files ?? 0} / ${sources?.length} files…`
                      : report.summary.blocked
                        ? 'ZIP blocked: shorten the over-budget paths or destination root.'
                        : tooLarge
                          ? 'Names checked. ZIP export is limited to 100 MiB of contents.'
                          : !sources
                            ? 'Choose a folder to include real files in the ZIP. Pasted paths export a manifest only.'
                            : 'ZIP: files/ plus a manifest. Contents are unchanged; timestamps and permissions are not preserved.'}
                  </output>
                </div>
              </>
            )}
          </section>
        </div>
        <footer>
          <p>
            Common Windows naming rules + conservative case and Unicode checks.
            Not a guarantee for every filesystem or sync service. Empty folders
            and symbolic links are not preserved by folder selection.
          </p>
          <a href="https://github.com/Yougan001/pathport#checks-and-limits">
            Checks & limits ↗
          </a>
          <a href="https://github.com/Yougan001/pathport/issues">
            Report an issue ↗
          </a>
        </footer>
      </main>
    </div>
  );
}
