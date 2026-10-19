import { useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowDownToLine, CheckCircle2, CircleAlert, FileCode2,
  FileText, FolderOpen, Info, KeyRound, Link2, PackageCheck,
  ShieldCheck, Upload,
} from 'lucide-react';
import { fidHex, parseArtList, demoArtList, MAX_LST_BYTES, type ArtList } from '../registry/core';
import { makeZip } from '../packager/zip';
import { makePrototypeHandoff, type PrototypeHandoff } from '../packager/prototypeBridge';
import {
  createItemPro, defaultDraft, buildPrototypeList, getNextPrototype, makeDemoPrototypeList,
  makeReviewNotes, parseItemPrototype, parseMessageIds, parsePrototypeList,
  proposalMessages, reviewDraft, type ItemDraft, type ItemInspection,
  type PrototypeList, type TargetGame,
} from './core';
import './prototype.css';

const enc = new TextEncoder();
const errText=(err:unknown)=>err instanceof Error?err.message:'Operation failed.';
function download(name:string,source:Uint8Array,type='application/octet-stream') {
  const bytes = new Uint8Array(new ArrayBuffer(source.length)); bytes.set(source);
  const url=URL.createObjectURL(new Blob([bytes],{type}));
  const link=document.createElement('a');link.download=name;link.href=url;
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1200);
}
async function sha256(data:Uint8Array) {
  if(!crypto?.subtle)throw new Error('SHA-256 unavailable. Use a secure browser context.');
  const copy=new Uint8Array(new ArrayBuffer(data.length));copy.set(data);
  const digest=await crypto.subtle.digest('SHA-256',copy);
  return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export default function PrototypeWorkshop({onStage}:{onStage:(handoff:PrototypeHandoff)=>void}) {
  const [target,setTarget]=useState<TargetGame>('fo1');
  const [proto,setProto]=useState<PrototypeList|null>(null);
  const [art,setArt]=useState<ArtList|null>(null);
  const [messages,setMessages]=useState<Set<number>|undefined>();
  const [messageName,setMessageName]=useState('');
  const [draft,setDraft]=useState<ItemDraft>(defaultDraft);
  const [inspection,setInspection]=useState<{filename:string;item:ItemInspection}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const protoRef=useRef<HTMLInputElement>(null);
  const artRef=useRef<HTMLInputElement>(null);
  const msgRef=useRef<HTMLInputElement>(null);
  const existingRef=useRef<HTMLInputElement>(null);
  const review=useMemo(()=>reviewDraft(draft,proto,art,messages),[draft,proto,art,messages]);
  const valid=review.problems.length===0;
  const change=<K extends keyof ItemDraft>(key:K,value:ItemDraft[K])=>setDraft(d=>({...d,[key]:value}));
  function resetMessages(){setError('');setNotice('');}
  function openDemo(){
    setProto(makeDemoPrototypeList());setArt(demoArtList());setMessages(undefined);setMessageName('');
    setDraft(defaultDraft());setInspection(null);resetMessages();
    setNotice('Original synthetic proto/items and art/items lists loaded. Proposed PID 4, art FID 0. No game content used.');
  }
  async function openProto(file:File|undefined){
    if(!file)return;resetMessages();
    try{
      if(file.name.toLowerCase()!=='items.lst')throw Error('Choose proto/items/items.lst, not an art or scripts list.');
      if(file.size>2*1024*1024)throw Error('Prototype list exceeds 2 MiB limit.');
      const parsed=parsePrototypeList(new Uint8Array(await file.arrayBuffer()),file.name);
      setProto(parsed);setNotice('Prototype baseline loaded read-only. Next candidate uses one-based physical index '+getNextPrototype(parsed)+'.');
    }catch(err){setError(errText(err));}
  }
  async function openArt(file:File|undefined){
    if(!file)return;resetMessages();
    try{
      if(!/^(?:items|items\.proposed)\.lst$/i.test(file.name))throw Error('Choose art/items/items.lst or its proposed copy.');
      if(file.size>MAX_LST_BYTES)throw Error('Art LST exceeds 2 MiB.');
      const loaded=parseArtList(new Uint8Array(await file.arrayBuffer()),file.name);
      setArt(loaded);setNotice('Art baseline loaded read-only. FID positions use zero-based physical indexes.');
    }catch(err){setError(errText(err));}
  }
  async function openMessages(file:File|undefined){
    if(!file)return;resetMessages();
    try{
      if(file.name.toLowerCase()!=='pro_item.msg')throw Error('Choose the actual pro_item.msg baseline, not a dialogue MSG file.');
      if(file.size>2*1024*1024)throw Error('Message file exceeds 2 MiB.');
      const ids=parseMessageIds(new Uint8Array(await file.arrayBuffer()));
      setMessages(ids);setMessageName(file.name);
      setNotice(ids.size+' existing pro_item.msg IDs indexed. Any name/description collision now blocks export.');
    }catch(err){setError(errText(err));}
  }
  async function inspectPro(file:File|undefined){
    if(!file)return;resetMessages();
    try{
      if(!/\.pro$/i.test(file.name))throw Error('Choose a .PRO file.');
      if(file.size>1024*1024||file.size<57)throw Error('Supported item PRO inspection requires 57 bytes to 1 MiB.');
      const item=parseItemPrototype(new Uint8Array(await file.arrayBuffer()));
      setInspection({filename:file.name,item});
      setNotice('Item prototype inspected in read-only mode. No binary was changed.');
    }catch(err){setError(errText(err));}
  }
  function proposedBytes(){
    if(!proto)throw Error('Choose prototype baseline first.');
    if(!valid)throw Error(review.problems.join(' '));
    return {pro:createItemPro(draft,review),lst:buildPrototypeList(proto),
      msg:proposalMessages(draft,review),notes:enc.encode(makeReviewNotes(draft,review))};
  }
  function downloadPro(){
    resetMessages();
    try{
      const data=proposedBytes();download(review.filename,data.pro);
      setNotice('Standalone PRO candidate downloaded. It is NOT registered in-game.');
    }catch(err){setError(errText(err));}
  }
  async function downloadReview(){
    if(busy)return;setBusy(true);resetMessages();
    try{
      if(!proto||!art)throw Error('Select both baselines.');
      const data=proposedBytes();
      const hashes={
        prototypeOriginal:await sha256(proto.original), prototypeProposed:await sha256(data.lst),
        artOriginal:await sha256(art.original), proposedPro:await sha256(data.pro),
        messageAdditions:await sha256(data.msg),
      };
      const report={
        schema:'wws.prototype-review.v1',version:'0.8.0',target,installReady:false,
        protoSource:proto.filename,artSource:art.name,
        messageBaseline:messageName||'NOT SUPPLIED',messageCollisionVerified:!!messages,
        newPid:review.pidHex,newPrototypeFilename:review.filename,
        artFid:fidHex(review.fid),artFilename:review.artName,
        messageIds:[review.messageId,review.messageId+1],
        type:draft.subtype,hashes,warnings:review.warnings,
      };
      const zip=makeZip([
        {path:'reference/proto/items/'+review.filename,bytes:data.pro},
        {path:'reference/proto/items/items.proposed.lst',bytes:data.lst},
        {path:'reference/messages/pro_item.additions.msg',bytes:data.msg},
        {path:'prototype-report.json',bytes:enc.encode(JSON.stringify(report,null,2)+'\n')},
        {path:'REVIEW_NOT_INSTALL.txt',bytes:data.notes},
      ]);
      download('wasteland-prototype-'+target+'-review.zip',zip,'application/zip');
      setNotice('Review ZIP downloaded with SHA-256 receipts, PRO binary, LST append proposal, and MSG additions. No game files modified.');
    }catch(err){setError(errText(err));}finally{setBusy(false);}
  }
  function sendToPackager(){
    resetMessages();
    try{onStage(makePrototypeHandoff(target,draft,proto,art,messages));}
    catch(error){setError(errText(error));}
  }
  const selectedArt=art?.lines[draft.artIndex];
  return <section className="proto-page">
    <p className="eyebrow"><span className="tiny-line"/> OBJECT DEFINITIONS / CLASSIC ERA</p>
    <div className="proto-hero">
      <div><h1 className="page-title">Prototype <em>Workshop.</em></h1>
        <p className="page-description">Connect a Fallout 1/2 item PID to its zero-based artwork FID and \`pro_item.msg\` name and description. Author original Key and Misc prototypes with a carefully bounded, review-first workflow.</p></div>
      <span className="proto-safety"><ShieldCheck size={16}/> ORIGINAL SOURCES READ ONLY</span>
    </div>
    <div className="proto-input-panel">
      <div className="proto-load-head"><Archive size={25}/><div><strong>LOAD REFERENCES</strong><span>Two separate LST files plus optional message collision checking.</span></div></div>
      <label className="proto-target"><span>GAME</span><select value={target} onChange={e=>setTarget(e.target.value as TargetGame)}>
        <option value="fo1">Fallout 1</option><option value="fo2">Fallout 2</option></select></label>
      <button className="btn btn-primary" onClick={openDemo}><FileText size={15}/> DEMO BASELINES</button>
      <button className="btn btn-outline" onClick={()=>protoRef.current?.click()}><Upload size={15}/> PROTO ITEMS.LST</button>
      <button className="btn btn-outline" onClick={()=>artRef.current?.click()}><Upload size={15}/> ART ITEMS.LST</button>
      <button className="btn btn-outline" onClick={()=>msgRef.current?.click()}><Upload size={15}/> PRO_ITEM.MSG</button>
      <input ref={protoRef} className="visually-hidden" type="file" accept=".lst" onChange={e=>{const f=e.target.files?.[0];e.target.value='';void openProto(f);}}/>
      <input ref={artRef} className="visually-hidden" type="file" accept=".lst" onChange={e=>{const f=e.target.files?.[0];e.target.value='';void openArt(f);}}/>
      <input ref={msgRef} className="visually-hidden" type="file" accept=".msg" onChange={e=>{const f=e.target.files?.[0];e.target.value='';void openMessages(f);}}/>
    </div>
    {error&&<div className="proto-alert error" role="alert"><CircleAlert size={16}/>{error}</div>}
    {notice&&<div className="proto-alert success" role="status"><CheckCircle2 size={16}/>{notice}</div>}
    <div className="proto-metrics">
      <span>PROTOTYPE BASELINE <strong>{proto?proto.entries.length+' entries':'NOT LOADED'}</strong></span>
      <span>ART BASELINE <strong>{art?art.lines.length+' lines':'NOT LOADED'}</strong></span>
      <span>PROPOSED PID <strong>{review.pid?review.pidHex:'UNASSIGNED'}</strong></span>
      <span>PROPOSED FID <strong>{fidHex(draft.artIndex)}</strong></span>
      <span>MESSAGE COLLISIONS <strong>{messages?'CHECKED':'NOT VERIFIED'}</strong></span>
    </div>
    <div className="proto-layout">
      <div className="proto-main">
        <div className="panel">
          <div className="panel-heading"><div><KeyRound size={16}/><strong>ORIGINAL ITEM DEFINITION</strong></div><span>AUTHORING SUBSET</span></div>
          <div className="proto-form">
            <label className="field"><span>ITEM SUBTYPE</span><select value={draft.subtype} onChange={e=>change('subtype',e.target.value as ItemDraft['subtype'])}>
              <option value="key">Key / 61-byte PRO</option><option value="misc">Miscellaneous / 69-byte PRO</option></select></label>
            <label className="field"><span>DISPLAY NAME</span><input maxLength={160} value={draft.title} onChange={e=>change('title',e.target.value)}/></label>
            <label className="field proto-wide"><span>DESCRIPTION</span><textarea maxLength={160} rows={2} value={draft.description} onChange={e=>change('description',e.target.value)}/></label>
            <label className="field"><span>ART FID INDEX (ZERO-BASED)</span>
              <input type="number" min="0" max="4095" value={draft.artIndex} onChange={e=>change('artIndex',Number(e.target.value))}/></label>
            <div className="proto-art-lookup"><span>RESOLVED ART RESOURCE</span><strong>{selectedArt?.token||'NOT REGISTERED'}</strong><small>{selectedArt?'Physical art list line '+selectedArt.index:'Choose an existing art index'}</small></div>
            <label className="field"><span>MATERIAL (0–7)</span><input type="number" min="0" max="7" value={draft.material} onChange={e=>change('material',Number(e.target.value))}/></label>
            <label className="field"><span>INVENTORY FID (-1 = NONE)</span><input type="number" min="-1" value={draft.inventoryFid} onChange={e=>change('inventoryFid',Number(e.target.value))}/></label>
            <label className="field"><span>WEIGHT</span><input type="number" min="0" value={draft.weight} onChange={e=>change('weight',Number(e.target.value))}/></label>
            <label className="field"><span>VALUE / COST</span><input type="number" min="0" value={draft.cost} onChange={e=>change('cost',Number(e.target.value))}/></label>
            <label className="field"><span>SIZE / VOLUME</span><input type="number" min="0" value={draft.size} onChange={e=>change('size',Number(e.target.value))}/></label>
            {draft.subtype==='key'?<label className="field"><span>KEY CODE (-1 = NONE)</span><input type="number" value={draft.keyCode} onChange={e=>change('keyCode',Number(e.target.value))}/></label>
              :<label className="field"><span>CHARGES</span><input type="number" min="0" value={draft.charges} onChange={e=>change('charges',Number(e.target.value))}/></label>}
          </div>
          <div className="proto-author-note"><Info size={17}/><p>Keys use a 61-byte prototype, Misc items 69 bytes. All other subtypes remain inspection-only. Script ID defaults to -1, and unconfigured engine flags are not guessed. Real-game behavior still requires validation.</p></div>
        </div>
        <div className="panel">
          <div className="panel-heading"><div><FileCode2 size={16}/><strong>EXISTING ITEM PRO INSPECTOR</strong></div><span>READ ONLY</span></div>
          <div className="proto-inspect">
            <button className="btn btn-outline" onClick={()=>existingRef.current?.click()}><FolderOpen size={15}/> OPEN A LOCAL .PRO</button>
            <input ref={existingRef} className="visually-hidden" type="file" accept=".pro" onChange={e=>{const f=e.target.files?.[0];e.target.value='';void inspectPro(f);}}/>
            {inspection?<div className="proto-inspect-grid">
              <strong>{inspection.filename}</strong>
              <span>PID</span><b>{inspection.item.pidHex}</b>
              <span>Subtype</span><b>{inspection.item.subtypeName} ({inspection.item.subtype})</b>
              <span>World FID</span><b>{inspection.item.fidHex}</b>
              <span>Message ID</span><b>{inspection.item.messageId}</b>
              <span>Inventory FID</span><b>{inspection.item.inventoryFid}</b>
              <span>Weight / Cost</span><b>{inspection.item.weight} / {inspection.item.cost}</b>
              <span>Bytes</span><b>{inspection.item.length} (documented {inspection.item.expectedLength})</b>
              <small>Inspection never changes the original PRO. Only common item fields and Key/Misc details are decoded; other subtypes are not editable.</small>
            </div>:<p>Open an existing item PRO to inspect its binary fields and compare PID, FID, and message references. No game assets included.</p>}
          </div>
        </div>
      </div>
      <div className="proto-side">
        <div className="panel">
          <div className="panel-heading"><div><Link2 size={16}/><strong>REFERENCE CONNECTIONS</strong></div><span>TRACE</span></div>
          <div className="proto-links">
            <div><small>01 / PROTOTYPE NUMBER</small><strong>{proto?getNextPrototype(proto):'—'}</strong><span>One-based proto/items/items.lst append</span></div>
            <div><small>02 / PROTOTYPE BINARY</small><strong>{review.filename}</strong><span>{draft.subtype.toUpperCase()} subtype</span></div>
            <div><small>03 / WORLD ART FID</small><strong>{fidHex(review.fid)}</strong><span>{review.artName}</span></div>
            <div><small>04 / PRO_ITEM.MSG IDS</small><strong>{review.messageId||'—'} / {review.messageId?review.messageId+1:'—'}</strong><span>Name + description; collision {messages?'checked':'not checked'}</span></div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-heading"><div><ShieldCheck size={16}/><strong>VALIDATION & REVIEW</strong></div><span>SAFETY GATE</span></div>
          <div className={'proto-gate '+(valid?'good':'blocked')}>
            {valid?<CheckCircle2 size={24}/>:<CircleAlert size={24}/>}
            <div><strong>{valid?'READY FOR REVIEW':'EXPORT BLOCKED'}</strong><span>{review.problems.length} blocking issues / {review.warnings.length} warnings</span></div>
          </div>
          <div className="proto-issues">
            {review.problems.map((e,i)=><p key={'e'+i} className="problem"><CircleAlert size={13}/>{e}</p>)}
            {review.warnings.map((e,i)=><p key={'w'+i}><Info size={13}/>{e}</p>)}
          </div>
          <div className="proto-manifest-list">
            <strong>REVIEW BUNDLE CONTENTS</strong>
            <code>reference/proto/items/{review.filename}</code>
            <code>reference/proto/items/items.proposed.lst</code>
            <code>reference/messages/pro_item.additions.msg</code>
            <code>prototype-report.json</code><code>REVIEW_NOT_INSTALL.txt</code>
          </div>
          <div className="proto-export">
            <button className="btn btn-primary btn-full" disabled={!valid||busy} onClick={()=>void downloadReview()}>
              <PackageCheck size={16}/>{busy?'BUILDING REVIEW BUNDLE…':'DOWNLOAD PROTOTYPE REVIEW ZIP'}</button>
            <button className="btn btn-outline btn-full" disabled={!valid||busy} onClick={sendToPackager}>
              <Link2 size={16}/> SEND PROTOTYPE REFERENCES TO MOD PACKAGER</button>
            <button className="btn btn-outline btn-full" disabled={!valid||busy} onClick={downloadPro}>
              <ArrowDownToLine size={16}/> DOWNLOAD STANDALONE .PRO</button>
            <p>All output is reference-only. The review ZIP includes SHA-256 receipts and does not install, edit or merge game files.</p>
          </div>
        </div>
      </div>
    </div>
    <div className="proto-bottom"><ShieldCheck size={19}/><p><strong>REGISTRY BEFORE EGO.</strong> A PRO file by itself does not create a game item. Correct prototype-list registration, art availability, message IDs, scripts and engine behavior must all be verified separately with an owned game.</p></div>
  </section>;
}
