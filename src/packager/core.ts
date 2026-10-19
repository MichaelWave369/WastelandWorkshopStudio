import { parseMsg } from '../core';
import { parseFrm, parsePal } from '../archive/frm';
import { parseArtList } from '../registry/core';

export type ClassicTarget = 'fo1' | 'fo2';
export type StagedKind = 'msg' | 'frm' | 'pal' | 'lst';
export type StagedOrigin = 'dialogue-project' | 'sprite-project' | 'local-import';

export interface StagedResource {
  id: string;
  name: string;
  kind: StagedKind;
  origin: StagedOrigin;
  bytes: Uint8Array;
}
export interface PackageIssue { level: 'error' | 'warning'; message: string }
export interface PackageEntry { name: string; path: string; kind: StagedKind; origin: StagedOrigin; bytes: Uint8Array }
export const MAX_STAGED_FILES = 100;
export const MAX_STAGED_BYTES = 32 * 1024 * 1024;
export const MAX_SINGLE_FILE = 24 * 1024 * 1024;

export function safePackageName(value: string): string {
  const name = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_ -]{0,63}$/.test(name)) {
    throw new Error('Package name must be 1–64 characters, using letters, numbers, spaces, underscores or hyphens.');
  }
  return name;
}

export function fileKind(name: string): StagedKind {
  if (/^(?:items|items\.proposed)\.lst$/i.test(name)) return 'lst';
  const match = /^([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})\.(msg|frm|pal)$/i.exec(name);
  if (!match) throw new Error('Only simple .msg, .frm, .pal, or items[.proposed].lst filenames are supported (no paths).');
  return match[2].toLowerCase() as StagedKind;
}

function ensure(ok: boolean, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}
export function checkResource(name: string, bytes: Uint8Array): StagedKind {
  const kind = fileKind(name);
  ensure(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= MAX_SINGLE_FILE,
    'Resource must contain 1–24 MiB of bounded data.');
  if (kind === 'msg') {
    ensure(bytes.length <= 2 * 1024 * 1024, 'MSG resource exceeds the 2 MiB import limit.');
    // Fail rather than dropping an unsupported message line.
    const parsed = parseMsg(new TextDecoder('windows-1252').decode(bytes));
    ensure(parsed.errors.length === 0, 'Invalid MSG: ' + parsed.errors.slice(0, 2).join(' '));
    ensure(new Set(parsed.entries.map(e => e.number)).size === parsed.entries.length,
      'Invalid MSG: duplicate message IDs.');
  }
  if (kind === 'lst') {
    const registry = parseArtList(bytes, name);
    ensure(registry.lines.length <= 4096, 'LST exceeds 4096 physical art slots.');
    ensure(registry.lines.length > 0, 'LST must contain at least one physical art-list row.');
  }
  if (kind === 'frm') parseFrm(bytes, name);
  if (kind === 'pal') {
    ensure(bytes.length >= 768 && bytes.length <= 512 * 1024, 'PAL resource must be between 768 bytes and 512 KiB.');
    // Keep exact original bytes but validate the color header.
    parsePal(bytes, name);
  }
  return kind;
}

/** Deliberate staging layout, NOT an installation-ready Fallout mod. */
export function stagedPath(resource: Pick<StagedResource, 'name' | 'kind'>): string {
  fileKind(resource.name);
  if (resource.kind === 'msg') return 'stage/data/text/english/game/' + resource.name;
  if (resource.kind === 'frm') return 'stage/data/art/items/' + resource.name;
  if (resource.kind === 'pal') return 'reference/palettes/' + resource.name;
  if (resource.kind === 'lst') return 'reference/registry/' + resource.name;
  throw new Error('Unsupported staged resource kind.');
}

export function validateBundle(resources: StagedResource[], target: ClassicTarget, name: string): PackageIssue[] {
  const issues: PackageIssue[] = [];
  try { safePackageName(name); } catch (e) {
    issues.push({level:'error',message:(e as Error).message});
  }
  if (target !== 'fo1' && target !== 'fo2') {
    issues.push({level:'error',message:'Only Fallout 1 and Fallout 2 are supported as staging targets.'});
  }
  if (resources.length === 0) issues.push({level:'error',message:'Add at least one resource before exporting.'});
  if (resources.length > MAX_STAGED_FILES) issues.push({level:'error',message:'Maximum 100 files per staging package.'});
  let total = 0;
  const seen = new Set<string>();
  for (const resource of resources) {
    total += resource.bytes?.byteLength ?? 0;
    try {
      const kind = checkResource(resource.name, resource.bytes);
      ensure(kind === resource.kind, 'Resource kind mismatch.');
      const path = stagedPath(resource);
      if (seen.has(path.toLowerCase())) issues.push({level:'error',message:'Duplicate staging destination: '+path});
      seen.add(path.toLowerCase());
    } catch (e) {
      issues.push({level:'error',message:resource.name+': '+(e instanceof Error?e.message:'Validation failed.')});
    }
  }
  if (total > MAX_STAGED_BYTES) issues.push({level:'error',message:'Package payload exceeds 32 MiB safety limit.'});
  if (resources.some(r => r.kind === 'frm')) {
    issues.push({level:'warning',message:'FRM artwork does not become a usable in-game object automatically. Game-specific list/prototype/script registration remains necessary.'});
  }
  const spriteNames=resources.filter(r=>r.kind==='frm').map(r=>r.name.replace(/\.frm$/i,'').toLowerCase());
  for (const base of spriteNames) if (!resources.some(r=>r.kind==='pal' && r.name.toLowerCase()===base+'.pal')) {
    issues.push({level:'warning',message:base+'.frm has no same-basename palette in this package. Preview colors may depend on the game palette.'});
  }
  if (resources.some(r=>r.kind==='msg')) issues.push({level:'warning',message:'MSG files still require correct dialogue/script references and registration in the target game; this ZIP does not create them.'});
  if (resources.some(r=>r.kind==='lst')) issues.push({level:'warning',message:'LST resources stay in reference/registry only. Verify append indexes against the actual game list before manually integrating; these are not installed automatically.'});
  issues.push({level:'warning',message:'This is a review/staging archive, not an auto-installer. Test paths and gameplay with a legally owned game before deploying.'});
  return issues;
}

export interface Manifest {
  schema: 'wws.classic-staging.v1';
  tool: 'Wasteland Workshop Studio';
  version: '0.6.0';
  packageName: string;
  target: ClassicTarget;
  createdAt: string;
  installReady: false;
  files: Array<{path: string; type: StagedKind; source: StagedOrigin; bytes: number; sha256: string}>;
  notes: string[];
}
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
export async function buildManifest(resources: StagedResource[], target: ClassicTarget, name: string, createdAt = new Date().toISOString()): Promise<Manifest> {
  const issues=validateBundle(resources,target,name);
  if(issues.some(i=>i.level==='error')) throw new Error(issues.filter(i=>i.level==='error').map(i=>i.message).join('\n'));
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable in this browser; secure staging export cannot proceed.');
  const files=[] as Manifest['files'];
  for (const resource of resources) {
    const stableBytes = new Uint8Array(new ArrayBuffer(resource.bytes.length));
    stableBytes.set(resource.bytes);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', stableBytes);
    files.push({path:stagedPath(resource),type:resource.kind,source:resource.origin,
      bytes:resource.bytes.length,sha256:hex(new Uint8Array(digest))});
  }
  return {
    schema:'wws.classic-staging.v1',tool:'Wasteland Workshop Studio',version:'0.6.0',
    packageName:name,target,createdAt,installReady:false,files,
    notes:[
      'For review and testing only. This archive is not an installer and never modifies a game installation.',
      'The stage/ tree is a proposed loose-file layout. Validate and manually register assets using game-specific tools.',
      'reference/palettes contains supplemental palettes, not an automatic palette override at runtime.',
      'reference/registry contains manually reviewable LST data only; it is NOT installed or merged automatically.',
      'Do not publicly redistribute files extracted from proprietary game installations.',
    ],
  };
}
export function stagedEntries(resources: StagedResource[]): PackageEntry[] {
  return resources.map(r=>({name:r.name,path:stagedPath(r),kind:r.kind,origin:r.origin,bytes:r.bytes}));
}
export function installationNotes(manifest: Manifest): string {
  return [
    'WASTELAND WORKSHOP STUDIO | CLASSIC STAGING PACKAGE',
    '===================================================',
    'Package: '+manifest.packageName,
    'Target: '+(manifest.target==='fo1'?'Fallout 1 (1997)':'Fallout 2 (1998)'),
    'Status: NOT INSTALLATION-READY',
    'Generated: '+manifest.createdAt,
    '',
    'This ZIP contains staged candidate resources. It does not register items,',
    'create scripts/prototypes, edit DAT archives or install anything.',
    '',
    'CONTENTS',
    ...manifest.files.map(f=>'  '+f.path+' ('+f.bytes+' bytes, SHA-256 '+f.sha256+')'),
    '',
    'NEXT STEPS FOR THE MOD AUTHOR',
    '1. Back up your legitimate game installation before making changes.',
    '2. Review the staged/ path assumptions and any resource collisions.',
    '3. Use the appropriate Fallout 1/2 tools to update required LST, PRO,',
    '   scripts, dialogue references, and other game-specific links.',
    '4. Review any reference/registry LST proposals and validate line indexes before applying.',
    '5. Confirm palette compatibility and verify your assets in-game.',
    '5. Keep proprietary game content out of publicly distributed packages.',
    '',
    'No original files were modified by Wasteland Workshop Studio.',
    '',
  ].join('\n');
}
