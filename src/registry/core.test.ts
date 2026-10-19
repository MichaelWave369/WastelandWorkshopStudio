import { describe, expect, it } from 'vitest';
import { analyzeRegistry, buildPatchedList, decodeFid, demoArtList, fidHex, makePatchNotes, parseArtList, parseFidInput, parseProHeader, validateNewArtName } from './core';
const enc=new TextEncoder();
const candidate=(filename:string)=>[{id:'x',filename,origin:'manual' as const}];
describe('Classic art/items registry index and patch engine',()=>{
  it('counts comments, blank lines, and leading spaces as reserved FID indexes',()=>{
    const list=parseArtList(enc.encode('AAA.FRM ; A\r\n; comment\r\n\r\n BBB.FRM\r\nXYZ.FRM'));
    expect(list.lines.map(l=>l.token)).toEqual(['AAA.FRM','','','','XYZ.FRM']);
    expect(analyzeRegistry(list,candidate('NEW.FRM')).additions[0].fidHex).toBe('0x00000005');
    const patched=buildPatchedList(list,candidate('NEW.FRM'));
    expect(new TextDecoder().decode(patched)).toBe('AAA.FRM ; A\r\n; comment\r\n\r\n BBB.FRM\r\nXYZ.FRM\r\nNEW.FRM\r\n');
    expect(patched.slice(0,list.original.length)).toEqual(list.original);
  });
  it('keeps ending newline index correct and preserves deliberate blank rows',()=>{
    const base=parseArtList(enc.encode('A.FRM\nB.FRM\n'));
    expect(base.lines).toHaveLength(2);
    expect(new TextDecoder().decode(buildPatchedList(base,candidate('C.FRM')))).toBe('A.FRM\nB.FRM\nC.FRM\n');
    const reserved=parseArtList(enc.encode('A.FRM\n\n'));
    expect(reserved.lines).toHaveLength(2);
    expect(analyzeRegistry(reserved,candidate('B.FRM')).additions[0].index).toBe(2);
  });
  it('blocks bad basename, existing and proposed collisions',()=>{
    for(const name of ['too_long_name.frm','../EVIL.FRM','C:\\x.frm','a.fr0','.frm'])
      expect(()=>validateNewArtName(name)).toThrow();
    const base=parseArtList(enc.encode('A.FRM\n'));
    const report=analyzeRegistry(base,[...candidate('a.frm'),{id:'y',filename:'NEW.FRM',origin:'manual'}, {id:'z',filename:'new.frm',origin:'manual'}]);
    expect(report.errors.some(e=>/already registered/.test(e))).toBe(true);
    expect(report.errors.some(e=>/Duplicate/.test(e))).toBe(true);
    expect(()=>buildPatchedList(base,candidate('a.frm'))).toThrow();
  });
  it('caps 12-bit art index at 4095',()=>{
    const source=enc.encode(Array.from({length:4096},(_,i)=>'F'+i+'.FRM').join('\n'));
    const report=analyzeRegistry(parseArtList(source),candidate('NEW.FRM'));
    expect(report.errors.some(e=>/4095|4096/.test(e))).toBe(true);
  });
  it('preserves source bytes, including legacy codepage comment',()=>{
    const source=Uint8Array.from([65,46,70,82,77,32,59,32,0xe9,0x0a]);
    const patched=buildPatchedList(parseArtList(source),candidate('NEXT.FRM'));
    expect(patched.slice(0,source.length)).toEqual(source);
  });
  it('rejects unsafe control bytes, mixed EOLs, and a UTF8 BOM',()=>{
    expect(()=>parseArtList(Uint8Array.from([65,0,66]))).toThrow(/control/);
    expect(()=>parseArtList(enc.encode('A.FRM\nB.FRM\r\n'))).toThrow(/Mixed/);
    expect(()=>parseArtList(Uint8Array.from([0xef,0xbb,0xbf,65]))).toThrow(/BOM/);
  });
  it('reads a big-endian PRO header without modifying anything and resolves art FID',()=>{
    expect(decodeFid(0x0000002a)).toMatchObject({type:0,index:42,hex:'0x0000002A'});
    expect(parseFidInput('0x0700002A').type).toBe(7);
    expect(parseFidInput('42').index).toBe(42);
    expect(fidHex(16)).toBe('0x00000010');
    expect(()=>parseFidInput('0x100000000')).toThrow();
    const bytes=new Uint8Array(12);
    const v=new DataView(bytes.buffer);
    v.setUint32(0,3,false);v.setInt32(4,100,false);v.setUint32(8,42,false);
    const pro=parseProHeader(bytes);
    expect(pro).toMatchObject({pid:3,messageId:100,prototypeType:0});
    expect(pro.fid.index).toBe(42);
    expect(()=>parseProHeader(new Uint8Array(11))).toThrow();
  });
  it('ships only original demo rows and emits explicit review warnings',()=>{
    const baseline=demoArtList();
    const report=analyzeRegistry(baseline,[{id:'x',filename:'ORIG.FRM',origin:'sprite-lab'}]);
    expect(baseline.lines[2].status).toBe('reserved');
    expect(report.additions[0].index).toBe(4);
    expect(makePatchNotes(baseline,report)).toContain('NOT INSTALLED');
  });
});
