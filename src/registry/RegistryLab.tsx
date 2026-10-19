import { useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowDownToLine, CheckCircle2, CircleAlert,
  FilePlus2, FileText, FolderOpen, Info, Link2, PackageCheck,
  Plus, Search, ShieldCheck, Trash2, Upload,
} from 'lucide-react';
import { SPRITE_STORAGE_KEY, fromSpriteJson } from '../archive/spriteProject';
import { makeZip } from '../packager/zip';
import {
  MAX_ART_INDEX, MAX_LST_BYTES, analyzeRegistry, buildPatchedList, demoArtList,
  fidHex, makePatchNotes, parseArtList, parseFidInput, parseProHeader,
  validateNewArtName, type ArtList, type RegistryCandidate,
} from './core';
import './registry.css';

const encoder = new TextEncoder();
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
const pretty = (error:unknown) => error instanceof Error ? error.message : 'Registry operation failed.';
function download(name:string, source:Uint8Array, contentType:string) {
  const bytes=new Uint8Array(new ArrayBuffer(source.length));
  bytes.set(source);
  const url=URL.createObjectURL(new Blob([bytes],{type:contentType}));
  const link=document.createElement('a');
  link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1200);
}
async function sha256(bytes:Uint8Array):Promise<string>{
  if(!crypto?.subtle) throw new Error('This browser cannot calculate secure SHA-256 receipts.');
  const copy=new Uint8Array(new ArrayBuffer(bytes.byteLength));copy.set(bytes);
  const hashed=await crypto.subtle.digest('SHA-256',copy);
  return [...new Uint8Array(hashed)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
type ProDetails=ReturnType<typeof parseProHeader>;
export default function RegistryLab() {
  const inputRef=useRef<HTMLInputElement>(null);
  const proRef=useRef<HTMLInputElement>(null);
  const [baseline,setBaseline]=useState<ArtList|null>(null);
  const [demo,setDemo]=useState(false);
  const [target,setTarget]=useState<'fo1'|'fo2'>('fo1');
  const [candidates,setCandidates]=useState<RegistryCandidate[]>([]);
  const [entryName,setEntryName]=useState('NEWITEM.FRM');
  const [fidInput,setFidInput]=useState('0x00000000');
  const [proInfo,setProInfo]=useState<{name:string;details:ProDetails}|null>(null);
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const report=useMemo(()=>analyzeRegistry(baseline,candidates),[baseline,candidates]);
  const ready=report.errors.length===0;
  const lines=useMemo(()=>{
    if(!baseline)return [];
    const term=search.trim().toLowerCase();
    return baseline.lines.filter(row=>!term || row.token.toLowerCase().includes(term)
      || String(row.index)===term).slice(0,160);
  },[baseline,search]);
  const resolution=useMemo(()=>{
    try {
      const fid=parseFidInput(fidInput);
      if(fid.type!==0)return {error:'This FID uses art type '+fid.type+'. The editor currently handles only art/items type 0.'};
      const row=baseline?.lines[fid.index];
      const proposed=report.additions.find(item=>item.index===fid.index);
      return {index:fid.index,token:row?.token || proposed?.filename || '(unassigned / reserved)',hex:fid.hex,
        status:row ? (row.status==='entry'?'ORIGINAL BASELINE':'RESERVED ORIGINAL SLOT')
          : proposed?'PROPOSED APPEND':'NOT PRESENT'};
    }catch(err){return {error:pretty(err)};}
  },[fidInput,baseline,report]);

  function resetMessages(){setError('');setNotice('');}
  async function loadLst(file:File|undefined){
    if(!file)return;
    resetMessages();
    try {
      if(file.name.toLowerCase()!=='items.lst')
        throw new Error('Choose an art/items/items.lst file, not a scripts/prototype/other LST.');
      if(file.size>MAX_LST_BYTES)throw new Error('LST exceeds 2 MiB safety budget.');
      const parsed=parseArtList(new Uint8Array(await file.arrayBuffer()),file.name);
      setBaseline(parsed);setDemo(false);setCandidates([]);setProInfo(null);
      setSearch('');setFidInput('0x00000000');
      setNotice('Loaded local items.lst for read-only analysis. Its original bytes are preserved.');
    }catch(err){setError(pretty(err));}
  }
  function demoBaseline(){
    resetMessages();
    setBaseline(demoArtList());setDemo(true);setCandidates([]);setProInfo(null);
    setSearch('');setFidInput('0x00000000');
    setNotice('Loaded an entirely original synthetic items.lst demonstration.');
  }
  function addCandidate(name:string,origin:RegistryCandidate['origin']='manual'){
    resetMessages();
    try{
      const safe=validateNewArtName(name);
      const id=uid();
      const next=[...candidates,{id,filename:safe,origin}];
      const issues=analyzeRegistry(baseline,next);
      if(issues.errors.length)throw new Error(issues.errors.join(' '));
      setCandidates(next);
      setEntryName('');
      setNotice('Reserved proposed index '+issues.additions[issues.additions.length-1].index+'. Source LST remains unchanged.');
    }catch(err){setError(pretty(err));}
  }
  function addSavedSprite(){
    resetMessages();
    try {
      const raw=localStorage.getItem(SPRITE_STORAGE_KEY);
      if(!raw)throw new Error('No saved Sprite Lab project in this browser.');
      const project=fromSpriteJson(raw);
      const stem=project.name.toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,8)||'ITEM';
      addCandidate(stem+'.FRM','sprite-lab');
    }catch(err){setError(pretty(err));}
  }
  async function readPro(file:File|undefined){
    if(!file)return;
    resetMessages();
    try{
      if(!/\.pro$/i.test(file.name))throw new Error('Select a read-only .PRO file.');
      if(file.size<12 || file.size>1024*1024)throw new Error('PRO resource must be 12 bytes to 1 MiB.');
      const details=parseProHeader(new Uint8Array(await file.slice(0,12).arrayBuffer()));
      setProInfo({name:file.name,details});
      setFidInput(details.fid.hex);
      setNotice('Inspected only the 12-byte PRO header. No prototype was changed.');
    }catch(err){setError(pretty(err));}
  }
  function prepared():{patched:Uint8Array;notes:string}{
    if(!baseline)throw new Error('Load the original baseline first.');
    const patched=buildPatchedList(baseline,candidates);
    const notes=makePatchNotes(baseline,report);
    return {patched,notes};
  }
  function exportLst(){
    resetMessages();
    try{
      const {patched}=prepared();
      download('items.proposed.lst',patched,'text/plain');
      setNotice('Downloaded a proposed copy. Original items.lst was not edited or replaced.');
    }catch(err){setError(pretty(err));}
  }
  async function exportReviewZip(){
    if(busy)return;
    resetMessages();setBusy(true);
    try{
      if(!baseline)throw new Error('Select a baseline first.');
      const {patched,notes}=prepared();
      const manifest={
        schema:'wws.items-registry-proposal.v1',tool:'Wasteland Workshop Studio',version:'0.7.0',
        targetList:'art/items/items.lst',targetGame:target,source:demo?'ORIGINAL_SYNTHETIC_DEMO':'USER_SELECTED_LOCAL_LIST',
        originalFile:baseline.name,originalPhysicalLines:baseline.lines.length,
        resultPhysicalLines:baseline.lines.length+candidates.length,installReady:false,
        originalSha256:await sha256(baseline.original),proposedSha256:await sha256(patched),
        additions:report.additions,warnings:report.warnings,
        contents:'reference-only; manual game-specific integration required',
      };
      const zip=makeZip([
        {path:'reference/registry/items.proposed.lst',bytes:patched},
        {path:'registry-report.json',bytes:encoder.encode(JSON.stringify(manifest,null,2)+'\n')},
        {path:'PATCH_NOTES.txt',bytes:encoder.encode(notes)},
      ]);
      download('wasteland-items-registry-review.zip',zip,'application/zip');
      setNotice('Review ZIP downloaded with original/patch SHA-256 receipts. It cannot install changes into the game.');
    }catch(err){setError(pretty(err));}
    finally{setBusy(false);}
  }
  const pendingIndex=(baseline?.lines.length??0)+candidates.length;
  return <section className="registry-page">
    <p className="eyebrow"><span className="tiny-line"/> ASSET REGISTRATION / CLASSIC ERA</p>
    <div className="registry-hero">
      <div><h1 className="page-title">Classic Resource <em>Registry.</em></h1>
        <p className="page-description">Understand indexed Fallout artwork references, inspect existing FIDs and prototypes, and propose safe append-only changes to <code>art/items/items.lst</code>.</p></div>
      <span className="registry-safety"><ShieldCheck size={17}/> APPEND ONLY · READ ONLY SOURCE</span>
    </div>
    <div className="registry-inputs">
      <div className="registry-intro"><Archive size={29}/><div><strong>CHOOSE AN ART ITEMS REGISTRY</strong><span>Local game file or synthetic demo. No uploads, originals never overwritten.</span></div></div>
      <label className="registry-target"><span>TARGET GAME</span><select aria-label="Classic target game" value={target} onChange={event=>setTarget(event.target.value as 'fo1'|'fo2')}><option value="fo1">Fallout 1</option><option value="fo2">Fallout 2</option></select></label>
      <button className="btn btn-primary" onClick={()=>inputRef.current?.click()}><Upload size={16}/> OPEN ITEMS.LST</button>
      <button className="btn btn-outline" onClick={demoBaseline}><FileText size={16}/> DEMO REGISTRY</button>
      <input ref={inputRef} type="file" accept=".lst" className="visually-hidden"
        onChange={event=>{const file=event.target.files?.[0];event.target.value='';void loadLst(file);}}/>
    </div>
    {error&&<div className="registry-alert red" role="alert"><CircleAlert size={17}/><span>{error}</span></div>}
    {notice&&<div className="registry-alert green" role="status"><CheckCircle2 size={17}/><span>{notice}</span></div>}
    <div className="registry-metrics">
      <span>BASELINE <strong>{baseline?baseline.name:'NOT LOADED'}</strong></span>
      <span>PHYSICAL LINES <strong>{baseline?.lines.length??0}</strong></span>
      <span>PROPOSED <strong>{candidates.length}</strong></span>
      <span>NEXT INDEX <strong>{baseline?pendingIndex:'—'}</strong></span>
      <span>FID CAPACITY <strong>0–{MAX_ART_INDEX}</strong></span>
    </div>
    <div className="registry-layout">
      <div className="registry-primary">
        <div className="panel">
          <div className="panel-heading"><div><FolderOpen size={16}/><strong>EXISTING ART INDEX</strong></div><span>01 / 03</span></div>
          {!baseline?<div className="registry-empty"><FileText size={33}/><strong>NO BASELINE OPEN</strong><p>Choose your own items.lst or use the synthetic demo. We won't manufacture a retail index or replace any existing lines.</p></div>:<>
            <div className="registry-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search existing filename or zero-based index..." aria-label="Search LST entries"/></div>
            <div className="registry-list-legend"><span>INDEX</span><span>FIRST TOKEN FROM PHYSICAL LINE</span><span>FID</span></div>
            <div className="registry-existing-list">
              {lines.map(row=><button key={row.index} className="registry-line" disabled={row.index>MAX_ART_INDEX} onClick={()=>setFidInput(fidHex(row.index))}>
                <span>{row.index.toString().padStart(4,'0')}</span>
                <strong className={row.status==='reserved'?'muted':''}>{row.token||'[RESERVED / EMPTY TOKEN]'}</strong>
                <span>{row.index<=MAX_ART_INDEX?fidHex(row.index):'OUT OF RANGE'}</span>
              </button>)}
              {!lines.length&&<p className="registry-list-none">No matching records.</p>}
            </div>
            <p className="registry-list-foot">Showing up to 160 matching physical lines. Blank/comment-only lines remain counted and retain their original indexes.</p>
          </>}
        </div>
        <div className="panel">
          <div className="panel-heading"><div><Plus size={16}/><strong>PROPOSED NEW ITEM ART</strong></div><span>02 / 03</span></div>
          <div className="registry-add">
            <label className="field"><span>8.3 FRM FILENAME</span><input value={entryName} maxLength={12} placeholder="NEWITEM.FRM" onChange={event=>setEntryName(event.target.value)}/></label>
            <button className="btn btn-primary" disabled={!baseline} onClick={()=>addCandidate(entryName)}><Plus size={15}/> APPEND CANDIDATE</button>
            <button className="btn btn-outline" disabled={!baseline} onClick={addSavedSprite}><FilePlus2 size={15}/> USE SAVED SPRITE LAB ART</button>
          </div>
          <div className="registry-pending-head"><strong>APPEND-ONLY CHANGES</strong><span>{candidates.length} REQUESTED</span></div>
          {!candidates.length?<p className="registry-list-none">No proposed additions. Add an original sprite's FRM filename to calculate its future FID.</p>:<div className="registry-candidates">
            {candidates.map((candidate,index)=>{
              const info=report.additions.find(a=>a.index===(baseline?.lines.length??0)+index);
              return <div className="registry-proposal" key={candidate.id}>
                <div><strong>{candidate.filename}</strong><small>{candidate.origin==='sprite-lab'?'FROM SAVED SPRITE LAB':'MANUAL CANDIDATE'} · ART/ITEMS</small></div>
                <span>INDEX {info?.index??'?'}<b>{info?.fidHex??'INVALID'}</b></span>
                <button aria-label={'Remove '+candidate.filename} onClick={()=>setCandidates(items=>items.filter(x=>x.id!==candidate.id))}><Trash2 size={17}/></button>
              </div>;
            })}
          </div>}
          <div className="registry-integration"><Info size={17}/><p>Adding a filename does not create a prototype or install artwork. Export a matching FRM through Sprite Lab, then verify list placement, FIDs, PRO references and game behavior.</p></div>
        </div>
      </div>
      <div className="registry-secondary">
        <div className="panel">
          <div className="panel-heading"><div><Link2 size={16}/><strong>FID / PRO INSPECTOR</strong></div><span>03 / 03</span></div>
          <div className="registry-inspector">
            <label className="field"><span>ART FID (DECIMAL OR 0x HEX)</span><input value={fidInput} onChange={e=>setFidInput(e.target.value)} placeholder="0x0000002A"/></label>
            {'error' in resolution?<div className="registry-resolution-warning">{resolution.error}</div>:<>
              <div className="registry-resolution"><span>ART TYPE / INDEX</span><strong>{0} / {resolution.index}</strong>
                <span>RESOURCE</span><strong>{resolution.token}</strong>
                <span>REFERENCE</span><strong>{resolution.hex}</strong>
                <small>{resolution.status}</small>
              </div>
            </>}
            <button className="btn btn-outline btn-full" onClick={()=>proRef.current?.click()}><Upload size={15}/> INSPECT LOCAL .PRO HEADER</button>
            <input ref={proRef} type="file" accept=".pro" className="visually-hidden"
              onChange={event=>{const file=event.target.files?.[0];event.target.value='';void readPro(file);}}/>
            {proInfo&&<div className="registry-pro-details"><strong>{proInfo.name}</strong>
              <span>PID: {proInfo.details.pidHex} / PRO TYPE {proInfo.details.prototypeType}</span>
              <span>MESSAGE ID: {proInfo.details.messageId}</span>
              <span>ART FID: {proInfo.details.fid.hex}</span>
              <p>Only the first 12 bytes were read. This is a reference inspector, not a complete PRO validator or editor.</p>
            </div>}
          </div>
        </div>
        <div className="panel">
          <div className="panel-heading"><div><ShieldCheck size={16}/><strong>REGISTRY SAFETY GATE</strong></div><span>REVIEW</span></div>
          <div className={'registry-gate '+(ready?'good':'blocked')}>
            {ready?<CheckCircle2 size={23}/>:<CircleAlert size={23}/>}
            <div><strong>{ready?'READY FOR REVIEW EXPORT':'EXPORT BLOCKED'}</strong><span>{report.errors.length} blocking problem(s) · {report.warnings.length} caution(s)</span></div>
          </div>
          <div className="registry-warnings">
            {report.errors.map((error,i)=><p className="red" key={'e'+i}><CircleAlert size={13}/>{error}</p>)}
            {report.warnings.slice(0,9).map((warn,i)=><p key={'w'+i}><Info size={13}/>{warn}</p>)}
            {report.warnings.length>9&&<p>...{report.warnings.length-9} additional warnings preserved in the report.</p>}
          </div>
          <div className="registry-download">
            <button className="btn btn-primary btn-full" disabled={!ready||busy} onClick={()=>void exportReviewZip()}>
              <PackageCheck size={16}/>{busy?'HASHING AND BUILDING…':'DOWNLOAD REGISTRY REVIEW ZIP'}
            </button>
            <button className="btn btn-outline btn-full" disabled={!ready||busy} onClick={exportLst}>
              <ArrowDownToLine size={16}/> DOWNLOAD PROPOSED .LST COPY
            </button>
            <p>ZIP includes a proposed copy, an append-only change report and SHA-256 receipts. All changes require manual verification.</p>
          </div>
        </div>
      </div>
    </div>
    <div className="registry-last"><ShieldCheck size={19}/><p><strong>THE ORIGINAL IS SACRED.</strong> No writes to an installed game, no archive repacking, no overwriting existing LST entries. This phase supports only art/items/items.lst; other art types and prototype/script lists need separate adapters.</p></div>
  </section>;
}
