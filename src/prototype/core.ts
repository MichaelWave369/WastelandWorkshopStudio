/**
 * Original Fallout 1/2 Item Prototype Workshop.
 * On-disk item prototype layout is BIG ENDIAN, with 57 common bytes,
 * followed by subtype data. Only Key (61 bytes) / Misc (69 bytes)
 * are encoded in v0.8. This is a review proposal, never an installer.
 * References:
 * https://jansimek.github.io/fallout2-modding/formats/pro/
 * https://falloutmods.fandom.com/wiki/PRO_File_Format
 */
import { parseArtList, type ArtList, fidHex } from '../registry/core';
export type ItemSubtype = 'key' | 'misc';
export type TargetGame = 'fo1' | 'fo2';
export interface PrototypeList {
  filename: string;
  original: Uint8Array;
  entries: string[];
  eol: '\n' | '\r\n';
  terminal: boolean;
}
export interface ItemDraft {
  subtype: ItemSubtype;
  title: string;
  description: string;
  artIndex: number;
  inventoryFid: number; // -1 = no separate inventory artwork
  weight: number;
  cost: number;
  size: number;
  material: number;
  keyCode: number; // used only by key
  charges: number; // used only by misc
}
export interface ItemInspection {
  pid: number; pidHex: string; number: number;
  messageId: number; fid: number; fidHex: string;
  lightDistance: number; lightIntensity: number;
  flags: number; extendedFlags: number; sid: number;
  subtype: number; subtypeName: string;
  material: number; size: number; weight: number; cost: number;
  inventoryFid: number; soundId: number;
  keyCode?: number; powerPid?: number; powerType?: number; charges?: number;
  length: number; expectedLength?: number;
}
export interface PrototypeReview {
  filename: string;
  pid: number; pidHex: string; messageId: number; fid: number;
  problems: string[]; warnings: string[];
  artName: string;
}
const enc = new TextEncoder();
const dec = new TextDecoder('windows-1252');
const SUBTYPES = ['armor','container','drug','weapon','ammo','misc','key'] as const;
const FILE_SIZES = [129,65,125,122,81,69,61] as const;
export const MAX_PRO_LIST_BYTES = 2 * 1024 * 1024;
export const MAX_PROTO_NUMBER = 100000;
function ok(value: boolean, text: string): asserts value { if(!value)throw Error('Prototype Workshop: '+text); }
export const prototypeFilename=(id:number):string=>{
  ok(Number.isSafeInteger(id)&&id>=1&&id<=MAX_PROTO_NUMBER,'prototype number is outside the supported range.');
  return String(id).padStart(8,'0')+'.PRO';
};
export const makeDemoPrototypeList=():PrototypeList=>parsePrototypeList(
  enc.encode('00000001.PRO\r\n00000002.PRO\r\n00000003.PRO\r\n'),
  'synthetic-proto-items.lst'
);
export function parsePrototypeList(bytes:Uint8Array,filename='items.lst'):PrototypeList {
  ok(bytes instanceof Uint8Array&&bytes.length<=MAX_PRO_LIST_BYTES,'proto/items/items.lst exceeds 2 MiB.');
  const source=dec.decode(bytes);
  ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)
    && !/\r(?!\n)/.test(source),'prototype list has unsupported control bytes.');
  ok(!(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf),'UTF-8 BOM unsupported.');
  const eol: '\r\n'|'\n'=source.includes('\r\n')?'\r\n':'\n';
  ok(!source.includes('\r\n') || !source.replaceAll('\r\n','').includes('\n'),'mixed line endings unsupported.');
  const terminal=source.endsWith('\n');
  const entries=source?source.split(eol):[];
  if(terminal)entries.pop();
  ok(entries.length<=MAX_PROTO_NUMBER,'prototype list exceeds 100,000 physical slots.');
  return {filename,original:bytes.slice(),entries,eol,terminal};
}
export function getNextPrototype(list:PrototypeList) {
  return list.entries.length+1; // One-based, unlike art FID.
}
export function buildPrototypeList(list:PrototypeList):Uint8Array {
  const next=getNextPrototype(list);
  ok(next<=MAX_PROTO_NUMBER,'prototype number exceeds safety limit.');
  const filename=prototypeFilename(next);
  const seen=list.entries.some(raw=>raw.trim().split(/[;\s]/)[0].toLowerCase()===filename.toLowerCase());
  ok(!seen,'generated prototype filename collides with existing list.');
  const suffix=enc.encode((list.original.length&&!list.terminal?list.eol:'')+filename+list.eol);
  const out=new Uint8Array(list.original.length+suffix.length);
  out.set(list.original);out.set(suffix,list.original.length);
  ok(out.length<=MAX_PRO_LIST_BYTES,'proposed LST exceeds 2 MiB.');
  return out;
}
export function parseItemPrototype(bytes:Uint8Array):ItemInspection {
  ok(bytes instanceof Uint8Array && bytes.length>=57 && bytes.length<=1024*1024,
    'item PRO requires at least 57 bytes and maximum 1 MiB.');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const pid=v.getUint32(0,false);
  ok((pid>>>24)===0 && (pid&0xffffff)>=1,'this inspector handles only item object type (PID high byte 0).');
  const subtype=v.getInt32(32,false);
  ok(subtype>=0 && subtype<=6,'unsupported item subtype.');
  const expectedLength=FILE_SIZES[subtype];
  const common:ItemInspection={
    pid,pidHex:fidHex(pid),number:pid&0xffffff,messageId:v.getInt32(4,false),
    fid:v.getUint32(8,false),fidHex:fidHex(v.getUint32(8,false)),
    lightDistance:v.getInt32(12,false),lightIntensity:v.getInt32(16,false),
    flags:v.getUint32(20,false),extendedFlags:v.getUint32(24,false),sid:v.getInt32(28,false),
    subtype,subtypeName:SUBTYPES[subtype],
    material:v.getInt32(36,false),size:v.getInt32(40,false),weight:v.getInt32(44,false),
    cost:v.getInt32(48,false),inventoryFid:v.getInt32(52,false),
    soundId:v.getUint8(56),length:bytes.length,expectedLength,
  };
  if(subtype===6){
    ok(bytes.length>=61,'key item PRO is truncated.');
    common.keyCode=v.getInt32(57,false);
  } else if(subtype===5){
    ok(bytes.length>=69,'misc item PRO is truncated.');
    common.powerPid=v.getInt32(57,false);
    common.powerType=v.getInt32(61,false);
    common.charges=v.getInt32(65,false);
  }else {
    ok(bytes.length>=expectedLength,'item PRO truncated for '+common.subtypeName+'.');
  }
  return common;
}
export function defaultDraft():ItemDraft {
  return {subtype:'key',title:'Original Workshop Key',description:'An original key from Wasteland Workshop.',
    artIndex:0,inventoryFid:-1,weight:1,cost:10,size:1,material:1,keyCode:-1,charges:0};
}
function safeMsgText(value:string,label:string):string {
  ok(typeof value==='string' && value.length>0 && value.length<=160
    && !/[\{\}\r\n\u0000-\u001f\u007f]/.test(value),label+' must be 1–160 characters without braces, newlines or controls.');
  return value;
}
export function reviewDraft(draft:ItemDraft,proto:PrototypeList|null,art:ArtList|null,existingMessages?:Set<number>):PrototypeReview {
  const problems:string[]=[];
  const warnings:string[]=[];
  if(!proto)problems.push('Select a proto/items/items.lst baseline first.');
  if(!art)problems.push('Select a separate art/items/items.lst baseline to resolve the art FID.');
  let title='',description='';
  try {title=safeMsgText(draft.title,'Name');}catch(e){problems.push((e as Error).message);}
  try {description=safeMsgText(draft.description,'Description');}catch(e){problems.push((e as Error).message);}
  const id=proto?getNextPrototype(proto):0;
  if(id>MAX_PROTO_NUMBER)problems.push('Prototype number exceeds 100,000.');
  const messageId=id*100;
  const file=id>=1&&id<=MAX_PROTO_NUMBER?prototypeFilename(id):'UNRESOLVED.PRO';
  const integer=(n:number,min:number,max:number,label:string)=>{
    if(!Number.isSafeInteger(n)||n<min||n>max)problems.push(label+' outside '+min+'..'+max+'.');
  };
  integer(draft.artIndex,0,4095,'Art FID index');
  integer(draft.inventoryFid,-1,0x7fffffff,'Inventory FID');
  integer(draft.material,0,7,'Material');
  integer(draft.size,0,10000,'Volume');
  integer(draft.weight,0,100000,'Weight');
  integer(draft.cost,0,100000000,'Cost');
  if(draft.subtype==='key')integer(draft.keyCode,-1,0x7fffffff,'Key code');
  else if(draft.subtype==='misc')integer(draft.charges,0,1000000,'Charges');
  else problems.push('Only original Key and Misc items can be authored in v0.8.');
  const artRow=art?.lines[draft.artIndex];
  const artName=artRow?.status==='entry'?artRow.token:'(not registered)';
  if(art && (!artRow||artRow.status!=='entry'))problems.push('Selected art index is not a registered filename in the selected art list.');
  if(artRow?.token&&!/^[a-zA-Z0-9_-]{1,8}\.frm$/i.test(artRow.token))
    warnings.push('Art filename does not satisfy the editor 8.3 FRM authoring subset.');
  if(proto){
    try{buildPrototypeList(proto);}
    catch(error){problems.push((error as Error).message);}
  }
  if(existingMessages?.has(messageId)||existingMessages?.has(messageId+1))
    problems.push('Name/description message IDs overlap selected pro_item.msg entries.');
  if(!existingMessages)warnings.push('No pro_item.msg baseline loaded: name/description ID collisions are NOT verified.');
  if(!title||!description)warnings.push('Prototype text requires valid name and description before preview.');
  warnings.push('PRO, proto/items/items.lst and pro_item.msg are separate dependencies. This is a review bundle, not an in-game item or installer.');
  return {filename:file,pid:id,pidHex:fidHex(id),messageId,fid:draft.artIndex,problems,warnings,artName};
}
export function createItemPro(draft:ItemDraft,review:PrototypeReview):Uint8Array {
  ok(review.problems.length===0,'correct all registry and text validation errors before serializing.');
  ok(review.pid>=1&&review.pid<=MAX_PROTO_NUMBER,'invalid PID.');
  const out=new Uint8Array(draft.subtype==='key'?61:69);
  const v=new DataView(out.buffer);
  v.setUint32(0,review.pid,false);
  v.setInt32(4,review.messageId,false);
  v.setUint32(8,review.fid,false);
  v.setInt32(12,0,false);v.setInt32(16,0,false); // no emitted light
  v.setUint32(20,0,false); // no assumptions about collision/visibility flags
  v.setUint32(24,draft.subtype==='key'?0x1000:0,false);
  v.setInt32(28,-1,false); // no attached script
  v.setInt32(32,draft.subtype==='key'?6:5,false);
  v.setInt32(36,draft.material,false);v.setInt32(40,draft.size,false);
  v.setInt32(44,draft.weight,false);v.setInt32(48,draft.cost,false);
  v.setInt32(52,draft.inventoryFid,false);v.setUint8(56,0);
  if(draft.subtype==='key')v.setInt32(57,draft.keyCode,false);
  else {v.setInt32(57,-1,false);v.setInt32(61,20,false);v.setInt32(65,draft.charges,false);}
  const parsed=parseItemPrototype(out);
  ok(parsed.pid===review.pid&&parsed.fid===review.fid&&parsed.messageId===review.messageId,
    'round-trip item PRO verification failed.');
  return out;
}
export function proposalMessages(draft:ItemDraft,review:PrototypeReview):Uint8Array {
  ok(review.problems.length===0,'fix message validation errors first.');
  safeMsgText(draft.title,'Name');safeMsgText(draft.description,'Description');
  return enc.encode('{'+review.messageId+'}{}{'+draft.title+'}\r\n{'+(review.messageId+1)+'}{}{'+draft.description+'}\r\n');
}
export function parseMessageIds(input:Uint8Array):Set<number> {
  ok(input.length<=MAX_PRO_LIST_BYTES,'pro_item.msg exceeds the 2 MiB limit.');
  const text=dec.decode(input);
  const ids=new Set<number>();
  for(const line of text.split(/\r?\n/)){
    const trimmed=line.trim();
    if(!trimmed||trimmed.startsWith('#')||trimmed.startsWith('//'))continue;
    const m=/^\{(\d+)\}\{[^}]*\}\{[^}]*\}$/.exec(trimmed);
    ok(!!m,'pro_item.msg has an unsupported line; collision checks would be unreliable.');
    const id=Number(m[1]);
    ok(Number.isSafeInteger(id),'message ID exceeds supported range.');
    ok(!ids.has(id),'pro_item.msg contains duplicate message IDs.');
    ids.add(id);
  }
  return ids;
}
export function makeReviewNotes(draft:ItemDraft,review:PrototypeReview):string {
  return [
    'WASTELAND WORKSHOP | ITEM PROTOTYPE REVIEW ONLY',
    '================================================',
    'New key/misc item prototype: '+review.filename,
    'PID: '+review.pidHex+' ('+review.pid+')',
    'World item art FID: '+fidHex(review.fid)+' → '+review.artName,
    'Name/description IDs: '+review.messageId+' / '+(review.messageId+1),
    'Subtype: '+draft.subtype,
    'Status: NOT INSTALLATION READY',
    '',
    'This package contains separate proposals for:',
    '  reference/proto/items/items.proposed.lst',
    '  reference/proto/items/'+review.filename,
    '  reference/messages/pro_item.additions.msg',
    '',
    'Manual integration required: verify/protect the original proto/items/items.lst,',
    'art/items/items.lst, pro_item.msg and any relevant overrides. Confirm',
    'that scripts, game assets, inventory art, engine flags and rules',
    'match your target game installation. No original game files were changed.',
    '',
    ...review.warnings.map(x=>'WARNING: '+x),
    '',
  ].join('\n');
}
