import { useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowDownToLine, CheckCircle2, CircleAlert, Code2, Database,
  FileArchive, FileImage, FileText, FolderOpen, HardDriveDownload,
  Info, Loader2, PackageCheck, Plus, Radiation, ShieldCheck, Trash2, Upload,
} from 'lucide-react';
import { readWorkspace, serializeMsg, STORAGE_KEY, validateProject } from '../core';
import { encodeFrm, encodePal, fromSpriteJson, SPRITE_STORAGE_KEY } from '../archive/spriteProject';
import {
  MAX_STAGED_BYTES, MAX_STAGED_FILES, buildManifest, checkResource,
  installationNotes, stagedEntries, validateBundle,
  type ClassicTarget, type StagedResource,
} from './core';
import { makeZip, type ZipEntry } from './zip';
import './packager.css';

function uniqueId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
}
const encoder = new TextEncoder();
function byteLabel(n:number):string{
  if(n<1024)return n+' B';
  if(n<1024*1024)return (n/1024).toFixed(1)+' KiB';
  return (n/(1024*1024)).toFixed(1)+' MiB';
}
function safeName(value:string,max=64):string{
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,max)||'original';
}
function downloadZip(name:string,source:Uint8Array){
  const bytes=new Uint8Array(new ArrayBuffer(source.byteLength));
  bytes.set(source);
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
  const a=document.createElement('a');
  a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function rowIcon(kind:StagedResource['kind']){
  if(kind==='frm')return <FileImage size={19}/>;
  if(kind==='pal')return <Database size={19}/>;
  return <FileText size={19}/>;
}
function errorText(cause:unknown):string{
  return cause instanceof Error ? cause.message : 'Operation failed.';
}

export default function ClassicPackager(){
  const [name,setName]=useState('My Original Wasteland Mod');
  const [target,setTarget]=useState<ClassicTarget>('fo1');
  const [resources,setResources]=useState<StagedResource[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const filesInput=useRef<HTMLInputElement>(null);
  const issues=useMemo(()=>validateBundle(resources,target,name),[resources,target,name]);
  const errors=issues.filter(i=>i.level==='error');
  const warnings=issues.filter(i=>i.level==='warning');
  const total=resources.reduce((sum,r)=>sum+r.bytes.byteLength,0);
  const valid=errors.length===0;
  function clearMessages(){setError('');setNotice('');}
  function stageNew(candidates:StagedResource[], message:string) {
    const next=[...resources,...candidates];
    const newProblems=validateBundle(next,target,name).filter(i=>i.level==='error' && !/Package name/.test(i.message));
    if(newProblems.length)throw new Error(newProblems.map(i=>i.message).join('\n'));
    setResources(next);clearMessages();setNotice(message);
  }

  async function uploadFiles(list:File[]|null) {
    if(!list?.length)return;
    clearMessages();
    setBusy(true);
    try {
      if(resources.length+list.length>MAX_STAGED_FILES)throw new Error('Maximum 100 staged files.');
      const pending:StagedResource[]=[];
      let sum=total;
      for(const file of list) {
        if(file.size===0 || file.size>24*1024*1024)throw new Error(file.name+': must be 1 byte to 24 MiB.');
        sum+=file.size;
        if(sum>MAX_STAGED_BYTES)throw new Error('Selection exceeds 32 MiB total resource limit.');
        const bytes=new Uint8Array(await file.arrayBuffer());
        const kind=checkResource(file.name,bytes);
        pending.push({id:uniqueId(),name:file.name,kind,origin:'local-import',bytes});
      }
      stageNew(pending,pending.length+' file(s) staged locally; original files were not changed.');
    } catch(cause){setError(errorText(cause));}finally{setBusy(false);}
  }

  function addDialogue(){
    try{
      clearMessages();
      if(!localStorage.getItem(STORAGE_KEY))throw new Error('No saved Dialogue Studio project in this browser. Open Dialogue Studio and save a project first.');
      const workspace=readWorkspace();
      const project=workspace.projects.find(p=>p.id===workspace.activeId);
      if(!project)throw new Error('No active Dialogue Studio project.');
      if(project.game!==target)throw new Error('Dialogue project targets '+(project.game==='fo1'?'Fallout 1':'Fallout 2')+'. Change packager target or use a matching dialogue project.');
      const validation=validateProject(project);
      if(validation.errors.length)throw new Error('Dialogue must pass validation first: '+validation.errors.slice(0,2).join(' '));
      const bytes=encoder.encode(serializeMsg(project));
      const item:StagedResource={id:uniqueId(),name:project.filename,kind:'msg',origin:'dialogue-project',bytes};
      stageNew([item],'Imported the current Dialogue Studio resource into this staging session.');
    }catch(cause){setError(errorText(cause));}
  }

  function addSprite(){
    try{
      clearMessages();
      const raw=localStorage.getItem(SPRITE_STORAGE_KEY);
      if(!raw)throw new Error('No Sprite Lab project saved in this browser. Visit Sprite Lab first.');
      const sprite=fromSpriteJson(raw);
      const base=safeName(sprite.name,56);
      const created:StagedResource[]=[
        {id:uniqueId(),name:base+'.frm',kind:'frm',origin:'sprite-project',bytes:encodeFrm(sprite)},
        {id:uniqueId(),name:base+'.pal',kind:'pal',origin:'sprite-project',bytes:encodePal(sprite)},
      ];
      stageNew(created,'Added the current original Sprite Lab FRM and matching reference PAL.');
    }catch(cause){setError(errorText(cause));}
  }

  async function exportPackage(){
    if(!valid||busy)return;
    setBusy(true);clearMessages();
    try{
      const manifest=await buildManifest(resources,target,name);
      const entries:ZipEntry[]=stagedEntries(resources).map(r=>({path:r.path,bytes:r.bytes}));
      entries.push({path:'manifest.json',bytes:encoder.encode(JSON.stringify(manifest,null,2)+'\n')});
      entries.push({path:'README_STAGING.txt',bytes:encoder.encode(installationNotes(manifest))});
      const zip=makeZip(entries);
      downloadZip(safeName(name)+'-'+target+'-staging.zip',zip);
      setNotice('Staging ZIP downloaded. Verify its contents before trying game-specific integration.');
    }catch(cause){setError(errorText(cause));}
    finally{setBusy(false);}
  }

  return <section className="packager-page">
    <p className="eyebrow"><span className="tiny-line"/> BUILD PIPELINE / CLASSIC ERA</p>
    <div className="packager-hero">
      <div>
        <h1 className="page-title">Classic Mod <em>Packager.</em></h1>
        <p className="page-description">Combine your original Fallout 1/2 dialogue and sprite resources into a verified staging ZIP with per-file SHA-256 receipts. Review first, register in-game later.</p>
      </div>
      <div className="packager-hero-symbol"><PackageCheck size={54}/><span>STAGE · VERIFY · EXPORT</span></div>
    </div>
    <div className="packager-status-line">
      <span><ShieldCheck size={15}/> USER-SELECTED RESOURCES ONLY</span>
      <span><Archive size={15}/> NO GAME INSTALLATION WRITES</span>
      <span><Code2 size={15}/> NO DAT REPACKING</span>
    </div>
    {error&&<div className="packager-alert error" role="alert"><CircleAlert size={17}/><span>{error}</span></div>}
    {notice&&<div className="packager-alert success" role="status"><CheckCircle2 size={17}/><span>{notice}</span></div>}
    <div className="packager-layout">
      <div className="packager-main">
        <div className="panel">
          <div className="panel-heading"><div><FolderOpen size={17}/><strong>PACKAGE PROFILE</strong></div><span>01 / 03</span></div>
          <div className="packager-fields">
            <label className="field"><span>PACKAGE NAME</span><input maxLength={64} value={name} onChange={e=>setName(e.target.value)}/></label>
            <label className="field"><span>CLASSIC TARGET</span>
              <select value={target} onChange={e=>setTarget(e.target.value as ClassicTarget)}>
                <option value="fo1">Fallout 1 (1997)</option>
                <option value="fo2">Fallout 2 (1998)</option>
              </select>
            </label>
          </div>
          <div className="packager-note"><Info size={16}/> Staging paths are limited to original dialogue under data/text/english/game and item sprites under data/art/items. These are candidate resource locations, not automated game registration.</div>
        </div>

        <div className="panel">
          <div className="panel-heading"><div><Plus size={17}/><strong>RESOURCE STAGING</strong></div><span>02 / 03</span></div>
          <p className="packager-helper">Bring resources from our existing editors or select copies of your own local files. Nothing is uploaded to a server.</p>
          <div className="packager-add-buttons">
            <button className="btn btn-outline" disabled={busy} onClick={addDialogue}><FileText size={16}/> ADD CURRENT DIALOGUE</button>
            <button className="btn btn-outline" disabled={busy} onClick={addSprite}><FileImage size={16}/> ADD SPRITE + PAL</button>
            <button className="btn btn-outline" disabled={busy} onClick={()=>filesInput.current?.click()}><Upload size={16}/> ADD LOCAL FILES</button>
            <input ref={filesInput} type="file" multiple accept=".msg,.frm,.pal,.lst" className="visually-hidden"
              onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void uploadFiles(files);}}/>
          </div>
          <div className="packager-resources-heading"><strong>STAGED ASSETS</strong><span>{resources.length} / {MAX_STAGED_FILES} FILES · {byteLabel(total)} / 32 MiB</span></div>
          {resources.length===0?<div className="packager-empty">
            <FileArchive size={37}/>
            <strong>THE CRATE IS EMPTY</strong>
            <p>Add a resource from Sprite Lab, Dialogue Studio, or your local files to begin assembling a staging package.</p>
          </div>:<div className="packager-file-list">
            {resources.map(item=><div key={item.id} className="packager-file-row">
              <div className="packager-file-icon">{rowIcon(item.kind)}</div>
              <div className="packager-file-name">
                <strong>{item.name}</strong><span>{item.origin.replaceAll('-',' ').toUpperCase()} · {byteLabel(item.bytes.length)}</span>
                <small title={item.name}>{item.kind==='lst'?'ART LST (REVIEW ONLY)':item.kind==='pal'?'REFERENCE PALETTE':item.kind==='frm'?'CLASSIC ITEM SPRITE':'CLASSIC DIALOGUE'} / {item.name}</small>
              </div>
              <button className="packager-remove" title={'Remove '+item.name} aria-label={'Remove '+item.name} onClick={()=>{setResources(r=>r.filter(x=>x.id!==item.id));clearMessages();}}><Trash2 size={17}/></button>
            </div>)}
            <div className="packager-list-footer"><span>Assets remain staged in memory only.</span><button onClick={()=>{if(window.confirm('Clear staged resources?')){setResources([]);clearMessages();}}}>CLEAR ALL</button></div>
          </div>}
        </div>
      </div>

      <div className="packager-side">
        <div className="panel">
          <div className="panel-heading"><div><ShieldCheck size={17}/><strong>BUILD VALIDATION</strong></div><span>03 / 03</span></div>
          <div className={'packager-gate '+(valid?'ready':'blocked')}>
            {valid?<CheckCircle2 size={25}/>:<CircleAlert size={25}/>}
            <div><strong>{valid?'READY FOR STAGING':'EXPORT BLOCKED'}</strong>
              <span>{valid?'All resource structure checks passed.':'Resolve '+errors.length+' blocking issue(s).'}</span></div>
          </div>
          <div className="packager-diagnostics">
            {errors.map((issue,i)=><div className="packager-issue red" key={'e'+i}><CircleAlert size={14}/><span>{issue.message}</span></div>)}
            {warnings.map((issue,i)=><div className="packager-issue" key={'w'+i}><Info size={14}/><span>{issue.message}</span></div>)}
          </div>
          <div className="packager-output">
            <strong>PACKAGE CONTENTS</strong>
            <code>manifest.json</code>
            <code>README_STAGING.txt</code>
            {resources.slice(0,7).map(r=><code key={r.id}>{r.kind==='msg'?'stage/data/text/english/game/':r.kind==='frm'?'stage/data/art/items/':r.kind==='lst'?'reference/registry/':'reference/palettes/'}{r.name}</code>)}
            {resources.length>7&&<small>... and {resources.length-7} more resources</small>}
          </div>
          <div className="packager-export">
            <button className="btn btn-primary btn-full" onClick={()=>void exportPackage()} disabled={!valid||busy}>
              {busy?<Loader2 size={17} className="vault-spinner"/>:<HardDriveDownload size={17}/>}
              {busy?'PACKAGING…':'DOWNLOAD STAGING ZIP'}
            </button>
            <span><Radiation size={13}/> REVIEW PACKAGE BEFORE INSTALLING</span>
          </div>
        </div>
        <div className="packager-safety">
          <ShieldCheck size={21}/>
          <div><strong>LEDGER ABOVE GUESSWORK</strong>
            <p>The manifest records byte sizes and SHA-256 checksums. The ZIP cannot auto-install mods, create runtime prototypes, or validate game behavior. Never distribute proprietary Fallout assets without permission.</p>
          </div>
        </div>
      </div>
    </div>
    <div className="packager-footer-line"><ArrowDownToLine size={16}/> Export is a download into your browser's Downloads folder, not a write to any installed game directory.</div>
  </section>;
}
