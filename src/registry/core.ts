/**
 * Safe, append-only Fallout 1/2 art/items/items.lst proposals.
 * Physical lines determine FID indexes. Original baseline bytes are preserved.
 * Reference: https://github.com/rotators/fallout2-docs/blob/master/content/pages/lst.md
 */
export const MAX_LST_BYTES = 2 * 1024 * 1024;
export const MAX_ART_INDEX = 4095;
const encoder = new TextEncoder();
const decoder = new TextDecoder('windows-1252');
export interface ArtLine { index: number; raw: string; token: string; status: 'entry' | 'reserved' }
export interface ArtList {
  name: string;
  original: Uint8Array;
  lines: ArtLine[];
  newline: '\r\n' | '\n';
  trailingNewline: boolean;
  warnings: string[];
}
export interface RegistryCandidate { id: string; filename: string; origin: 'manual' | 'sprite-lab' }
export interface ProposedArt { index: number; filename: string; fid: number; fidHex: string; origin: RegistryCandidate['origin'] }
export interface RegistryReport { errors: string[]; warnings: string[]; additions: ProposedArt[] }
function guard(ok: boolean, message: string): asserts ok { if (!ok) throw new Error('Art Registry: ' + message); }
export function fidHex(fid: number): string { return '0x' + (fid >>> 0).toString(16).toUpperCase().padStart(8, '0'); }
export function decodeFid(fid: number) {
  guard(Number.isSafeInteger(fid) && fid >= 0 && fid <= 0xffffffff, 'FID must be an unsigned 32-bit integer.');
  return { type: (fid >>> 24) & 0x0f, index: fid & 0x0fff,
    rotation: (fid >>> 28) & 0x07, value: fid >>> 0, hex: fidHex(fid) };
}
export function parseFidInput(input: string): ReturnType<typeof decodeFid> {
  const source = input.trim();
  guard(/^(?:0x[0-9a-f]{1,8}|\d{1,10})$/i.test(source), 'Enter an unsigned decimal FID or 0x-prefixed hexadecimal FID.');
  const fid = /^0x/i.test(source) ? Number.parseInt(source.slice(2), 16) : Number(source);
  return decodeFid(fid);
}
export function parseProHeader(bytes: Uint8Array) {
  guard(bytes.length >= 12 && bytes.length <= 1024 * 1024, 'PRO must contain at least the 12-byte header and stay under 1 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pid = view.getUint32(0, false);
  const messageId = view.getInt32(4, false);
  const fid = view.getUint32(8, false);
  return { pid, pidHex: fidHex(pid), messageId, fid: decodeFid(fid),
    prototypeType: (pid >>> 24) & 0x0f, prototypeNumber: pid & 0xffff };
}
export function validateNewArtName(value: string): string {
  const name = value.trim();
  guard(/^[a-zA-Z0-9_-]{1,8}\.frm$/i.test(name),
    'Artwork must use an 8.3 filename (1–8 safe stem characters plus .frm).');
  return name;
}
export function parseArtList(original: Uint8Array, name = 'items.lst'): ArtList {
  guard(original instanceof Uint8Array && original.length <= MAX_LST_BYTES,
    'LST exceeds the 2 MiB read-only limit.');
  guard(original.length === 0 || original[0] !== 0xef || !(original[1] === 0xbb && original[2] === 0xbf),
    'UTF-8 BOM would affect the first art entry; select a plain 8-bit LST.');
  const source = decoder.decode(original);
  guard(!/[\u0000\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source),
    'LST contains NUL or invalid control bytes.');
  guard(!/\r(?!\n)/.test(source), 'LST contains unsupported bare carriage returns.');
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  guard(!source.includes('\r\n') || !source.replaceAll('\r\n', '').includes('\n'),
    'Mixed line endings are unsupported for byte-preserving patching.');
  const trailingNewline = source.endsWith('\n');
  const rawLines = source ? source.split(newline) : [];
  if (trailingNewline) rawLines.pop();
  guard(rawLines.length <= 8192, 'LST has too many physical lines for this bounded inspector.');
  const lines: ArtLine[] = rawLines.map((raw, index) => {
    // CE first-token delimiter set: space, comma, semicolon, CR, tab and LF.
    const token = raw.split(/[ ,;\t\r\n]/, 1)[0];
    return { index, raw, token, status: token ? 'entry' : 'reserved' };
  });
  const warnings:string[] = [];
  if (lines.length > MAX_ART_INDEX + 1) warnings.push('The baseline already exceeds the 12-bit art FID index range; no additions are possible.');
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.status === 'reserved') warnings.push('Index ' + line.index + ' has no first token (blank/comment/leading delimiter). Its slot remains reserved.');
    if (line.token.length > 12) warnings.push('Index ' + line.index + ' token exceeds 12 characters and may be truncated by the engine.');
    if (line.token) {
      const key = line.token.toLowerCase();
      if (seen.has(key)) warnings.push('Existing baseline contains duplicate token: ' + line.token + '.');
      seen.add(key);
    }
    if (warnings.length >= 30) break;
  }
  return { name, original: original.slice(), lines, newline, trailingNewline, warnings };
}
export function analyzeRegistry(baseline: ArtList | null, candidates: RegistryCandidate[]): RegistryReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const additions: ProposedArt[] = [];
  if (!baseline) errors.push('Select an existing local items.lst or load the clearly labeled synthetic demo baseline.');
  if (!candidates.length) errors.push('Add at least one candidate artwork filename.');
  if (candidates.length > 128) errors.push('Limit proposals to 128 appended filenames.');
  const existing = new Set((baseline?.lines ?? []).map(l => l.token.slice(0,12).toLowerCase()).filter(Boolean));
  const proposed = new Set<string>();
  for (const candidate of candidates) {
    try {
      const filename = validateNewArtName(candidate.filename);
      const folded = filename.toLowerCase();
      if (existing.has(folded)) errors.push(filename + ' is already registered in the baseline.');
      if (proposed.has(folded)) errors.push('Duplicate proposed filename: ' + filename + '.');
      proposed.add(folded);
      const index = (baseline?.lines.length ?? 0) + additions.length;
      if (index > MAX_ART_INDEX) errors.push('FID index would exceed the 12-bit limit (4095).');
      additions.push({ index, filename, fid: index, fidHex: fidHex(index), origin: candidate.origin });
    } catch (e) { errors.push(e instanceof Error ? e.message : 'Invalid candidate.'); }
  }
  if (baseline && baseline.lines.length + additions.length > MAX_ART_INDEX + 1)
    errors.push('Art list would exceed the 4096-slot FID index capacity.');
  if (baseline) warnings.push(...baseline.warnings);
  if (additions.length) warnings.push('Each proposed FID is the art/items type-0 reference only. PRO files, scripts, and LST/asset placement still need separate game integration.');
  warnings.push('Proposed lines append after the physical end of the selected baseline. No original list entries are changed.');
  return { errors, warnings, additions };
}
export function buildPatchedList(baseline: ArtList, candidates: RegistryCandidate[]): Uint8Array {
  const result=analyzeRegistry(baseline,candidates);
  guard(result.errors.length === 0, result.errors.join(' '));
  // Keep all original bytes exactly. Only ASCII candidate tokens are encoded as new bytes.
  const addition = result.additions.map(a=>a.filename).join(baseline.newline) + baseline.newline;
  const separator = baseline.original.length > 0 && !baseline.trailingNewline ? baseline.newline : '';
  const suffix = encoder.encode(separator + addition);
  const output = new Uint8Array(baseline.original.length + suffix.length);
  output.set(baseline.original);
  output.set(suffix, baseline.original.length);
  guard(output.length <= MAX_LST_BYTES, 'patched list would exceed the 2 MiB limit.');
  return output;
}
export function makePatchNotes(baseline: ArtList, report: RegistryReport): string {
  return [
    'WASTELAND WORKSHOP STUDIO | ART ITEMS REGISTRY PROPOSAL',
    '=====================================================',
    'Source: '+baseline.name,
    'Physical baseline lines: '+baseline.lines.length,
    'Path intended for manual review: art/items/items.lst',
    'Status: NOT INSTALLED; NO ORIGINAL FILES MODIFIED',
    '',
    'PROPOSED APPEND-ONLY CHANGES (ZERO-BASED LINE INDEX / FID)',
    ...report.additions.map(a=>'+ ['+a.index+' / '+a.fidHex+'] '+a.filename+' ('+a.origin+')'),
    '',
    'VALIDATION WARNINGS',
    ...report.warnings.map(w=>'- '+w),
    '',
    'The original list was not changed. Verify all references and back up your game',
    'before manually integrating any candidate file. Other art categories have',
    'different LST files and FID type bits. PRO/PID and scripts are not generated.',
    '',
  ].join('\n');
}
export const demoArtList=():ArtList=>parseArtList(encoder.encode([
  'EMPTY.FRM ; ORIGINAL WORKSHOP DEMO',
  'SAMPLE.FRM',
  '; comment-only line keeps physical index 2',
  'SIGN.FRM',
  '',
].join('\r\n')), 'synthetic-items.lst');
