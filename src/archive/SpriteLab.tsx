import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  Brush, CheckCircle2, CircleAlert, Copy, Download, Droplets, Eraser,
  FileImage, FilePlus2, FolderOpen, Pause, Play, Plus, RotateCcw, Save,
  ShieldCheck, Trash2, Undo2, Upload,
} from 'lucide-react';
import { parseFrm } from './frm';
import SpritePreview from './SpritePreview';
import {
  SPRITE_STORAGE_KEY, MAX_SPRITE_JSON_BYTES,
  createSpriteProject, addSpriteFrame, removeSpriteFrame, addSpriteDirection,
  encodeFrm, encodePal, fromFrm, fromSpriteJson, toSpriteJson,
  projectPalette, setPixel, validateSprite,
  type SpriteProject,
} from './spriteProject';
import './spriteLab.css';

type Tool = 'pencil' | 'eraser' | 'picker' | 'fill';
const readStored = (): SpriteProject => {
  try {
    const saved = window.localStorage.getItem(SPRITE_STORAGE_KEY);
    if (saved && saved.length <= MAX_SPRITE_JSON_BYTES) return fromSpriteJson(saved);
  } catch { /* Private storage or invalid local copy; start with original fixture. */ }
  return createSpriteProject();
};
const fmt = (number: number) => number.toString(16).padStart(2, '0').toUpperCase();

function colorCss(project: SpriteProject, index: number): string {
  const a = index * 3;
  return '#' + [0,1,2].map(i => {
    const value = project.palette[a+i];
    return fmt((value << 2) | (value >>> 4));
  }).join('');
}
function nameFor(project: SpriteProject, ext: string): string {
  return (project.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g,'').slice(0,65)
    || 'original-sprite') + ext;
}
function saveBytes(filename: string, input: Uint8Array, type = 'application/octet-stream') {
  const safe = new Uint8Array(new ArrayBuffer(input.byteLength));
  safe.set(input);
  const url = URL.createObjectURL(new Blob([safe],{type}));
  const element = document.createElement('a');
  element.href=url; element.download=filename;
  document.body.appendChild(element); element.click(); element.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}
function saveText(filename:string, value:string) {
  const url=URL.createObjectURL(new Blob([value],{type:'application/json;charset=utf-8'}));
  const element=document.createElement('a');
  element.href=url; element.download=filename;
  document.body.appendChild(element); element.click(); element.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1200);
}

export default function SpriteLab() {
  const [project,setProject] = useState<SpriteProject>(readStored);
  const [direction,setDirection] = useState(0);
  const [frame,setFrame] = useState(0);
  const [selectedIndex,setSelectedIndex] = useState(3);
  const [tool,setTool] = useState<Tool>('pencil');
  const [playing,setPlaying] = useState(false);
  const [newWidth,setNewWidth] = useState(24);
  const [newHeight,setNewHeight] = useState(24);
  const [status,setStatus] = useState('');
  const [problem,setProblem] = useState('');
  const [localStorageOk,setLocalStorageOk] = useState(true);
  const [undoStack,setUndoStack] = useState<SpriteProject[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerDown = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLInputElement>(null);

  const activeDirection=project.directions[direction] ?? project.directions[0];
  const activeFrame=activeDirection.frames[frame] ?? activeDirection.frames[0];
  const palette=useMemo(()=>projectPalette(project),[project.palette,project.name]);
  const parsed=useMemo(()=>{
    try { return parseFrm(encodeFrm(project),nameFor(project,'.frm')); }
    catch { return null; }
  },[project]);
  const valid=useMemo(()=>{
    try { validateSprite(project); return true; } catch { return false; }
  },[project]);

  useEffect(()=>{
    try {
      localStorage.setItem(SPRITE_STORAGE_KEY,toSpriteJson(project));
      setLocalStorageOk(true);
    } catch { setLocalStorageOk(false); }
  },[project]);

  useEffect(()=>{
    if(!playing) return;
    const period=window.setInterval(()=>{
      setFrame(f=>(f+1)%project.directions[0].frames.length);
    },1000/project.fps);
    return ()=>window.clearInterval(period);
  },[playing,project.fps,project.directions]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas) return;
    const ctx=canvas.getContext('2d');
    if(!ctx) return;
    const raw=document.createElement('canvas');
    raw.width=project.width;raw.height=project.height;
    const input=raw.getContext('2d');
    if(!input)return;
    const pixels=new Uint8ClampedArray(new ArrayBuffer(project.width*project.height*4));
    for(let i=0;i<activeFrame.pixels.length;i++){
      const id=activeFrame.pixels[i]*4;
      pixels[i*4]=palette.rgba[id];
      pixels[i*4+1]=palette.rgba[id+1];
      pixels[i*4+2]=palette.rgba[id+2];
      pixels[i*4+3]=palette.rgba[id+3];
    }
    input.putImageData(new ImageData(pixels,project.width,project.height),0,0);
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(raw,0,0,canvas.width,canvas.height);
    // A fine editor grid independent from the raw data.
    const unit=canvas.width/project.width;
    if(unit>=9){
      ctx.strokeStyle='rgba(155,203,126,0.16)';
      ctx.lineWidth=1;
      ctx.beginPath();
      for(let x=1;x<project.width;x++){ctx.moveTo(x*unit+.5,0);ctx.lineTo(x*unit+.5,canvas.height);}
      for(let y=1;y<project.height;y++){ctx.moveTo(0,y*unit+.5);ctx.lineTo(canvas.width,y*unit+.5);}
      ctx.stroke();
    }
  },[activeFrame,project.width,project.height,palette]);

  function remember(){setUndoStack(stack=>[...stack.slice(-19),project]);}
  function notify(value:string){setProblem('');setStatus(value);}

  function position(event:PointerEvent<HTMLCanvasElement>):[number,number] | null{
    const area=event.currentTarget.getBoundingClientRect();
    const x=Math.floor((event.clientX-area.left)*project.width/area.width);
    const y=Math.floor((event.clientY-area.top)*project.height/area.height);
    if(x<0||y<0||x>=project.width||y>=project.height)return null;
    return [x,y];
  }
  function fillAt(source:SpriteProject,x:number,y:number,color:number):SpriteProject{
    const pixels=source.directions[direction].frames[frame].pixels;
    const previous=pixels[y*source.width+x];
    if(previous===color)return source;
    const changed=pixels.slice();
    const stack=[y*source.width+x];
    while(stack.length>0){
      const i=stack.pop()!;
      if(changed[i]!==previous)continue;
      changed[i]=color;
      const px=i%source.width,py=Math.floor(i/source.width);
      if(px>0)stack.push(i-1);
      if(px<source.width-1)stack.push(i+1);
      if(py>0)stack.push(i-source.width);
      if(py<source.height-1)stack.push(i+source.width);
    }
    const directions=source.directions.slice();
    const dir={...directions[direction],frames:directions[direction].frames.slice()};
    dir.frames[frame]={...dir.frames[frame],pixels:changed};
    directions[direction]=dir;
    return {...source,directions};
  }
  function paintAt(event:PointerEvent<HTMLCanvasElement>){
    const point=position(event);if(!point)return;
    const [x,y]=point;
    if(tool==='picker'){
      setSelectedIndex(activeFrame.pixels[y*project.width+x]);setTool('pencil');return;
    }
    const index=tool==='eraser'?0:selectedIndex;
    setProject(current=>tool==='fill'?fillAt(current,x,y,index):setPixel(current,direction,frame,x,y,index));
  }
  function onStart(event:PointerEvent<HTMLCanvasElement>){
    if(event.button!==0)return;
    remember();
    pointerDown.current=true;
    event.currentTarget.setPointerCapture(event.pointerId);
    paintAt(event);
    if(tool==='fill'||tool==='picker')pointerDown.current=false;
  }
  function onMove(event:PointerEvent<HTMLCanvasElement>){
    if(pointerDown.current&&event.buttons&1)paintAt(event);
  }
  function endStroke(){pointerDown.current=false;}

  function exportFrm(){
    try{saveBytes(nameFor(project,'.frm'),encodeFrm(project));notify('FRM written as a separate local download. No game archive was modified.');}
    catch(error){setProblem(error instanceof Error?error.message:'FRM export failed.');}
  }
  function exportPal(){
    try{saveBytes(nameFor(project,'.pal'),encodePal(project));notify('Matching six-bit PAL file downloaded.');}
    catch(error){setProblem(error instanceof Error?error.message:'PAL export failed.');}
  }
  function exportJson(){
    try{saveText(nameFor(project,'.wwsprite.json'),toSpriteJson(project));notify('Portable editable project JSON downloaded.');}
    catch(error){setProblem(error instanceof Error?error.message:'Backup failed.');}
  }
  async function openFile(file:File|undefined){
    if(!file)return;
    try{
      if(file.size>MAX_SPRITE_JSON_BYTES&&file.name.toLowerCase().endsWith('.json'))
        throw new Error('JSON exceeds 2 MiB.');
      if(file.size>24*1024*1024)throw new Error('File exceeds 24 MiB.');
      const bytes=new Uint8Array(await file.arrayBuffer());
      let next:SpriteProject;
      if(/\.json$/i.test(file.name))next=fromSpriteJson(new TextDecoder().decode(bytes));
      else if(/\.fr(?:m|[0-5])$/i.test(file.name)){
        next=fromFrm(parseFrm(bytes,file.name),file.name,palette);
      }else throw new Error('Choose a sprite project JSON or classic FRM file.');
      setProject(next);setFrame(0);setDirection(0);setPlaying(false);setUndoStack([]);
      notify('Opened an editable local copy. Original files remain untouched.');
    }catch(error){setProblem(error instanceof Error?error.message:'Could not open file.');}
  }
  async function loadPal(file:File|undefined){
    if(!file)return;
    try{
      if(file.size<768||file.size>512*1024)throw new Error('PAL size must be between 768 bytes and 512 KiB.');
      const bytes=new Uint8Array(await file.arrayBuffer());
      const values=bytes.slice(0,768);
      const invalid=values.some(n=>n>63);
      for(let i=0;i<values.length;i++)if(values[i]>63)values[i]=0;
      remember();
      setProject(current=>({...current,palette:values}));
      notify('Local palette loaded.'+(invalid?' Unsupported channel values were clamped to black.':''));
    }catch(error){setProblem(error instanceof Error?error.message:'Palette import failed.');}
  }

  function renameColor(hex:string){
    if(!/^#[a-fA-F0-9]{6}$/.test(hex))return;
    const rgb=[1,3,5].map(index=>Math.round(parseInt(hex.slice(index,index+2),16)*63/255));
    remember();
    setProject(p=>{
      const next=p.palette.slice();next.set(rgb,selectedIndex*3);
      return {...p,palette:next};
    });
  }
  function cloneSelected(){
    try{remember();setProject(addSpriteFrame(project,frame));setFrame(frame+1);setPlaying(false);notify('Frame duplicated in every orientation.');}
    catch(error){setProblem(error instanceof Error?error.message:'Cannot add frame.');}
  }
  function deleteSelected(){
    try{remember();setProject(removeSpriteFrame(project,frame));setFrame(Math.max(0,frame-1));setPlaying(false);notify('Frame deleted in every orientation.');}
    catch(error){setProblem(error instanceof Error?error.message:'Cannot remove frame.');}
  }
  function newOrientation(){
    try{remember();setProject(addSpriteDirection(project));setDirection(project.directions.length);setPlaying(false);notify('New orientation created from existing frames.');}
    catch(error){setProblem(error instanceof Error?error.message:'Cannot add orientation.');}
  }
  function setMeta(key:'name'|'fps',value:string|number){
    setProject(p=>({...p,[key]:value}));
  }
  function clearFrame(){
    remember();
    setProject(p=>{
      const directions=p.directions.slice();
      const dir={...directions[direction],frames:directions[direction].frames.slice()};
      dir.frames[frame]={...dir.frames[frame],pixels:new Uint8Array(p.width*p.height)};
      directions[direction]=dir;
      return {...p,directions};
    });
    notify('Cleared the current frame only.');
  }
  function fresh(){
    if(!window.confirm('Start a new sprite? Export a JSON backup if you want to keep this one.'))return;
    try{
      setProject(createSpriteProject(newWidth,newHeight));
      setDirection(0);setFrame(0);setSelectedIndex(3);setUndoStack([]);setPlaying(false);
      notify('New original sprite started.');
    }catch(error){setProblem(error instanceof Error?error.message:'Could not create sprite.');}
  }
  function undo(){
    if(!undoStack.length)return;
    const old=undoStack[undoStack.length-1];
    setProject(old);
    setUndoStack(stack=>stack.slice(0,-1));
    setDirection(d=>Math.min(d,old.directions.length-1));
    setFrame(f=>Math.min(f,old.directions[0].frames.length-1));
    setPlaying(false);
  }

  return <section className="sprite-lab-page">
    <p className="eyebrow"><span className="tiny-line" /> SPRITE AUTHORING / CLASSIC ERA</p>
    <div className="sprite-lab-hero">
      <div><h1 className="page-title">Sprite Creation <em>Lab.</em></h1>
        <p className="page-description">Paint original indexed pixel art, animate frames, build orientations and export a validated Fallout-style .FRM with its matching .PAL.</p></div>
      <div className="sprite-lab-status"><ShieldCheck size={17}/> ORIGINALS UNTOUCHED</div>
    </div>
    <div className="sprite-lab-toolbar">
      <button className="btn btn-outline" onClick={()=>importRef.current?.click()}><FolderOpen size={16}/> OPEN FRM / JSON</button>
      <button className="btn btn-outline" onClick={()=>paletteRef.current?.click()}><Droplets size={16}/> IMPORT PAL</button>
      <button className="btn btn-outline" onClick={exportJson}><Save size={16}/> BACKUP PROJECT</button>
      <button className="btn btn-primary" onClick={exportFrm} disabled={!valid}><Download size={16}/> EXPORT FRM</button>
      <button className="btn btn-outline" onClick={exportPal} disabled={!valid}><Download size={16}/> EXPORT PAL</button>
      <input className="visually-hidden" ref={importRef} type="file" accept=".json,.frm,.fr0,.fr1,.fr2,.fr3,.fr4,.fr5"
        onChange={event=>{const f=event.target.files?.[0];event.target.value='';void openFile(f);}}/>
      <input className="visually-hidden" ref={paletteRef} type="file" accept=".pal"
        onChange={event=>{const f=event.target.files?.[0];event.target.value='';void loadPal(f);}}/>
    </div>
    {status&&<div className="sprite-lab-note" role="status"><CheckCircle2 size={17}/>{status}</div>}
    {problem&&<div className="sprite-lab-note sprite-lab-error" role="alert"><CircleAlert size={17}/>{problem}</div>}
    {!localStorageOk&&<div className="sprite-lab-note sprite-lab-error">Browser autosave unavailable. Export a project JSON to keep a copy.</div>}
    <div className="sprite-lab-metrics">
      <span>CANVAS <strong>{project.width}×{project.height}</strong></span>
      <span>DIRECTIONS <strong>{project.directions.length}/6</strong></span>
      <span>FRAMES <strong>{activeDirection.frames.length}/16</strong></span>
      <span>PALETTE <strong>256 INDEXED</strong></span>
      <span>SAVE <strong>{localStorageOk?'LOCAL':'MANUAL BACKUP'}</strong></span>
    </div>

    <div className="sprite-lab-layout">
      <div className="sprite-lab-column">
        <div className="panel sprite-lab-editor">
          <div className="panel-heading"><div><Brush size={16}/><strong>PIXEL WORKBENCH</strong></div><span>LIVE EDITOR</span></div>
          <div className="sprite-lab-project-fields">
            <label className="field"><span>SPRITE NAME</span><input value={project.name} maxLength={80} onChange={e=>setMeta('name',e.target.value)}/></label>
            <label className="field"><span>ANIMATION FPS</span>
              <input type="number" min="1" max="30" value={project.fps} onChange={e=>setMeta('fps',Number(e.target.value))}/></label>
          </div>
          <div className="sprite-lab-tools">
            {([
              ['pencil','PENCIL',Brush],['eraser','ERASE',Eraser],
              ['picker','PICK COLOR',Droplets],['fill','FILL',FileImage],
            ] as const).map(([name,label,Icon])=><button key={name} className={'sprite-tool '+(tool===name?'active':'')}
              onClick={()=>setTool(name)}><Icon size={15}/>{label}</button>)}
            <button className="sprite-tool" disabled={!undoStack.length} onClick={undo}><Undo2 size={15}/> UNDO</button>
          </div>
          <div className="sprite-lab-artboard">
            <canvas ref={canvasRef} width={project.width*10} height={project.height*10}
              aria-label="Pixel canvas editor; pointer painting only" role="img"
              onPointerDown={onStart} onPointerMove={onMove} onPointerUp={endStroke}
              onPointerCancel={endStroke} onLostPointerCapture={endStroke}
            />
          </div>
          <div className="sprite-artboard-caption">
            <span>DRAW WITH MOUSE OR TOUCH</span><span>INDEX {String(selectedIndex).padStart(3,'0')} · {tool.toUpperCase()}</span>
          </div>
          <div className="sprite-lab-timeline">
            <div className="sprite-lab-line-heading"><span>FRAME TIMELINE</span><span>{frame+1}/{activeDirection.frames.length}</span></div>
            <div className="sprite-frame-row">
              {activeDirection.frames.map((_,i)=><button key={i} className={'sprite-frame-chip '+(frame===i?'selected':'')}
                onClick={()=>{setFrame(i);setPlaying(false);}}>{String(i+1).padStart(2,'0')}</button>)}
            </div>
            <div className="sprite-frame-actions">
              <button onClick={cloneSelected} disabled={activeDirection.frames.length>=16}><Copy size={14}/> DUPLICATE FRAME</button>
              <button onClick={deleteSelected} disabled={activeDirection.frames.length===1}><Trash2 size={14}/> DELETE FRAME</button>
              <button onClick={clearFrame}><RotateCcw size={14}/> CLEAR</button>
              <button onClick={()=>setPlaying(!playing)}>{playing?<Pause size={14}/>:<Play size={14}/>} {playing?'PAUSE':'PLAY'}</button>
            </div>
            <div className="sprite-lab-line-heading"><span>ORIENTATIONS</span><span>D{direction}</span></div>
            <div className="sprite-frame-row">
              {project.directions.map((d,i)=><button key={d.slot} className={'sprite-frame-chip '+(direction===i?'selected':'')}
                onClick={()=>{setDirection(i);setFrame(0);setPlaying(false);}}>D{i}</button>)}
              <button className="sprite-frame-chip" onClick={newOrientation} disabled={project.directions.length>=6}><Plus size={14}/></button>
            </div>
          </div>
        </div>
        <div className="panel sprite-palette-panel">
          <div className="panel-heading"><div><Droplets size={16}/><strong>INDEXED PALETTE</strong></div><span>6-BIT RGB</span></div>
          <div className="sprite-palette-content">
            <div className="sprite-palette-swatches">
              {Array.from({length:32},(_,i)=><button key={i} title={'Palette index '+i}
                aria-label={'Palette index '+i} className={'sprite-swatch '+(selectedIndex===i?'chosen':'')}
                style={{background:i===0?'repeating-conic-gradient(#526354 0% 25%,#aabbab 0% 50%) 50% / 12px 12px':colorCss(project,i)}}
                onClick={()=>{setSelectedIndex(i);setTool('pencil');}}/>)}
            </div>
            <div className="sprite-color-editor">
              <label className="field"><span>PALETTE INDEX (0–255)</span>
                <input type="number" min="0" max="255" value={selectedIndex} onChange={e=>setSelectedIndex(Math.max(0,Math.min(255,Number(e.target.value)||0)))}/></label>
              <label className="field"><span>EDIT COLOR (RGB)</span>
                <input type="color" aria-label="Edit selected palette color" value={colorCss(project,selectedIndex)}
                  disabled={selectedIndex===0} onChange={e=>renameColor(e.target.value)}/></label>
            </div>
            <p>Index 0 is reserved as transparent. The 32 quick swatches are a subset; use the index control to access all 256 colors. Export PAL with the FRM to preserve authored colors.</p>
          </div>
        </div>
      </div>
      <div className="sprite-lab-column">
        <div className="panel">
          <div className="panel-heading"><div><FileImage size={17}/><strong>ANIMATION PREVIEW</strong></div><span>READ ONLY</span></div>
          {parsed ? <SpritePreview image={parsed} palette={palette} name={nameFor(project,'.frm')}/> :
          <p className="sprite-lab-preview-error">Fix the project name or FPS to restore the live animation preview.</p>}
        </div>
        <div className="panel">
          <div className="panel-heading"><div><FilePlus2 size={16}/><strong>NEW ORIGINAL SPRITE</strong></div><span>PROJECT TOOLS</span></div>
          <div className="sprite-new-form">
            <label className="field"><span>WIDTH 1–64</span><input type="number" min="1" max="64" value={newWidth} onChange={e=>setNewWidth(Number(e.target.value))}/></label>
            <label className="field"><span>HEIGHT 1–64</span><input type="number" min="1" max="64" value={newHeight} onChange={e=>setNewHeight(Number(e.target.value))}/></label>
            <button className="btn btn-outline" onClick={fresh}><Plus size={15}/> CREATE NEW</button>
          </div>
        </div>
        <div className="sprite-lab-safety"><ShieldCheck size={19}/><div><strong>ORIGINAL GAME FILES NEVER MODIFIED</strong><p>Every project lives in browser storage until you explicitly export it. PNG previews are not installable FRM resources. Retail-game compatibility requires independent testing.</p></div></div>
      </div>
    </div>
  </section>;
}
