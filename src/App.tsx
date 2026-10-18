import VaultExplorer from './archive/Explorer';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity, ArrowDownToLine, ArrowRight, BadgeCheck, BookOpen, ChevronRight,
  CircleAlert, CircleCheck, Code2, Copy, Database, FileCode, FilePlus2,
  FileText, FolderOpen, Gamepad2, Hammer, Info, Layers3, LockKeyhole,
  Plus, Radiation, Save, ShieldCheck, Terminal, Trash2, Upload, X,
} from 'lucide-react';
import {
  EDITABLE_GAME_IDS, GAMES, MAX_IMPORT_BYTES, STORAGE_KEY,
  newProject, parseMsg, parseProjectJson, readWorkspace, serializeMsg, validateProject,
} from './core';
import type { DialogueEntry, GameId, StudioProject, StudioWorkspace } from './types';

type Page = 'workbench' | 'projects' | 'vault' | 'adapters' | 'guide';
type Notice = { text: string; type: 'success' | 'error' | 'info' } | null;

const pages = [
  { id: 'workbench' as const, label: 'Dialogue Studio', icon: FileCode },
  { id: 'projects' as const, label: 'Projects', icon: FolderOpen },
  { id: 'vault' as const, label: 'Vault Explorer', icon: Database },
  { id: 'adapters' as const, label: 'Game Adapters', icon: Layers3 },
  { id: 'guide' as const, label: 'Field Manual', icon: BookOpen },
];

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function friendlyDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Tag({ children, kind = 'neutral' }: { children: ReactNode; kind?: 'live' | 'planned' | 'research' | 'neutral' }) {
  return <span className={'tag tag-' + kind}>{children}</span>;
}

export default function App() {
  const [workspace, setWorkspace] = useState<StudioWorkspace>(readWorkspace);
  const [page, setPage] = useState<Page>('workbench');
  const [notice, setNotice] = useState<Notice>(null);
  const [storageProblem, setStorageProblem] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [gameDraft, setGameDraft] = useState<GameId>('fo1');
  const fileRef = useRef<HTMLInputElement>(null);

  const active = workspace.projects.find((project) => project.id === workspace.activeId) ?? workspace.projects[0];
  const validation = useMemo(() => validateProject(active), [active]);
  const preview = useMemo(
    () => validation.errors.length ? '# Fix validation errors before generating a .msg export.\n' : serializeMsg(active),
    [active, validation],
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      setStorageProblem(false);
    } catch {
      setStorageProblem(true);
    }
  }, [workspace]);

  function patchProject(patch: Partial<StudioProject>) {
    setWorkspace((previous) => ({
      ...previous,
      projects: previous.projects.map((project) =>
        project.id === previous.activeId
          ? { ...project, ...patch, updatedAt: new Date().toISOString() }
          : project,
      ),
    }));
  }

  function patchLine(id: string, patch: Partial<DialogueEntry>) {
    patchProject({ entries: active.entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) });
  }

  function addLine() {
    const max = active.entries.reduce((value, entry) => Math.max(value, Number.isFinite(entry.number) ? entry.number : 0), 99);
    patchProject({
      entries: [...active.entries, {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + String(Math.random()),
        number: max + 1,
        sound: '',
        text: 'New dialogue line',
      }],
    });
  }

  function removeLine(id: string) {
    patchProject({ entries: active.entries.filter((entry) => entry.id !== id) });
  }

  function createProject() {
    if (!nameDraft.trim()) {
      setNotice({ text: 'A project needs a name.', type: 'error' });
      return;
    }
    if (workspace.projects.length >= 30) {
      setNotice({ text: 'This browser workspace is capped at 30 projects. Export JSON backups before removing any.', type: 'error' });
      return;
    }
    const project = newProject(nameDraft.trim(), gameDraft);
    setWorkspace((previous) => ({
      ...previous,
      activeId: project.id,
      projects: [...previous.projects, project],
    }));
    setShowCreate(false);
    setPage('workbench');
    setNameDraft('');
    setNotice({ text: 'Project created. Your demo dialogue is ready to edit.', type: 'success' });
  }

  function duplicateProject() {
    if (workspace.projects.length >= 30) {
      setNotice({ text: 'Workspace limit reached. Export and remove an older project first.', type: 'error' });
      return;
    }
    const copy = newProject(active.name + ' copy', active.game);
    copy.filename = active.filename;
    copy.entries = active.entries.map((entry, index) => ({ ...entry, id: copy.id + '-' + index }));
    setWorkspace((previous) => ({ ...previous, activeId: copy.id, projects: [...previous.projects, copy] }));
    setNotice({ text: 'Project duplicated within this browser.', type: 'success' });
  }

  function deleteProject() {
    if (workspace.projects.length <= 1) {
      setNotice({ text: 'Keep at least one project in the workspace.', type: 'error' });
      return;
    }
    if (!window.confirm('Delete "' + active.name + '" from this browser? Download a JSON backup first.')) return;
    setWorkspace((previous) => {
      const remaining = previous.projects.filter((project) => project.id !== previous.activeId);
      return { ...previous, activeId: remaining[0].id, projects: remaining };
    });
    setNotice({ text: 'Browser project deleted.', type: 'info' });
  }

  function exportMsg() {
    if (validation.errors.length) {
      setNotice({ text: 'Resolve validation errors before exporting .msg.', type: 'error' });
      return;
    }
    try {
      download(active.filename, serializeMsg(active), 'text/plain;charset=utf-8');
      setNotice({ text: 'MSG exported. This is a resource, not an installed game mod.', type: 'success' });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Could not export MSG.', type: 'error' });
    }
  }

  function exportJson() {
    const slug = active.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
    download(slug + '.wws.json', JSON.stringify(active, null, 2) + '\n', 'application/json;charset=utf-8');
    setNotice({ text: 'Portable JSON backup downloaded.', type: 'success' });
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setNotice({ text: 'Import exceeds the 1 MB safety limit.', type: 'error' });
      return;
    }
    try {
      const contents = await file.text();
      if (file.name.toLowerCase().endsWith('.msg')) {
        const parsed = parseMsg(contents);
        if (parsed.errors.length) throw new Error(parsed.errors.slice(0, 3).join(' '));
        const candidate: StudioProject = { ...active, filename: file.name, entries: parsed.entries };
        const report = validateProject(candidate);
        if (report.errors.length) throw new Error(report.errors.slice(0, 3).join(' '));
        patchProject({ filename: file.name, entries: parsed.entries });
        setPage('workbench');
        setNotice({ text: parsed.entries.length + ' MSG lines imported into "' + active.name + '".', type: 'success' });
      } else if (file.name.toLowerCase().endsWith('.json')) {
        if (workspace.projects.length >= 30) throw new Error('Workspace limit reached (30 projects).');
        const project = parseProjectJson(contents);
        setWorkspace((previous) => ({ ...previous, activeId: project.id, projects: [...previous.projects, project] }));
        setPage('workbench');
        setNotice({ text: 'Project backup imported as a new project.', type: 'success' });
      } else {
        throw new Error('Choose a .msg or .json file.');
      }
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Import failed.', type: 'error' });
    }
  }

  async function copyPreview() {
    try {
      await navigator.clipboard.writeText(preview);
      setNotice({ text: 'Preview copied to clipboard.', type: 'success' });
    } catch {
      setNotice({ text: 'Clipboard access unavailable. Use Export MSG instead.', type: 'error' });
    }
  }

  return (
    <div className="app-shell">
      <div className="scan-overlay" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          <div className="brand-symbol"><Radiation size={24} strokeWidth={1.7} /></div>
          <div>
            <div className="brand-title">WASTELAND<span>WORKSHOP</span></div>
            <div className="brand-subtitle">UNOFFICIAL MOD AUTHORING STUDIO</div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="operational"><span className="operational-dot" /> LOCAL WORKSPACE</span>
          <span className="build-version">THE FIRST VAULT / v0.1.0</span>
          <a className="small-icon-button" href="https://github.com/MichaelWave369/WastelandWorkshopStudio" target="_blank" rel="noreferrer" title="Open the GitHub repository" aria-label="Open GitHub repository"><Code2 size={18} /></a>
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar">
          <div className="sidebar-section-label">CONTROL PANEL</div>
          <nav className="navigation" aria-label="Main navigation">
            {pages.map((item) => {
              const Icon = item.icon;
              return <button type="button" className={'nav-item ' + (page === item.id ? 'nav-selected' : '')} key={item.id} onClick={() => setPage(item.id)}>
                <Icon size={17} /><span>{item.label}</span>{page === item.id && <ChevronRight className="nav-chevron" size={14} />}
              </button>;
            })}
          </nav>

          <div className="sidebar-divider" />
          <div className="sidebar-project-heading">
            <span>ACTIVE PROJECTS <strong>{workspace.projects.length}</strong></span>
            <button className="small-icon-button" title="New project" aria-label="New project" onClick={() => { setNameDraft(''); setGameDraft('fo1'); setShowCreate(true); }}><Plus size={18} /></button>
          </div>
          <div className="project-list">
            {workspace.projects.map((project) => (
              <button type="button" key={project.id} className={'project-item ' + (project.id === active.id ? 'project-active' : '')}
                onClick={() => { setWorkspace((previous) => ({ ...previous, activeId: project.id })); setPage('workbench'); }}>
                <span className="project-glyph"><FileText size={16} /></span>
                <span className="project-name">{project.name}<small>{GAMES.find((spec) => spec.id === project.game)?.name}</small></span>
                {project.id === active.id && <span className="project-selected-indicator" />}
              </button>
            ))}
          </div>

          <div className="sidebar-bottom">
            <div className="systems-title"><Activity size={15} /> SYSTEM STATUS</div>
            <div className="system-row"><span>Classic MSG adapter</span><b>ACTIVE</b></div>
            <div className="system-row"><span>Desktop filesystem</span><span>OFFLINE</span></div>
            <div className="system-row"><span>Original game files</span><span>UNTOUCHED</span></div>
            <div className="system-row"><span>Storage</span><span>{storageProblem ? 'UNAVAILABLE' : 'LOCAL'}</span></div>
          </div>
        </aside>

        <main className="content">
          {notice && <div className={'notice notice-' + notice.type} role="status"><span>{notice.text}</span><button title="Dismiss notice" aria-label="Dismiss notice" onClick={() => setNotice(null)}><X size={16} /></button></div>}
          {storageProblem && <div className="warning-banner"><CircleAlert size={16} /> Browser autosave is unavailable. Export your project JSON now to avoid losing changes.</div>}
          {page === 'workbench' && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <p className="eyebrow"><span className="tiny-line" /> WORKBENCH / CLASSIC ERA</p>
                  <h1>Build something<br /><em>worth surviving for.</em></h1>
                  <p>One workshop. Every wasteland. Start here with real, editable Fallout 1 &amp; 2 dialogue resources.</p>
                  <div className="hero-actions">
                    <button className="btn btn-primary" onClick={exportMsg} disabled={validation.errors.length > 0}><ArrowDownToLine size={16} /> Export .MSG</button>
                    <button className="btn btn-outline" onClick={() => fileRef.current?.click()}><Upload size={16} /> Import Resource</button>
                  </div>
                </div>
                <div className="hero-illustration" aria-hidden="true">
                  <div className="hero-rings ring-one" /><div className="hero-rings ring-two" /><div className="hero-rings ring-three" />
                  <div className="hero-pylon pylon-one" /><div className="hero-pylon pylon-two" />
                  <Radiation className="hero-radiation" size={90} strokeWidth={0.75} />
                  <div className="hero-coordinate">SECTOR_01 / ARCHIVE_1997</div>
                </div>
              </section>

              <div className="section-heading"><div><span className="overline">CURRENT WORKSPACE</span><h2>Dialogue Studio <span className="section-annotation">/ classic.msg</span></h2></div><Tag kind="live"><CircleCheck size={12} /> LIVE EDITOR</Tag></div>

              <div className="studio-grid">
                <div className="studio-primary">
                  <div className="panel resource-panel">
                    <div className="panel-heading"><div><FileCode size={17} /><strong>RESOURCE CONFIGURATION</strong></div><span>01 / 03</span></div>
                    <div className="config-grid">
                      <label className="field"><span>PROJECT NAME</span><input value={active.name} maxLength={80} onChange={(event) => patchProject({ name: event.target.value })} /></label>
                      <label className="field"><span>TARGET GAME</span><select value={active.game} onChange={(event) => patchProject({ game: event.target.value as GameId })}>{GAMES.filter((g) => EDITABLE_GAME_IDS.includes(g.id)).map((g) => <option value={g.id} key={g.id}>{g.name} ({g.year})</option>)}</select></label>
                      <label className="field"><span>EXPORT FILENAME</span><input value={active.filename} spellCheck={false} onChange={(event) => patchProject({ filename: event.target.value })} /></label>
                      <div className="field field-static"><span>FORMAT ADAPTER</span><div className="field-static-value"><span className="led" /> CLASSIC MSG / v0.1</div></div>
                    </div>
                  </div>

                  <div className="panel dialogue-panel">
                    <div className="panel-heading"><div><Terminal size={17} /><strong>DIALOGUE RECORDS</strong></div><span>{active.entries.length} ENTRIES</span></div>
                    <p className="panel-instructions">Edit IDs, optional sound tokens, and text. Export uses the strict single-line <code>{'{ID}{SOUND}{TEXT}'}</code> format.</p>
                    <div className="dialogue-list">
                      {active.entries.map((entry, index) => (
                        <div className="dialogue-entry" key={entry.id}>
                          <div className="dialogue-entry-top">
                            <span className="entry-counter">LINE {String(index + 1).padStart(2, '0')}</span>
                            <button className="delete-icon" onClick={() => removeLine(entry.id)} title="Remove line" aria-label={'Remove line ' + (index + 1)}><Trash2 size={15} /></button>
                          </div>
                          <div className="dialogue-fields">
                            <label className="field field-number"><span>MESSAGE ID</span><input type="number" min={0} max={999999} value={Number.isFinite(entry.number) ? entry.number : ''} onChange={(event) => patchLine(entry.id, { number: event.target.value === '' ? NaN : Number(event.target.value) })} /></label>
                            <label className="field field-sound"><span>SOUND TOKEN (OPTIONAL)</span><input placeholder="None" value={entry.sound} onChange={(event) => patchLine(entry.id, { sound: event.target.value })} /></label>
                          </div>
                          <label className="field field-body"><span>DIALOGUE TEXT</span><textarea rows={2} value={entry.text} onChange={(event) => patchLine(entry.id, { text: event.target.value })} /></label>
                        </div>
                      ))}
                    </div>
                    <button className="btn btn-add" onClick={addLine} disabled={active.entries.length >= 512}><Plus size={16} /> ADD DIALOGUE LINE</button>
                  </div>
                </div>

                <div className="studio-secondary">
                  <div className="panel status-panel">
                    <div className="panel-heading"><div><ShieldCheck size={17} /><strong>VALIDATION GATE</strong></div><span>02 / 03</span></div>
                    <div className={'validation-status ' + (validation.errors.length ? 'validation-fail' : 'validation-pass')}>
                      {validation.errors.length ? <CircleAlert size={25} /> : <BadgeCheck size={25} />}
                      <div><strong>{validation.errors.length ? 'ACTION REQUIRED' : 'READY TO EXPORT'}</strong><span>{validation.errors.length ? validation.errors.length + ' blocking issue(s)' : 'All basic resource checks passed'}</span></div>
                    </div>
                    <div className="validation-list">
                      {validation.errors.length ? validation.errors.map((error, index) => <p className="validation-error" key={index}><CircleAlert size={13} />{error}</p>) : <p className="validation-ok"><CircleCheck size={14} /> Simple filename, valid IDs, supported single-line syntax</p>}
                      {validation.warnings.map((warning, index) => <p className="validation-note" key={index}><Info size={13} />{warning}</p>)}
                    </div>
                  </div>

                  <div className="panel preview-panel">
                    <div className="panel-heading"><div><Code2 size={17} /><strong>LIVE .MSG PREVIEW</strong></div><span>03 / 03</span></div>
                    <div className="preview-toolbar"><span><span className="led" /> {active.filename}</span><button aria-label="Copy preview" title="Copy preview" onClick={copyPreview}><Copy size={15} /></button></div>
                    <pre className="code-preview">{preview}</pre>
                    <div className="preview-actions"><button className="btn btn-primary btn-full" onClick={exportMsg} disabled={validation.errors.length > 0}><ArrowDownToLine size={16} /> DOWNLOAD .MSG</button><button className="btn btn-outline btn-full" onClick={exportJson}><Save size={16} /> BACK UP PROJECT JSON</button></div>
                  </div>

                  <div className="info-card"><LockKeyhole size={20} /><div><strong>YOUR GAMES ARE SAFE</strong><p>This browser demo cannot read or alter installed Fallout files. Downloading a .msg is not installing a mod.</p></div></div>
                </div>
              </div>
            </>
          )}

          {page === 'vault' && <VaultExplorer />}
          {page === 'projects' && (
            <section className="page-section">
              <p className="eyebrow"><span className="tiny-line" /> PERSONAL ARCHIVE</p>
              <h1 className="page-title">Project Vault</h1>
              <p className="page-description">Your creations are autosaved in this browser. Export each project to JSON for a portable backup.</p>
              <div className="toolbar"><button className="btn btn-primary" onClick={() => { setNameDraft(''); setShowCreate(true); }}><FilePlus2 size={16} /> New Project</button><button className="btn btn-outline" onClick={() => fileRef.current?.click()}><Upload size={16} /> Import .MSG or JSON</button></div>
              <div className="project-cards">
                {workspace.projects.map((project) => <button className={'project-card ' + (project.id === active.id ? 'is-current' : '')} key={project.id}
                  onClick={() => { setWorkspace((previous) => ({ ...previous, activeId: project.id })); setPage('workbench'); }}>
                  <div className="project-card-top"><FileText size={25} /><Tag kind={project.id === active.id ? 'live' : 'neutral'}>{project.id === active.id ? 'OPEN' : 'LOCAL'}</Tag></div>
                  <h3>{project.name}</h3><p>{GAMES.find((g) => g.id === project.game)?.name} · {project.entries.length} dialogue lines</p>
                  <span>Edited {friendlyDate(project.updatedAt)} <ArrowRight size={14} /></span>
                </button>)}
              </div>
              <div className="utility-panel"><h3>ACTIVE PROJECT ACTIONS</h3><p>{active.name} / {active.filename}</p><div className="toolbar"><button className="btn btn-outline" onClick={exportJson}><ArrowDownToLine size={16} /> Backup JSON</button><button className="btn btn-outline" onClick={duplicateProject}><Copy size={16} /> Duplicate</button><button className="btn btn-danger" onClick={deleteProject}><Trash2 size={16} /> Delete</button></div></div>
            </section>
          )}

          {page === 'adapters' && (
            <section className="page-section">
              <p className="eyebrow"><span className="tiny-line" /> ENGINE COMPATIBILITY MATRIX</p>
              <h1 className="page-title">Every era.<br /><em>Its own rules.</em></h1>
              <p className="page-description">The shared interface does not pretend different Fallout engines have interchangeable file formats. Only the two classic MSG authoring adapters are active today.</p>
              <div className="adapter-key"><Tag kind="live">EDITABLE TODAY</Tag><Tag kind="planned">PLANNED</Tag><Tag kind="research">RESEARCH ONLY</Tag></div>
              <div className="adapter-grid">
                {GAMES.map((item) => <article className="adapter-card" key={item.id}>
                  <div className="adapter-card-top"><Gamepad2 size={24} /><Tag kind={item.status === 'editable' ? 'live' : item.status}>{item.status === 'editable' ? 'MSG ACTIVE' : item.status === 'planned' ? 'PLANNED' : 'RESEARCH'}</Tag></div>
                  <h3>{item.name}</h3><p className="adapter-date">{item.year} / {item.family}</p><p>{item.note}</p>
                  {item.status === 'editable' ? <button className="adapter-open" onClick={() => { setPage('workbench'); }} >Open classic editor <ArrowRight size={14} /></button> : <span className="adapter-locked"><LockKeyhole size={13} /> NOT YET AVAILABLE</span>}
                </article>)}
              </div>
            </section>
          )}

          {page === 'guide' && (
            <section className="page-section guide-section">
              <p className="eyebrow"><span className="tiny-line" /> OPERATIONS MANUAL</p>
              <h1 className="page-title">Field Manual <em>01</em></h1>
              <p className="page-description">Everything this first release can actually do, without passing a roadmap mockup off as a finished modding suite.</p>
              <div className="manual-grid">
                <article className="manual-card"><span>01 / CREATE</span><Hammer size={24} /><h3>Make a project</h3><p>Create a Fallout 1 or Fallout 2 project. The original starter lines are yours to replace. A project can contain up to 512 lines.</p></article>
                <article className="manual-card"><span>02 / AUTHOR</span><FileCode size={24} /><h3>Edit dialogue</h3><p>Give each message a unique numeric ID, optional sound token, and one line of text. Braces, line breaks and advanced MSG structures are not supported yet.</p></article>
                <article className="manual-card"><span>03 / CHECK</span><ShieldCheck size={24} /><h3>Validate first</h3><p>Bad filenames, duplicate IDs, unsafe delimiters and malformed imported resources are rejected. This does not prove runtime compatibility.</p></article>
                <article className="manual-card"><span>04 / EXPORT</span><Database size={24} /><h3>Download safely</h3><p>Export .msg resources or project JSON backups. To try a resource in game, separately follow the correct installation and scripting workflow for your owned game.</p></article>
              </div>
              <div className="manual-warning"><CircleAlert size={22} /><div><strong>THE BROWSER SANDBOX IS INTENTIONAL</strong><p>No game-folder scanning, DAT extraction, executable modification, mod installation or third-party assets. Those require separate format-aware desktop tools, explicit permissions and more validation.</p></div></div>
              <div className="manual-links"><button className="adapter-open" onClick={() => setPage('vault')}>Open the Classic Vault Explorer <ArrowRight size={14} /></button><a href="https://github.com/MichaelWave369/WastelandWorkshopStudio/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">Architecture &amp; safety <ArrowRight size={14} /></a><a href="https://github.com/MichaelWave369/WastelandWorkshopStudio/issues" target="_blank" rel="noreferrer">Project issue tracker <ArrowRight size={14} /></a></div>
            </section>
          )}
          <footer className="footer"><div><Radiation size={15} /> WASTELAND WORKSHOP STUDIO <span>·</span> BUILT FOR MAKERS, NOT MIRAGES</div><span>Independent fan tool · Not affiliated with Fallout rights holders</span></footer>
        </main>
      </div>

      <input className="visually-hidden" type="file" ref={fileRef} accept=".msg,.json" aria-label="Import MSG or JSON file" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ''; await importFile(file); }} />

      {showCreate && <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Create a new project" onClick={(event) => event.stopPropagation()}>
          <div className="modal-top"><Radiation size={24} /><button title="Close" aria-label="Close new project dialog" onClick={() => setShowCreate(false)}><X size={18} /></button></div>
          <h2>Start a new vault.</h2>
          <p>Choose an initial classic engine. Additional adapters will become available after they are implemented and tested.</p>
          <form onSubmit={(event) => { event.preventDefault(); createProject(); }}>
            <label className="field"><span>PROJECT NAME</span><input autoFocus maxLength={80} placeholder="My Wasteland Story" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} /></label>
            <label className="field"><span>TARGET GAME</span><select value={gameDraft} onChange={(event) => setGameDraft(event.target.value as GameId)}><option value="fo1">Fallout (1997)</option><option value="fo2">Fallout 2 (1998)</option></select></label>
            <button className="btn btn-primary btn-full" type="submit"><Plus size={16} /> CREATE PROJECT</button>
          </form>
        </div>
      </div>}
    </div>
  );
}
