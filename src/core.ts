import type { DialogueEntry, GameSpec, GameId, StudioProject, StudioWorkspace, ValidationResult } from './types';

export const STORAGE_KEY = 'wws:workspace:v1';
export const MAX_IMPORT_BYTES = 1024 * 1024;

export const GAMES: GameSpec[] = [
  { id: 'fo1', name: 'Fallout', year: 1997, family: 'Classic / isometric', status: 'editable', note: 'Dialogue .msg authoring and export in v0.1. Other formats are upcoming.' },
  { id: 'fo2', name: 'Fallout 2', year: 1998, family: 'Classic / isometric', status: 'editable', note: 'Dialogue .msg authoring and export in v0.1. DAT2, sprites and scripts are upcoming.' },
  { id: 'fot', name: 'Fallout Tactics', year: 2001, family: 'Tactics', status: 'planned', note: 'Dedicated campaign, entity and mission adapter planned.' },
  { id: 'fo3', name: 'Fallout 3', year: 2008, family: 'Gamebryo / GECK', status: 'planned', note: 'Dedicated plugin, quest and archive tooling planned.' },
  { id: 'fnv', name: 'Fallout: New Vegas', year: 2010, family: 'Gamebryo / GECK', status: 'planned', note: 'Dedicated plugin, quest and dialogue tooling planned.' },
  { id: 'fo4', name: 'Fallout 4', year: 2015, family: 'Creation Engine', status: 'planned', note: 'Dedicated Creation Kit and Papyrus workflows planned.' },
  { id: 'fo4vr', name: 'Fallout 4 VR', year: 2017, family: 'Creation Engine / VR', status: 'planned', note: 'Separate VR compatibility checks required.' },
  { id: 'fo76', name: 'Fallout 76', year: 2018, family: 'Online / restricted', status: 'research', note: 'Research-only: no installation or unsupported mod deployment.' },
  { id: 'shelter', name: 'Fallout Shelter', year: 2015, family: 'Mobile / management', status: 'research', note: 'Research-only; no mod export support.' },
  { id: 'bos', name: 'Fallout: Brotherhood of Steel', year: 2004, family: 'Console action', status: 'research', note: 'Research-only; no mod export support.' },
];

export const EDITABLE_GAME_IDS: GameId[] = ['fo1', 'fo2'];

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

export function newProject(name = 'Desert Outpost', game: GameId = 'fo1'): StudioProject {
  const now = new Date().toISOString();
  const title = name.trim() || 'Untitled Project';
  return {
    version: 1,
    id: uid(),
    name: title,
    game,
    filename: 'outpost.msg',
    createdAt: now,
    updatedAt: now,
    entries: [
      { id: uid(), number: 100, sound: '', text: 'Welcome to the outpost, traveler.' },
      { id: uid(), number: 101, sound: '', text: 'Fresh water is precious out here.' },
      { id: uid(), number: 102, sound: '', text: 'Stay safe beyond the walls.' },
    ],
  };
}

export function newWorkspace(): StudioWorkspace {
  const project = newProject();
  return { version: 1, activeId: project.id, projects: [project] };
}

/** Strict, deliberately limited v0.1 single-line MSG authoring subset. */
export function validateProject(project: StudioProject): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!EDITABLE_GAME_IDS.includes(project.game)) errors.push('Only Fallout 1 and Fallout 2 .msg editing is supported in this release.');
  if (!project.name.trim() || project.name.length > 80) errors.push('Project name must be 1 to 80 characters.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.msg$/i.test(project.filename)) errors.push('Filename must be a simple .msg filename (letters, numbers, underscores or hyphens).');
  if (project.entries.length === 0) errors.push('Add at least one dialogue line.');
  if (project.entries.length > 512) errors.push('The current editor supports at most 512 lines per project.');
  const seen = new Set<number>();
  project.entries.forEach((entry, index) => {
    const label = 'Line ' + (index + 1);
    if (!Number.isSafeInteger(entry.number) || entry.number < 0 || entry.number > 999999) errors.push(label + ': message ID must be an integer from 0 to 999999.');
    if (seen.has(entry.number)) errors.push(label + ': duplicate message ID ' + entry.number + '.');
    seen.add(entry.number);
    if (!/^[a-zA-Z0-9_-]{0,40}$/.test(entry.sound)) errors.push(label + ': sound token must contain only letters, numbers, underscore or hyphen (max 40).');
    if (!entry.text.trim()) errors.push(label + ': dialogue text cannot be empty.');
    if (entry.text.length > 1000) errors.push(label + ': dialogue text is over 1000 characters.');
    if (/[{}\r\n]/.test(entry.text)) errors.push(label + ': braces and newlines are unsupported in the v0.1 single-line editor.');
  });
  if (project.entries.some((entry) => entry.sound.length > 0)) warnings.push('Sound tokens are preserved but sound-file references are not verified.');
  warnings.push('Validation checks this editor\'s MSG subset, not in-game dialogue behavior or installation compatibility.');
  return { errors, warnings };
}

export function serializeMsg(project: StudioProject): string {
  const report = validateProject(project);
  if (report.errors.length) throw new Error(report.errors.join('\n'));
  return '# Wasteland Workshop Studio v0.1 export\n'
    + '# Original dialogue content; verify target-game placement before use.\n'
    + project.entries.map((entry) => '{' + entry.number + '}{' + entry.sound + '}{' + entry.text + '}').join('\n') + '\n';
}

export function parseMsg(input: string): { entries: DialogueEntry[]; errors: string[] } {
  const entries: DialogueEntry[] = [];
  const errors: string[] = [];
  const lines = input.replace(/^\uFEFF/, '').split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;
    const match = /^\{(\d+)\}\{([^{}]*)\}\{([^{}]*)\}$/.exec(trimmed);
    if (!match) {
      errors.push('Line ' + (index + 1) + ': unsupported MSG syntax; no changes imported.');
      return;
    }
    entries.push({ id: uid(), number: Number(match[1]), sound: match[2], text: match[3] });
  });
  if (entries.length === 0) errors.push('No supported MSG dialogue lines found.');
  if (entries.length > 512) errors.push('MSG contains more than 512 lines.');
  return { entries, errors };
}

export function parseProjectJson(source: string): StudioProject {
  const data: unknown = JSON.parse(source);
  if (!data || typeof data !== 'object') throw new Error('Expected a JSON project object.');
  const p = data as Record<string, unknown>;
  if (p.version !== 1 || typeof p.name !== 'string' || typeof p.filename !== 'string'
    || !EDITABLE_GAME_IDS.includes(p.game as GameId) || !Array.isArray(p.entries)) {
    throw new Error('Not a supported Wasteland Workshop v1 classic project.');
  }
  if (p.entries.length > 512) throw new Error('Project exceeds 512 dialogue lines.');
  const entries: DialogueEntry[] = p.entries.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid dialogue record.');
    const e = value as Record<string, unknown>;
    if (typeof e.number !== 'number' || typeof e.sound !== 'string' || typeof e.text !== 'string') {
      throw new Error('Invalid dialogue record fields.');
    }
    return { id: uid(), number: e.number, sound: e.sound, text: e.text };
  });
  const project: StudioProject = {
    version: 1,
    id: uid(),
    name: p.name,
    game: p.game as GameId,
    filename: p.filename,
    entries,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const report = validateProject(project);
  if (report.errors.length) throw new Error(report.errors.join('\n'));
  return project;
}

export function readWorkspace(): StudioWorkspace {
  if (typeof localStorage === 'undefined') return newWorkspace();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return newWorkspace();
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return newWorkspace();
    const candidate = data as Record<string, unknown>;
    if (candidate.version !== 1 || !Array.isArray(candidate.projects) || candidate.projects.length === 0
      || candidate.projects.length > 30 || typeof candidate.activeId !== 'string') return newWorkspace();
    const projects = candidate.projects as StudioProject[];
    if (!projects.every((p) => p && typeof p.id === 'string' && typeof p.name === 'string'
      && typeof p.filename === 'string' && EDITABLE_GAME_IDS.includes(p.game)
      && Array.isArray(p.entries) && p.entries.length <= 512
      && p.entries.every((e) => e && typeof e.id === 'string' && typeof e.number === 'number'
        && typeof e.sound === 'string' && typeof e.text === 'string'))) return newWorkspace();
    return { version: 1, projects, activeId: projects.some((p) => p.id === candidate.activeId) ? candidate.activeId : projects[0].id };
  } catch {
    return newWorkspace();
  }
}
