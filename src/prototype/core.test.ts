import { describe, expect, it } from 'vitest';
import { demoArtList, parseArtList } from '../registry/core';
import {
 buildPrototypeList, createItemPro, defaultDraft, getNextPrototype, makeDemoPrototypeList,
 parseItemPrototype, parseMessageIds, parsePrototypeList, proposalMessages, prototypeFilename,
 reviewDraft, makeReviewNotes,
} from './core';
const enc=new TextEncoder();
const art=()=>demoArtList();
describe('Fallout 1/2 item prototype workshop',()=>{
  it('uses one-based prototype indexes while art FIDs remain zero-based',()=>{
    const proto=makeDemoPrototypeList();
    expect(proto.entries).toHaveLength(3);
    expect(getNextPrototype(proto)).toBe(4);
    expect(prototypeFilename(4)).toBe('00000004.PRO');
    const data=buildPrototypeList(proto);
    expect(data.slice(0,proto.original.length)).toEqual(proto.original);
    expect(new TextDecoder().decode(data)).toBe('00000001.PRO\r\n00000002.PRO\r\n00000003.PRO\r\n00000004.PRO\r\n');
    const review=reviewDraft(defaultDraft(),proto,art());
    expect(review).toMatchObject({pid:4,messageId:400,fid:0,filename:'00000004.PRO',artName:'EMPTY.FRM',problems:[]});
    expect(review.warnings.some(w=>/NOT verified/.test(w))).toBe(true);
  });
  it('exports a 61-byte big-endian key and decodes every authored field',()=>{
    const p=makeDemoPrototypeList();
    const d={...defaultDraft(),material:7,weight:12,cost:200,size:3,keyCode:4831,inventoryFid:-1};
    const result=reviewDraft(d,p,art(),new Set());
    expect(result.problems).toEqual([]);
    const bytes=createItemPro(d,result);
    expect(bytes.length).toBe(61);
    const view=new DataView(bytes.buffer);
    expect(view.getUint32(0,false)).toBe(4);
    expect(view.getInt32(4,false)).toBe(400);
    expect(view.getUint32(8,false)).toBe(0);
    expect(view.getInt32(28,false)).toBe(-1);
    expect(view.getInt32(32,false)).toBe(6);
    expect(view.getInt32(36,false)).toBe(7);
    expect(view.getInt32(52,false)).toBe(-1);
    expect(view.getInt32(57,false)).toBe(4831);
    expect(parseItemPrototype(bytes)).toMatchObject({
      pid:4,messageId:400,subtypeName:'key',material:7,size:3,weight:12,cost:200,
      inventoryFid:-1,keyCode:4831,expectedLength:61,
    });
  });
  it('exports a 69-byte misc item with no fictional power source',()=>{
    const draft={...defaultDraft(),subtype:'misc' as const,artIndex:1,charges:33};
    const review=reviewDraft(draft,makeDemoPrototypeList(),art(),new Set());
    expect(review.problems).toEqual([]);
    const decoded=parseItemPrototype(createItemPro(draft,review));
    expect(decoded).toMatchObject({subtypeName:'misc',fid:1,powerPid:-1,powerType:20,charges:33,length:69});
  });
  it('emits original pro_item.msg name/description lines with distinct IDs',()=>{
    const draft=defaultDraft();
    const review=reviewDraft(draft,makeDemoPrototypeList(),art(),new Set());
    const content=proposalMessages(draft,review);
    const parsed=parseMessageIds(content);
    expect(parsed.has(400)).toBe(true);
    expect(parsed.has(401)).toBe(true);
    expect(new TextDecoder().decode(content)).toContain(draft.title);
    expect(makeReviewNotes(draft,review)).toContain('NOT INSTALLATION READY');
  });
  it('blocks message collisions if pro_item.msg baseline supplied',()=>{
    const review=reviewDraft(defaultDraft(),makeDemoPrototypeList(),art(),new Set([400]));
    expect(review.problems.some(p=>/overlap/.test(p))).toBe(true);
    expect(()=>createItemPro(defaultDraft(),review)).toThrow();
    expect(()=>proposalMessages(defaultDraft(),review)).toThrow();
  });
  it('does not claim unregistered art and does not silently invent a prototype baseline',()=>{
    expect(reviewDraft(defaultDraft(),null,art()).problems.some(x=>/proto\/items/.test(x))).toBe(true);
    const draft={...defaultDraft(),artIndex:2};
    expect(reviewDraft(draft,makeDemoPrototypeList(),art()).problems.some(x=>/not a registered/.test(x))).toBe(true);
    const absent={...defaultDraft(),artIndex:88};
    expect(reviewDraft(absent,makeDemoPrototypeList(),art()).problems.some(x=>/not a registered/.test(x))).toBe(true);
  });
  it('keeps CRLF source bytes and never repacks original LST lines',()=>{
    const source=enc.encode('00000001.PRO ; old entry\r\n\r\n00000003.PRO');
    const baseline=parsePrototypeList(source);
    const added=buildPrototypeList(baseline);
    expect(added.slice(0,source.length)).toEqual(source);
    expect(new TextDecoder().decode(added)).toBe('00000001.PRO ; old entry\r\n\r\n00000003.PRO\r\n00000004.PRO\r\n');
  });
  it('detects safe name ranges, existing name collisions and malformed list input',()=>{
    expect(()=>prototypeFilename(0)).toThrow();
    expect(()=>prototypeFilename(100001)).toThrow();
    expect(()=>parsePrototypeList(enc.encode('BAD.PRO\r\nMORE.PRO\n'))).toThrow(/mixed/);
    expect(()=>parsePrototypeList(Uint8Array.from([0,1]))).toThrow(/control/);
    const baseline=parsePrototypeList(enc.encode('00000003.PRO\n00000001.PRO')); // next physical PID=3 collides with row 1
    expect(()=>buildPrototypeList(baseline)).toThrow(/collides/);
  });

  it('rejects a literal UTF-8 BOM instead of misreading the first proto filename',()=>{
    expect(()=>parsePrototypeList(Uint8Array.from([0xef,0xbb,0xbf,65]))).toThrow(/BOM/);
  });

  it('blocks unsupported/non-item PROs, truncation, and invalid subtypes',()=>{
    expect(()=>parseItemPrototype(new Uint8Array(55))).toThrow(/57/);
    const bytes=createItemPro(defaultDraft(),reviewDraft(defaultDraft(),makeDemoPrototypeList(),art(),new Set()));
    bytes[0]=1;
    expect(()=>parseItemPrototype(bytes)).toThrow(/item object type/);
    bytes[0]=0;
    new DataView(bytes.buffer).setInt32(32,9,false);
    expect(()=>parseItemPrototype(bytes)).toThrow(/subtype/);
  });
  it('can inspect a documented subtype it does not author, without inventing fields',()=>{
    const bytes=new Uint8Array(122);
    const v=new DataView(bytes.buffer);
    v.setUint32(0,10,false);
    v.setInt32(32,3,false);
    v.setInt32(36,1,false);
    expect(parseItemPrototype(bytes)).toMatchObject({subtypeName:'weapon',expectedLength:122,material:1});
  });
  it('rejects invalid script-brace or newline message content and numeric overflow',()=>{
    let draft={...defaultDraft(),title:'{Spoof}',artIndex:0};
    expect(reviewDraft(draft,makeDemoPrototypeList(),art()).problems.some(x=>/Name/.test(x))).toBe(true);
    draft={...defaultDraft(),title:'Good',cost:Infinity};
    expect(reviewDraft(draft,makeDemoPrototypeList(),art()).problems.some(x=>/Cost/.test(x))).toBe(true);
    const suspicious=enc.encode('{400}{}{fine}\nunsupported');
    expect(()=>parseMessageIds(suspicious)).toThrow(/unsupported/);
    expect(()=>parseMessageIds(enc.encode('{1}{}{X}\n{1}{}{Y}'))).toThrow(/duplicate/);
  });
  it('handles art baselines imported in review mode',()=>{
    const artList=parseArtList(enc.encode('ONE.FRM\nTWO.FRM\n'));
    const draft={...defaultDraft(),artIndex:1};
    expect(reviewDraft(draft,makeDemoPrototypeList(),artList,new Set()).artName).toBe('TWO.FRM');
  });
});
