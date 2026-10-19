import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Pause, Play, RotateCcw } from 'lucide-react';
import type { FrmImage, RgbPalette } from './frm';
import { renderFrmPixels } from './frm';
import './sprite.css';

type Props = { image: FrmImage; palette: RgbPalette; name: string };
const PREVIEW_W = 360;
const PREVIEW_H = 280;

export default function SpritePreview({ image, palette, name }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [direction, setDirection] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(Math.max(1, Math.min(30, image.fps || 10)));
  const [zoom, setZoom] = useState(3);

  const orientation = image.directions[direction] ?? image.directions[0];
  const current = orientation.frames[frame] ?? orientation.frames[0];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setFrame((f) => (f + 1) % orientation.frames.length), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [playing, fps, orientation.frames.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
    context.imageSmoothingEnabled = false;

    const raw = document.createElement('canvas');
    raw.width = current.width;
    raw.height = current.height;
    const ctx = raw.getContext('2d');
    if (!ctx) return;
    const rgba = renderFrmPixels(current, palette);
    ctx.putImageData(new ImageData(rgba, current.width, current.height), 0, 0);

    let cumulativeX = orientation.xShift;
    let cumulativeY = orientation.yShift;
    for (let n = 0; n <= frame; n++) {
      cumulativeX += orientation.frames[n].xOffset;
      cumulativeY += orientation.frames[n].yOffset;
    }
    const factor = Math.min(zoom, (PREVIEW_W - 24) / current.width, (PREVIEW_H - 24) / current.height);
    const width = current.width * factor;
    const height = current.height * factor;
    context.drawImage(raw,
      Math.round(PREVIEW_W / 2 - width / 2 + cumulativeX * factor),
      Math.round(PREVIEW_H * 0.67 - height + cumulativeY * factor),
      Math.round(width), Math.round(height));
  }, [current, frame, orientation, palette, zoom]);

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const cleanName = name.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 90);
      anchor.download = cleanName + '-dir' + orientation.slot + '-frame' + frame + '.png';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  const goDirection = (index: number) => {
    setDirection(index);
    setFrame(0);
  };

  return <div className="sprite-stage">
    <div className="sprite-stage-top">
      <span>SPRITE FRAME VIEWER</span><span>FRM v{image.version} · {orientation.frames.length} FRAMES</span>
    </div>
    <div className="sprite-canvas-frame">
      <canvas ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H}
        role="img" aria-label={name + ' orientation ' + orientation.slot + ' frame ' + (frame + 1)}/>
    </div>
    <div className="sprite-status">
      <span>{current.width} × {current.height}px</span>
      <span>{palette.source === 'grayscale' ? 'APPROXIMATE COLORS' : '6-BIT PALETTE'}</span>
    </div>
    <div className="sprite-controls">
      <div className="sprite-control-row">
        <span>DIRECTION</span>
        <div className="sprite-direction-options">
          {image.directions.map((item, index) =>
            <button type="button" key={item.slot} className={direction === index ? 'sprite-direction-selected' : ''}
              onClick={() => goDirection(index)}>D{item.slot}</button>)}
        </div>
      </div>
      <div className="sprite-control-row">
        <span>FRAME</span>
        <div className="sprite-buttons">
          <button type="button" aria-label="Previous frame" onClick={() => setFrame((f) => (f + orientation.frames.length - 1) % orientation.frames.length)}><ChevronLeft size={15}/></button>
          <strong>{frame + 1} / {orientation.frames.length}</strong>
          <button type="button" aria-label="Next frame" onClick={() => setFrame((f) => (f + 1) % orientation.frames.length)}><ChevronRight size={15}/></button>
          <button type="button" title={playing ? 'Pause animation' : 'Play animation'} onClick={() => setPlaying(!playing)}>
            {playing ? <Pause size={15}/> : <Play size={15}/>}
          </button>
          <button type="button" title="Reset animation" onClick={() => { setPlaying(false); setFrame(0); }}><RotateCcw size={14}/></button>
        </div>
      </div>
      <div className="sprite-control-row">
        <label htmlFor="sprite-fps">FPS <strong>{fps}</strong></label>
        <input id="sprite-fps" type="range" min="1" max="30" value={fps} onChange={(e) => setFps(Number(e.target.value))}/>
      </div>
      <div className="sprite-control-row">
        <label htmlFor="sprite-zoom">ZOOM <strong>{zoom}×</strong></label>
        <input id="sprite-zoom" type="range" min="1" max="8" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}/>
      </div>
    </div>
    <div className="sprite-palette-info">
      <span>PALETTE</span>
      <strong>{palette.label}</strong>
      {palette.source === 'grayscale' && <p>Color preview is a placeholder. Supply the matching .PAL or a game archive containing color.pal for accurate colors.</p>}
    </div>
    <button type="button" className="btn btn-outline btn-full" onClick={exportPng}><Download size={15}/> DOWNLOAD TRANSPARENT PNG PREVIEW</button>
    <p className="sprite-disclaimer">This PNG is a rendering of the currently selected frame, not an FRM conversion suitable for installation in game.</p>
  </div>;
}
