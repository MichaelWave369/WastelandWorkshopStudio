import { describe,expect,it } from 'vitest';
import { demoArtList,parseArtList } from '../registry/core';
import { defaultDraft,makeDemoPrototypeList,parseItemPrototype } from '../prototype/core';
import { createSpriteProject,encodeFrm,encodePal } from '../archive/spriteProject';
import { makePrototypeHandoff } from './prototypeBridge';
import { validateBundle,stagedPath,buildManifest,checkResource,type StagedResource } from './core';
const enc=new TextEncoder();
const fresh=()=>makePrototypeHandoff('fo1',defaultDraft(),makeDemoPrototypeList(),demoArtList(),new Set());
describe('Prototype-to-Packager Bridge v0.9',()=>{
  it('transfers four typed, review-only resources with exact separate paths',()=>{
    const t=fresh();
    expect(t.target).toBe('fo1');
    expect(t.resources.map(x=>x.kind)).toEqual(['pro','proto-lst','pro-msg','lst']);
    expect(t.resources.map(stagedPath)).toEqual(['reference/proto/items/00000004.PRO','reference/proto/items/items.proposed.lst',
      'reference/messages/pro_item.additions.msg','reference/registry/items.lst']);
    expect(validateBundle(t.resources,'fo1','Test').filter(x=>x.level==='error')).toEqual([]);
  });
  it('links PID 4, message 400/401, and FID 0',()=>{
    const r=fresh().resources;
    expect(parseItemPrototype(r[0].bytes)).toMatchObject({pid:4,messageId:400,fid:0});
    expect(new TextDecoder().decode(r[1].bytes)).toContain('00000004.PRO');
    expect(new TextDecoder().decode(r[2].bytes)).toContain('{401}');
  });
  it('fails incorrect prototype-list position and missing message dependencies',()=>{
    const r=fresh().resources;
    const mis=r.map(x=>x.kind==='proto-lst'?{...x,bytes:enc.encode('00000004.PRO\n00000002.PRO\n00000003.PRO\n00000099.PRO\n')}:x);
    expect(validateBundle(mis,'fo1','Test').some(x=>x.level==='error'&&/not registered/.test(x.message))).toBe(true);
    expect(validateBundle(r.filter(x=>x.kind!=='pro-msg'),'fo1','Test').some(x=>x.level==='error'&&/complete PRO/.test(x.message))).toBe(true);
    const msg=r.map(x=>x.kind==='pro-msg'?{...x,bytes:enc.encode('{500}{}{name}\n{501}{}{desc}\n')}:x);
    expect(validateBundle(msg,'fo1','Test').some(x=>x.level==='error'&&/missing from prototype message/.test(x.message))).toBe(true);
  });
  it('fails incorrect on-disk PID and art FID, blocks malformed PRO names',()=>{
    const r=fresh().resources;
    expect(validateBundle(r.map(x=>x.kind==='pro'?{...x,name:'00000005.PRO'}:x),'fo1','Test')
      .some(x=>x.level==='error'&&/filename/.test(x.message))).toBe(true);
    const altered=r.map(x=>({...x,bytes:x.bytes.slice()}));
    new DataView(altered[0].bytes.buffer).setUint32(8,99,false);
    expect(validateBundle(altered,'fo1','Test').some(x=>x.level==='error'&&/art FID/.test(x.message))).toBe(true);
    for(const name of ['../../00000004.PRO','0000004.PRO','script.pro','scripts.lst'])
      expect(()=>checkResource(name,enc.encode('fake'))).toThrow();
  });
  it('exports verified SHA-256 reference-only manifest',async()=>{
    const manifest=await buildManifest(fresh().resources,'fo1','Reference Bridge','2026-10-18T00:00:00Z');
    expect(manifest.installReady).toBe(false);
    expect(manifest.files).toHaveLength(4);
    expect(manifest.files.every(x=>x.path.startsWith('reference/'))).toBe(true);
    expect(manifest.files[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('supports a fully matched Sprite Lab item with no missing-FRM warning',()=>{
    const baseline=parseArtList(enc.encode('ORIG.FRM\n'));
    const r=makePrototypeHandoff('fo2',defaultDraft(),makeDemoPrototypeList(),baseline,new Set()).resources;
    const art=createSpriteProject(12,12);
    const bundle:StagedResource[]=[...r,
      {id:'f',name:'ORIG.FRM',kind:'frm',origin:'sprite-project',bytes:encodeFrm(art)},
      {id:'c',name:'ORIG.PAL',kind:'pal',origin:'sprite-project',bytes:encodePal(art)}];
    const issues=validateBundle(bundle,'fo2','Test');
    expect(issues.filter(x=>x.level==='error')).toEqual([]);
    expect(issues.some(x=>/not included/.test(x.message))).toBe(false);
  });
  it('refuses missing baseline or unregistered artwork during handoff',()=>{
    expect(()=>makePrototypeHandoff('fo1',defaultDraft(),null,demoArtList())).toThrow(/proto\/items/);
    expect(()=>makePrototypeHandoff('fo1',{...defaultDraft(),artIndex:44},makeDemoPrototypeList(),demoArtList()))
      .toThrow(/not a registered filename/);
  });
});
