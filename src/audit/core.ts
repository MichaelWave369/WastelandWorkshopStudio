/**
 * Wasteland Workshop Classic Integration Auditor.
 * Evidence-based preflight of *staged* resources. No writes, installation, network
 * access, or guesses about unknown installed-game files and engine behavior.
 */
import { parseItemPrototype, parseMessageIds, parsePrototypeList } from '../prototype/core';
import { parseArtList } from '../registry/core';
import { stagedPath, validateBundle, type ClassicTarget, type Manifest, type StagedResource } from '../packager/core';

export type AuditResult = 'pass' | 'warning' | 'fail' | 'not-checked';
export interface AuditCheck {
  code: string;
  result: AuditResult;
  subject: string;
  detail: string;
}
export interface ItemTrace {
  prototype: string;
  pid: number;
  artFid: string;
  messageIds: [number, number];
  prototypeRow: string | null;
  artFilename: string | null;
  spriteStaged: boolean;
  spriteSource: 'staged' | 'external-unknown' | 'missing-index';
  status: 'linked-in-stage' | 'needs-external-review' | 'broken';
}
export interface AuditReport {
  schema: 'wws.integration-audit.v1';
  toolVersion: '1.0.0';
  packageName: string;
  target: ClassicTarget;
  createdAt: string;
  structuralState: 'blocked' | 'consistent-for-review';
  installReady: false;
  runtimeVerified: false;
  totals: { resources: number; bytes: number; pass: number; warning: number; fail: number; notChecked: number };
  checks: AuditCheck[];
  itemTraces: ItemTrace[];
  receipts: null | Array<{ path: string; bytes: number; sha256: string }>;
  manualTasks: string[];
}

function check(code: string, result: AuditResult, subject: string, detail: string): AuditCheck {
  return { code, result, subject, detail };
}
const ci = (value: string) => value.toLowerCase();

/**
 * Fail-closed structural contract. A successful preflight does not imply game
 * compatibility, license clearance, installation, or script/prototype activation.
 */
export function auditResources(
  resources: StagedResource[], target: ClassicTarget, packageName: string,
  createdAt = new Date().toISOString(),
): AuditReport {
  const checks: AuditCheck[] = [];
  const itemTraces: ItemTrace[] = [];
  const add = (code: string, result: AuditResult, subject: string, detail: string) =>
    checks.push(check(code, result, subject, detail));

  const issues = validateBundle(resources, target, packageName);
  issues.forEach((issue, index) =>
    add('STAGING_' + String(index + 1).padStart(3, '0'),
      issue.level === 'error' ? 'fail' : 'warning', 'Staging contract', issue.message));

  const byKind = (kind: StagedResource['kind']) => resources.filter(resource => resource.kind === kind);
  const byKindOne = (kind: StagedResource['kind']) => byKind(kind)[0];
  const protoResources = byKind('pro');
  const prototypeList = byKindOne('proto-lst');
  const protoMessages = byKindOne('pro-msg');
  const artList = byKindOne('lst');
  const frm = byKind('frm');
  const palettes = byKind('pal');
  const resourcesByName = new Set(frm.map(resource => ci(resource.name)));
  const paletteNames = new Set(palettes.map(resource => ci(resource.name)));

  const paths = new Set<string>();
  for (const resource of resources) {
    try {
      const path = stagedPath(resource);
      const folded = ci(path);
      if (paths.has(folded)) add('DESTINATION_COLLISION', 'fail', path, 'Two resources would occupy one case-insensitive ZIP path.');
      else paths.add(folded);
    } catch (error) {
      add('UNSAFE_DESTINATION', 'fail', resource.name,
        error instanceof Error ? error.message : 'Unable to resolve safe resource destination.');
    }
  }

  // Test authored dependencies separately, even if the packager has already
  // rejected the bundle. Missing evidence must never be displayed as a PASS.
  if (!protoResources.length) {
    add('NO_PROTOTYPE', 'not-checked', 'Prototype graph',
      'No PRO was staged. Item prototype relationships cannot be evaluated.');
  } else {
    let names: string[] | null = null;
    let ids: Set<number> | null = null;
    let artNames: Array<{ token: string; status: string }> | null = null;
    try { if (prototypeList) names = parsePrototypeList(prototypeList.bytes).entries; }
    catch { add('INVALID_PROTOTYPE_LIST', 'fail', 'Prototype list', 'Prototype list cannot be decoded safely.'); }
    try { if (protoMessages) ids = parseMessageIds(protoMessages.bytes); }
    catch { add('INVALID_ITEM_MESSAGES', 'fail', 'Item messages', 'Prototype MSG additions could not be parsed safely.'); }
    try { if (artList) artNames = parseArtList(artList.bytes).lines; }
    catch { add('INVALID_ART_LIST', 'fail', 'Art registry', 'Art list could not be parsed safely.'); }

    for (const resource of protoResources) {
      try {
        const item = parseItemPrototype(resource.bytes);
        const expectedFilename = String(item.number).padStart(8, '0') + '.PRO';
        const registered = names?.[item.number - 1]?.trim().split(/[;,\s]/)[0] ?? null;
        const artType = item.fid >>> 24;
        const artIndex = item.fid & 0x0fff;
        const art = artType === 0 && (item.fid & 0x00fff000) === 0 ? artNames?.[artIndex] : undefined;
        const artFilename = art?.status === 'entry' ? art.token : null;
        const spriteStaged = !!artFilename && resourcesByName.has(ci(artFilename));
        const filenameCorrect = ci(expectedFilename) === ci(resource.name);
        const listCorrect = !!registered && ci(registered) === ci(resource.name);
        const messagesCorrect = !!ids && ids.has(item.messageId) && ids.has(item.messageId + 1);
        const artCorrect = !!artFilename;
        const linksCorrect = filenameCorrect && listCorrect && messagesCorrect && artCorrect;

        add('PROTOTYPE_PID', filenameCorrect && listCorrect ? 'pass' : 'fail', resource.name,
          filenameCorrect && listCorrect
            ? 'PID ' + item.number + ' matches the PRO basename and the one-based prototype LST row.'
            : 'PRO filename / PID / prototype LST row do not agree.');
        add('ITEM_MESSAGE_IDS', messagesCorrect ? 'pass' : 'fail', resource.name,
          messagesCorrect
            ? 'Both pro_item message IDs ' + item.messageId + '/' + (item.messageId + 1) + ' exist in the staged additions.'
            : 'Missing item name/description message IDs or no decodable message additions supplied.');
        add('ART_FID_INDEX', artCorrect ? 'pass' : 'fail', resource.name,
          artCorrect
            ? 'World FID ' + item.fid + ' resolves to ' + artFilename + ' in a supplied art/items LST.'
            : 'World FID cannot be resolved to a populated type-0 art/items LST entry.');
        add('FRM_AVAILABILITY', !artCorrect ? 'not-checked' : spriteStaged ? 'pass' : 'warning',
          resource.name, !artCorrect
            ? 'Unresolved FID prevents sprite checks.'
            : spriteStaged ? artFilename + ' is included in the staged resources.'
              : artFilename + ' is not staged. It may exist in the installed game; this has NOT been verified.');

        itemTraces.push({
          prototype: resource.name, pid: item.pid,
          artFid: '0x' + item.fid.toString(16).toUpperCase().padStart(8, '0'),
          messageIds: [item.messageId, item.messageId + 1],
          prototypeRow: registered, artFilename,
          spriteStaged,
          spriteSource: !artCorrect ? 'missing-index' : spriteStaged ? 'staged' : 'external-unknown',
          status: linksCorrect ? spriteStaged ? 'linked-in-stage' : 'needs-external-review' : 'broken',
        });
      } catch (error) {
        add('INVALID_PRO', 'fail', resource.name,
          error instanceof Error ? error.message : 'Cannot decode item prototype.');
      }
    }
  }

  if (frm.length) {
    for (const sprite of frm) {
      const referenced = itemTraces.some(t => !!t.artFilename && ci(t.artFilename) === ci(sprite.name));
      add('SPRITE_LINK', referenced ? 'pass' : 'warning', sprite.name, referenced
        ? 'An included PRO references this staged sprite through the staged art list.'
        : 'No staged PRO traces to this sprite. It may be intentionally standalone or referenced by the installed game.');
      const expected = sprite.name.replace(/\.frm$/i, '.pal');
      add('SPRITE_PALETTE', paletteNames.has(ci(expected)) ? 'pass' : 'warning',
        sprite.name, paletteNames.has(ci(expected))
          ? 'Matching reference palette is present (runtime palette compatibility unverified).'
          : 'No matching palette is staged; the game may use its own color palette.');
    }
  } else add('NO_SPRITES', 'not-checked', 'Sprite coverage',
    'No FRM is staged; availability of referenced installed-game art is unknown.');

  if (byKind('msg').length) add('DIALOGUE_REGISTRATION', 'not-checked',
    'Dialogue references', 'MSG syntax is validated, but script dialogue IDs and engine registration cannot be checked from these files.');
  if (byKind('pro-msg').length) add('MESSAGE_BASELINE', 'not-checked', 'Item MSG collisions',
    'Staged message additions do not prove the original pro_item.msg has no conflicting IDs.');

  add('RUNTIME_COMPATIBILITY', 'not-checked', 'Target engine',
    'No game installation, LST precedence, scripts, actual gameplay, or installation outcome was inspected.');
  add('COPYRIGHT_CLEARANCE', 'not-checked', 'Distribution rights',
    'Selected game resource ownership and redistribution permissions cannot be established from file bytes.');

  const totals = {
    resources: resources.length,
    bytes: resources.reduce((sum, resource) => sum + (resource.bytes?.byteLength ?? 0), 0),
    pass: checks.filter(c => c.result === 'pass').length,
    warning: checks.filter(c => c.result === 'warning').length,
    fail: checks.filter(c => c.result === 'fail').length,
    notChecked: checks.filter(c => c.result === 'not-checked').length,
  };
  return {
    schema: 'wws.integration-audit.v1', toolVersion: '1.0.0', packageName, target, createdAt,
    structuralState: totals.fail ? 'blocked' : 'consistent-for-review',
    installReady: false, runtimeVerified: false, totals, checks, itemTraces, receipts: null,
    manualTasks: [
      'Verify any referenced FRM that was not staged against your legitimately owned local game assets.',
      'Resolve game-specific LST/prototype registration and precedence without changing original files blindly.',
      'Confirm name and description IDs do not collide with the actual game pro_item.msg baseline.',
      'Verify dialogue script references, required engine flags and inventory art where applicable.',
      'Test in a separate backed-up game installation before calling an item functional.',
      'Review license and redistribution rights; do not ship proprietary game content without permission.',
    ],
  };
}

export function auditWithReceipts(report: AuditReport, manifest: Manifest): AuditReport {
  if (report.structuralState !== 'consistent-for-review' || manifest.target !== report.target ||
      manifest.packageName !== report.packageName || manifest.files.length !== report.totals.resources) {
    throw new Error('Audit receipts must match the structurally consistent package.');
  }
  return { ...report, receipts: manifest.files.map(file => ({
    path: file.path, bytes: file.bytes, sha256: file.sha256,
  })) };
}

export function auditReadme(report: AuditReport): string {
  return [
    'WASTELAND WORKSHOP STUDIO / CLASSIC INTEGRATION AUDIT',
    '====================================================',
    'Target: ' + report.target + ' / Package: ' + report.packageName,
    'Structural preflight: ' + report.structuralState.toUpperCase(),
    'Game installation ready: NO / Actual runtime verified: NO',
    '',
    'CHECK RESULTS',
    ...report.checks.map(c => '[' + c.result.toUpperCase() + '] ' + c.code + ' / ' + c.subject + ': ' + c.detail),
    '',
    'NEXT MANUAL STEPS',
    ...report.manualTasks.map((task, index) => String(index + 1) + '. ' + task),
    '',
    'This report inspects staged data only. No installed game assets were accessed or changed.',
    '',
  ].join('\n');
}
