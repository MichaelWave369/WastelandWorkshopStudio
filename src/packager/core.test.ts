import { describe, expect, it } from 'vitest';
import { createSpriteProject, encodeFrm, encodePal } from '../archive/spriteProject';
import { newProject, serializeMsg } from '../core';
import { buildManifest, checkResource, fileKind, safePackageName, stagedPath, validateBundle, type StagedResource } from './core';
import { makeZip } from './zip';
import { createHash } from 'node:crypto';

const enc=new TextEncoder();
const sample=():StagedResource[]=>{
  const project=createSpriteProject(12,12);
  return [
    {id:'one',name:'hello.msg',kind:'msg',origin:'dialogue-project',bytes:enc.encode(serializeMsg(newProject()))},
    {id:'two',name:'pixel.frm',kind:'frm',origin:'sprite-project',bytes:encodeFrm(project)},
    {id:'three',name:'pixel.pal',kind:'pal',origin:'sprite-project',bytes:encodePal(project)},
  ];
};
function parseZipLocal(bytes:Uint8Array) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const output:Record<string,Uint8Array>={};
  let cursor=0;
  while (cursor+4<=bytes.length && view.getUint32(cursor,true)===0x04034b50){
    const n=view.getUint16(cursor+26,true);
    const size=view.getUint32(cursor+18,true);
    const name=new TextDecoder().decode(bytes.subarray(cursor+30,cursor+30+n));
    const dataStart=cursor+30+n;
    output[name]=bytes.slice(dataStart,dataStart+size);
    cursor=dataStart+size;
  }
  return {output,cursor};
}
describe('Classic mod staging validation',()=>{
  it('accepts valid original dialogue, FRM, and PAL',()=>{
    const resources=sample();
    resources.forEach(r=>expect(checkResource(r.name,r.bytes)).toBe(r.kind));
    expect(validateBundle(resources,'fo1','Original Outpost').filter(x=>x.level==='error')).toEqual([]);
    expect(stagedPath(resources[0])).toBe('stage/data/text/english/game/hello.msg');
    expect(stagedPath(resources[1])).toBe('stage/data/art/items/pixel.frm');
    expect(stagedPath(resources[2])).toBe('reference/palettes/pixel.pal');
  });
  it('requires safe names and exact extension types',()=>{
    for(const name of ['../evil.frm','C:\\evil.msg','.evil.pal','other.exe','art/items/b.frm']) {
      expect(()=>fileKind(name)).toThrow();
    }
    expect(()=>safePackageName('../bad')).toThrow();
    expect(()=>safePackageName('')).toThrow();
  });
  it('rejects duplicate archive destinations case insensitively',()=>{
    const r=sample();
    r.push({...r[0],id:'extra',name:'HELLO.MSG'});
    expect(validateBundle(r,'fo2','A').some(x=>x.level==='error'&&/Duplicate/.test(x.message))).toBe(true);
  });
  it('flags game integration as warnings rather than claiming installability',()=>{
    const warnings=validateBundle(sample(),'fo2','A').filter(x=>x.level==='warning');
    expect(warnings.some(x=>/registration/.test(x.message))).toBe(true);
    expect(warnings.some(x=>/not an auto-installer/.test(x.message))).toBe(true);
  });
  it('rejects invalid msg lines instead of silently dropping them',()=>{
    const r=sample()[0];
    expect(()=>checkResource(r.name,enc.encode('{100}{}{Valid}\nNOT_MSG_LINE'))).toThrow(/Invalid MSG/);
  });
  it('creates SHA-256 provenance and explicit installReady false',async()=>{
    const resources=sample();
    const manifest=await buildManifest(resources,'fo1','Vault Original','2026-01-01T00:00:00Z');
    expect(manifest.files).toHaveLength(3);
    expect(manifest.installReady).toBe(false);
    expect(manifest.target).toBe('fo1');
    expect(manifest.files[0].sha256).toBe(createHash('sha256').update(resources[0].bytes).digest('hex'));
    expect(manifest.files[2].path).toContain('reference/palettes');
  });
  it('refuses invalid target, missing assets, and invalid filenames',async()=>{
    await expect(buildManifest([],'fo2','Empty')).rejects.toThrow(/Add at least/);
    expect(validateBundle(sample(),'fo3' as 'fo1','demo').some(x=>x.level==='error')).toBe(true);
    const invalid=sample();invalid[0].name='../../spoof.msg';
    expect(validateBundle(invalid,'fo1','demo').some(x=>x.level==='error')).toBe(true);
  });
});
describe('Independent no-compression ZIP packaging',()=>{
  it('builds a standards-shaped central directory and exact file payloads',()=>{
    const data=enc.encode('VAULT');
    const archive=makeZip([
      {path:'stage/data/items/original.txt',bytes:data},
      {path:'manifest.json',bytes:enc.encode('{"version":1}')},
    ]);
    const v=new DataView(archive.buffer);
    const {output,cursor}=parseZipLocal(archive);
    expect(output['stage/data/items/original.txt']).toEqual(data);
    expect(new TextDecoder().decode(output['manifest.json'])).toBe('{"version":1}');
    expect(v.getUint32(cursor,true)).toBe(0x02014b50);
    expect(v.getUint32(archive.length-22,true)).toBe(0x06054b50);
    expect(v.getUint16(archive.length-12,true)).toBe(2);
    expect(v.getUint32(archive.length-6,true)).toBe(cursor);
  });
  it('rejects path traversal, duplicates and backslashes',()=>{
    const data=enc.encode('a');
    for(const path of ['../x.msg','a/../../escape.frm','C:/absolute.pal','/root/x.msg','bad\\x.msg']){
      expect(()=>makeZip([{path,bytes:data}])).toThrow();
    }
    expect(()=>makeZip([{path:'a.msg',bytes:data},{path:'A.MSG',bytes:data}])).toThrow(/duplicate/);
  });
  it('refuses empty archives',()=>expect(()=>makeZip([])).toThrow(/entry count/));
});
