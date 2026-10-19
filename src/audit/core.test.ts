import { describe, expect, it } from 'vitest';
import { makePrototypeHandoff } from '../packager/prototypeBridge';
import { type StagedResource, buildManifest } from '../packager/core';
import { makeDemoPrototypeList, defaultDraft } from '../prototype/core';
import { demoArtList, parseArtList } from '../registry/core';
import { createSpriteProject, encodeFrm, encodePal } from '../archive/spriteProject';
import { auditResources, auditReadme, auditWithReceipts } from './core';
const encode=new TextEncoder();
const transfer=()=>makePrototypeHandoff('fo1',defaultDraft(),makeDemoPrototypeList(),demoArtList(),new Set()).resources;
const now='2026-10-18T00:00:00.000Z';

describe('Classic Integration Auditor v1.0',()=>{
  it('traces prototype PID 4 through messages 400/401 and world art FID zero',()=>{
    const report=auditResources(transfer(),'fo1','Original Workshop',now);
    expect(report.structuralState).toBe('consistent-for-review');
    expect(report.installReady).toBe(false);
    expect(report.runtimeVerified).toBe(false);
    expect(report.itemTraces).toHaveLength(1);
    expect(report.itemTraces[0]).toMatchObject({
      pid:4, prototype:'00000004.PRO', artFid:'0x00000000',
      artFilename:'EMPTY.FRM', messageIds:[400,401],
      spriteStaged:false, spriteSource:'external-unknown', status:'needs-external-review',
    });
    expect(report.checks.find(x=>x.code==='PROTOTYPE_PID')?.result).toBe('pass');
    expect(report.checks.find(x=>x.code==='FRM_AVAILABILITY')?.result).toBe('warning');
    expect(report.checks.find(x=>x.code==='RUNTIME_COMPATIBILITY')?.result).toBe('not-checked');
  });
  it('marks matching original FRM and PAL as staged without claiming runtime verification',()=>{
    const art=createSpriteProject(12,12);
    const resources:StagedResource[]=[...transfer(),
      {id:'f',kind:'frm',name:'EMPTY.FRM',origin:'sprite-project',bytes:encodeFrm(art)},
      {id:'p',kind:'pal',name:'EMPTY.PAL',origin:'sprite-project',bytes:encodePal(art)}];
    const report=auditResources(resources,'fo1','Original Workshop',now);
    expect(report.structuralState).toBe('consistent-for-review');
    expect(report.itemTraces[0].status).toBe('linked-in-stage');
    expect(report.checks.some(x=>x.code==='FRM_AVAILABILITY'&&x.result==='pass')).toBe(true);
    expect(report.checks.some(x=>x.code==='SPRITE_PALETTE'&&x.result==='pass')).toBe(true);
    expect(report.runtimeVerified).toBe(false);
  });
  it('treats incorrectly positioned PRO references as blocking errors',()=>{
    const resources=transfer().map(x=>({...x,bytes:x.bytes.slice()}));
    resources[1].bytes=encode.encode('00000001.PRO\n00000002.PRO\n00000003.PRO\n00000099.PRO\n');
    const report=auditResources(resources,'fo1','Original Workshop',now);
    expect(report.structuralState).toBe('blocked');
    expect(report.totals.fail).toBeGreaterThan(0);
    expect(report.itemTraces[0].status).toBe('broken');
    expect(report.checks.some(x=>x.code==='PROTOTYPE_PID'&&x.result==='fail')).toBe(true);
  });
  it('identifies damaged name/description links instead of silently passing',()=>{
    const resources=transfer().map(x=>({...x,bytes:x.bytes.slice()}));
    resources[2].bytes=encode.encode('{500}{}{wrong}\n{501}{}{wrong}\n');
    const audit=auditResources(resources,'fo1','Original Workshop',now);
    expect(audit.structuralState).toBe('blocked');
    expect(audit.checks.some(x=>x.code==='ITEM_MESSAGE_IDS'&&x.result==='fail')).toBe(true);
    expect(audit.itemTraces[0].status).toBe('broken');
  });
  it('does not confuse reserved art list rows with registered sprite filenames',()=>{
    const art=parseArtList(encode.encode('ONE.FRM\n\n'));
    const resources=makePrototypeHandoff('fo1',defaultDraft(),makeDemoPrototypeList(),art,new Set()).resources;
    // Mutate only the newly created PRO to point at reserved row 1.
    resources[0].bytes=resources[0].bytes.slice();
    new DataView(resources[0].bytes.buffer).setUint32(8,1,false);
    const audit=auditResources(resources,'fo1','Original Workshop',now);
    expect(audit.structuralState).toBe('blocked');
    expect(audit.checks.some(x=>x.code==='ART_FID_INDEX'&&x.result==='fail')).toBe(true);
    expect(audit.itemTraces[0].spriteSource).toBe('missing-index');
  });
  it('marks standalone sprite and message resources as unlinked or unverified',()=>{
    const sprite=createSpriteProject(8,8);
    const r:StagedResource[]=[
      {id:'s',kind:'frm',name:'ALONE.FRM',origin:'sprite-project',bytes:encodeFrm(sprite)},
      {id:'m',kind:'msg',name:'dialogue.msg',origin:'local-import',bytes:encode.encode('{100}{}{Hello}\n')},
    ];
    const report=auditResources(r,'fo2','Side Project',now);
    expect(report.structuralState).toBe('consistent-for-review');
    expect(report.checks.some(x=>x.code==='NO_PROTOTYPE'&&x.result==='not-checked')).toBe(true);
    expect(report.checks.some(x=>x.code==='SPRITE_LINK'&&x.result==='warning')).toBe(true);
    expect(report.checks.some(x=>x.code==='DIALOGUE_REGISTRATION'&&x.result==='not-checked')).toBe(true);
  });
  it('preserves fail-closed state even on invalid filenames and duplicate path collisions',()=>{
    const data=transfer();
    const copies=[...data,{...data[0],id:'clone',name:data[0].name.toLowerCase()}];
    const report=auditResources(copies,'fo1','Original Workshop',now);
    expect(report.structuralState).toBe('blocked');
    expect(report.checks.some(x=>x.code==='DESTINATION_COLLISION'&&x.result==='fail')).toBe(true);
    const corrupt=[...data,{id:'bad',name:'../escape.frm',kind:'frm' as const,origin:'local-import' as const,bytes:encode.encode('bad')}];
    expect(auditResources(corrupt,'fo1','Original Workshop',now).checks.some(x=>x.code==='UNSAFE_DESTINATION')).toBe(true);
  });
  it('blocks empty staging and invalid package names without falsely claiming pass',()=>{
    const a=auditResources([],'fo1','',now);
    expect(a.structuralState).toBe('blocked');
    expect(a.totals.fail).toBeGreaterThan(0);
    expect(a.installReady).toBe(false);
  });
  it('attaches only correctly matched SHA256 manifest receipts and readable manual tasks',async()=>{
    const resources=transfer();
    const audit=auditResources(resources,'fo1','Original Workshop',now);
    const manifest=await buildManifest(resources,'fo1','Original Workshop',now);
    const recorded=auditWithReceipts(audit,manifest);
    expect(recorded.receipts).toHaveLength(4);
    expect(recorded.receipts?.[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(auditReadme(recorded)).toContain('Game installation ready: NO');
    expect(auditReadme(recorded)).toContain('Actual runtime verified: NO');
    expect(()=>auditWithReceipts(audit,{...manifest,target:'fo2'})).toThrow();
    const broken=auditResources([],'fo1','',now);
    expect(()=>auditWithReceipts(broken,manifest)).toThrow();
  });
});
