import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Archive, ArrowDownToLine, CheckCircle2, ChevronRight, Database,
  FileArchive, FileCode2, FileText, Folder, HardDrive, Info, Loader2,
  LockKeyhole, Search, ShieldCheck, Upload, X,
} from 'lucide-react';
import {
  MAX_EXTRACT_BYTES, extractDatEntry, hexPreview, inspectDat,
  isTextResource, resourceName, type DatIndex, type FormatPreference, type ResourceKind,
} from './dat';
import { makeDemoArchive } from './demo';
import './explorer.css';

const categories: Array<'All' | ResourceKind> = [
  'All', 'Art', 'Maps', 'Dialogue', 'Scripts', 'Prototypes', 'Audio', 'Text', 'Other',
];
type ArchiveSession = { file: File; index: DatIndex; isDemo: boolean };
type Preview = { kind: 'text' | 'hex' | 'error'; value: string } | null;
function sizeLabel(value: number): string {
  if (value < 1024) return value + ' B';
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KiB';
  return (value / (1024 * 1024)).toFixed(1) + ' MiB';
}
function prettyError(error: unknown): string {
  return error instanceof Error ? error.message : 'Archive operation failed.';
}
function safeDownload(file: string, data: Uint8Array) {
  // Copy into a new ArrayBuffer-backed view for type-safe browser Blob construction.
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export default function VaultExplorer() {
  const pickRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [format, setFormat] = useState<FormatPreference>('auto');
  const [session, setSession] = useState<ArchiveSession | null>(null);
  const [activeFolder, setActiveFolder] = useState('');
  const [category, setCategory] = useState<(typeof categories)[number]>('All');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [busy, setBusy] = useState(false);
  const [extractBusy, setExtractBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(160);

  const selected = selectedId === null ? null : session?.index.entries[selectedId] ?? null;
  const directoryStats = useMemo(() => {
    if (!session) return [];
    const counts = new Map<string, number>();
    for (const entry of session.index.entries) {
      const parts = entry.path.split('/');
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join('/');
        counts.set(dir, (counts.get(dir) ?? 0) + 1);
      }
    }
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }, [session]);
  const matches = useMemo(() => {
    if (!session) return [];
    const term = search.trim().toLowerCase();
    const result: number[] = [];
    session.index.entries.forEach((entry, index) => {
      if (activeFolder && !entry.path.toLowerCase().startsWith(activeFolder.toLowerCase() + '/')) return;
      if (category !== 'All' && entry.kind !== category) return;
      if (term && !entry.path.toLowerCase().includes(term)) return;
      result.push(index);
    });
    return result;
  }, [session, activeFolder, category, search]);
  const canExtract = selected && selected.codec !== 'lzss'
    && selected.originalSize <= MAX_EXTRACT_BYTES && selected.storedSize <= MAX_EXTRACT_BYTES;

  async function openArchive(file: File, isDemo = false) {
    const generation = ++request.current;
    setError(''); setMessage(''); setBusy(true); setPreview(null);
    setSelectedId(null);
    setSession(null);
    setActiveFolder(''); setCategory('All'); setSearch(''); setVisibleLimit(160);
    try {
      const index = await inspectDat(file, isDemo ? 'auto' : format);
      if (generation !== request.current) return;
      setSession({ file, index, isDemo });
      setMessage(index.entries.length + ' entries indexed in read-only mode. The original file has not changed.');
    } catch (cause) {
      if (generation === request.current) setError(prettyError(cause));
    } finally {
      if (generation === request.current) setBusy(false);
    }
  }

  function unloadArchive() {
    ++request.current;
    setSession(null); setSelectedId(null); setPreview(null); setError(''); setMessage('');
  }

  async function selectResource(id: number) {
    const generation = ++request.current;
    setSelectedId(id); setPreview(null); setError('');
    if (!session) return;
    const entry = session.index.entries[id];
    if (!entry) return;
    if (entry.codec === 'lzss') {
      setPreview({ kind: 'error', value: 'Fallout 1 LZSS decompression is not implemented yet. Browse metadata safely; extraction is disabled.' });
      return;
    }
    if (entry.originalSize > MAX_EXTRACT_BYTES || entry.storedSize > MAX_EXTRACT_BYTES) {
      setPreview({ kind: 'error', value: 'This resource exceeds the 24 MiB per-entry read limit. Metadata is still available.' });
      return;
    }
    try {
      setBusy(true);
      const bytes = await extractDatEntry(session.file, entry);
      if (generation !== request.current) return;
      if (isTextResource(entry.path)) {
        // Fallout resources may contain legacy single-byte codepages.
        setPreview({ kind: 'text', value: new TextDecoder('windows-1252').decode(bytes.subarray(0, 100_000))
          + (bytes.length > 100_000 ? '\n\n[PREVIEW TRUNCATED AT 100 KB]' : '') });
      } else {
        setPreview({ kind: 'hex', value: hexPreview(bytes, 256) + (bytes.length > 256 ? '\n…' : '') });
      }
    } catch (cause) {
      if (generation === request.current) setPreview({ kind: 'error', value: prettyError(cause) });
    } finally {
      if (generation === request.current) setBusy(false);
    }
  }

  async function exportEntry() {
    if (!session || !selected || !canExtract || extractBusy) return;
    const originalSelection = selectedId;
    try {
      setExtractBusy(true); setError('');
      const bytes = await extractDatEntry(session.file, selected);
      if (originalSelection !== selectedId) return;
      safeDownload(resourceName(selected.path), bytes);
      setMessage('Downloaded a separate copy of ' + selected.path + '. Archive remains unchanged.');
    } catch (cause) {
      setError(prettyError(cause));
    } finally {
      setExtractBusy(false);
    }
  }

  return (
    <section className="vault-page">
      <p className="eyebrow"><span className="tiny-line" /> ARCHIVE RECONNAISSANCE / READ ONLY</p>
      <div className="vault-heading">
        <div>
          <h1 className="page-title">Classic Vault <em>Explorer.</em></h1>
          <p className="page-description">Open a local Fallout 1 DAT1 or Fallout 2 DAT2 archive. Inspect its files without modifying the original. Export supported entries one at a time.</p>
        </div>
        <span className="vault-security"><ShieldCheck size={16} /> SOURCE FILE NEVER WRITTEN</span>
      </div>

      <div className="vault-open-panel">
        <div className="vault-open-icon"><Archive size={28}/></div>
        <div className="vault-open-description">
          <strong>LOAD ARCHIVE</strong>
          <span>Local selection only. No uploads, no installed-game scanning, no archive modifications.</span>
        </div>
        <label className="vault-format">
          <span>FORMAT</span>
          <select value={format} onChange={(event) => setFormat(event.target.value as FormatPreference)}>
            <option value="auto">Auto detect</option>
            <option value="dat1">Fallout 1 / DAT1</option>
            <option value="dat2">Fallout 2 / DAT2</option>
          </select>
        </label>
        <button className="btn btn-primary" disabled={busy} onClick={() => pickRef.current?.click()}><Upload size={15}/> SELECT .DAT</button>
        <button className="btn btn-outline" disabled={busy} onClick={() => openArchive(makeDemoArchive(), true)}><Database size={15}/> DEMO ARCHIVE</button>
        <input ref={pickRef} className="visually-hidden" type="file" accept=".dat,application/octet-stream"
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void openArchive(file); }}/>
      </div>

      {error && <div className="vault-alert vault-alert-error" role="alert"><AlertTriangle size={17}/><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={15}/></button></div>}
      {message && <div className="vault-alert" role="status"><CheckCircle2 size={17}/><span>{message}</span><button aria-label="Dismiss notice" onClick={() => setMessage('')}><X size={15}/></button></div>}

      {!session && !busy && <div className="vault-empty">
        <FileArchive size={54} strokeWidth={1.1}/>
        <h2>VAULT SEALED</h2>
        <p>Select an archive from your own game installation, or open the entirely original synthetic demo archive to explore the interface. The files never leave your browser.</p>
        <div className="vault-empty-details"><span>DAT1: BIG ENDIAN / LZSS</span><span>DAT2: LITTLE ENDIAN / ZLIB</span></div>
        <p className="vault-footnote">Not every file ending in .dat is a Fallout archive. Save-game DAT files are different formats.</p>
      </div>}
      {busy && !session && <div className="vault-empty vault-loading"><Loader2 size={32} className="vault-spinner"/><h2>READING ARCHIVE INDEX</h2><p>Validating structure, paths, bounds, and format without changing source bytes.</p></div>}

      {session && <>
        <div className="vault-metrics">
          <div className="vault-metric"><span>SOURCE</span><strong title={session.file.name}>{session.file.name}</strong><small>{session.isDemo ? 'ORIGINAL SYNTHETIC DEMO' : 'LOCAL FILE'}</small></div>
          <div className="vault-metric"><span>ARCHIVE TYPE</span><strong>{session.index.format.toUpperCase()}</strong><small>{session.index.format === 'dat1' ? 'FALLOUT 1' : 'FALLOUT 2'}</small></div>
          <div className="vault-metric"><span>RESOURCES</span><strong>{session.index.entries.length.toLocaleString()}</strong><small>INDEXED ENTRIES</small></div>
          <div className="vault-metric"><span>ARCHIVE SIZE</span><strong>{sizeLabel(session.index.byteLength)}</strong><small>READ-ONLY SOURCE</small></div>
          <button className="vault-unload" onClick={unloadArchive} title="Close archive"><X size={17}/><span>CLOSE</span></button>
        </div>
        {session.index.warnings.map((warning, i) => <div className="vault-alert vault-alert-warn" role="status" key={i}><Info size={15}/>{warning}</div>)}
        <div className="vault-browser">
          <div className="vault-panel vault-folders">
            <div className="vault-panel-title"><Folder size={16}/><strong>DIRECTORIES</strong><span>{directoryStats.length}</span></div>
            <div className="vault-tree">
              <button className={'vault-folder ' + (!activeFolder ? 'vault-folder-selected' : '')} onClick={() => { setActiveFolder(''); setVisibleLimit(160); }}><HardDrive size={14}/> ALL FILES <span>{session.index.entries.length}</span></button>
              {directoryStats.slice(0, 200).map(([path, count]) => {
                const depth = path.split('/').length - 1;
                return <button key={path} className={'vault-folder ' + (activeFolder === path ? 'vault-folder-selected' : '')}
                  style={{ paddingLeft: Math.min(depth, 5) * 11 + 10 }}
                  title={path} onClick={() => { setActiveFolder(path); setVisibleLimit(160); }}>
                  <ChevronRight size={12}/><span className="vault-folder-name">{path.split('/').pop()}</span><span>{count}</span>
                </button>;
              })}
              {directoryStats.length > 200 && <p className="vault-tree-hint">Showing first 200 folders. Use file search to locate other paths.</p>}
            </div>
          </div>
          <div className="vault-panel vault-list">
            <div className="vault-panel-title"><FileText size={16}/><strong>RESOURCE INDEX</strong><span>{matches.length.toLocaleString()} MATCHES</span></div>
            <div className="vault-filters">
              <div className="vault-search"><Search size={15}/><input aria-label="Search resource paths" placeholder="Find a file or path..." value={search} onChange={(event) => { setSearch(event.target.value); setVisibleLimit(160); }}/></div>
              <select aria-label="Resource category" value={category} onChange={(event) => { setCategory(event.target.value as (typeof categories)[number]); setVisibleLimit(160); }}>
                {categories.map((value) => <option key={value} value={value}>{value} resources</option>)}
              </select>
            </div>
            <div className="vault-file-list" role="list" aria-label="Archive resources">
              {matches.slice(0, visibleLimit).map((id) => {
                const entry = session.index.entries[id];
                return <button role="listitem" className={'vault-file ' + (id === selectedId ? 'vault-file-selected' : '')} key={id} onClick={() => void selectResource(id)}>
                  <FileCode2 size={15}/>
                  <span title={entry.path} className="vault-file-name">{entry.path}</span>
                  <span className="vault-file-codec">{entry.codec === 'none' ? 'RAW' : entry.codec.toUpperCase()}</span>
                  <span className="vault-file-size">{sizeLabel(entry.originalSize)}</span>
                </button>;
              })}
              {matches.length === 0 && <p className="vault-no-results">No matching resources.</p>}
              {matches.length > visibleLimit && <button className="vault-more" onClick={() => setVisibleLimit((v) => v + 160)}>SHOW MORE (+160 OF {matches.length.toLocaleString()})</button>}
            </div>
          </div>
          <div className="vault-panel vault-inspector">
            <div className="vault-panel-title"><ShieldCheck size={16}/><strong>RESOURCE INSPECTOR</strong><span>READ ONLY</span></div>
            {!selected ? <div className="vault-no-selection"><FileCode2 size={35}/><p>Select a resource to inspect its metadata and preview safe content.</p></div> : <>
              <div className="vault-entry-path"><span>SELECTED FILE</span><strong>{selected.path}</strong></div>
              <div className="vault-entry-fields">
                <div><span>TYPE</span><strong>{selected.kind}</strong></div>
                <div><span>CODEC</span><strong>{selected.codec.toUpperCase()}</strong></div>
                <div><span>OFFSET</span><strong>0x{selected.offset.toString(16).toUpperCase()}</strong></div>
                <div><span>STORED</span><strong>{sizeLabel(selected.storedSize)}</strong></div>
                <div><span>ORIGINAL</span><strong>{sizeLabel(selected.originalSize)}</strong></div>
                <div><span>STATUS</span><strong>{canExtract ? 'READABLE' : 'LOCKED'}</strong></div>
              </div>
              <div className="vault-preview-heading"><span>{preview?.kind === 'text' ? 'TEXT PREVIEW' : 'BINARY / RESOURCE PREVIEW'}</span><span>{busy ? 'DECODING…' : preview?.kind === 'error' ? 'UNAVAILABLE' : 'BOUNDED'}</span></div>
              {busy ? <div className="vault-preview-placeholder"><Loader2 size={22} className="vault-spinner"/> Reading selected entry…</div>
                : preview?.kind === 'error' ? <div className="vault-preview-error"><LockKeyhole size={16}/>{preview.value}</div>
                : preview ? <pre className="vault-preview-code">{preview.value}</pre>
                : <div className="vault-preview-placeholder">Select an entry to load preview.</div>}
              <button className="btn btn-primary btn-full" disabled={!canExtract || extractBusy} onClick={() => void exportEntry()}>
                {extractBusy ? <Loader2 size={15} className="vault-spinner"/> : <ArrowDownToLine size={15}/>}
                {extractBusy ? 'EXTRACTING…' : 'DOWNLOAD RESOURCE COPY'}
              </button>
              {!canExtract && <p className="vault-restriction">Only supported resources up to 24 MiB can be exported. DAT1 LZSS extraction is coming in a separate tested stage.</p>}
            </>}
          </div>
        </div>
      </>}
      <div className="vault-safety-footer"><ShieldCheck size={19}/><div><strong>ARCHIVE INTEGRITY FIRST</strong><p>No write access. No remote upload. No copying copyrighted game assets into this repository. The synthetic demo is entirely original.</p></div></div>
    </section>
  );
}
