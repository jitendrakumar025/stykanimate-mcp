import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Resvg } from '@resvg/resvg-js';
import {
  StykDocument,
  StykKeyframe,
  StykObject,
  StykFigureType,
  StykSegment
} from '../types/stykanimate.js';
import { ProjectSession, validateDocument } from './document.js';
import { computeForwardKinematics, JointPoint } from './rig.js';

export interface ExportMediaOptions {
  document?: StykDocument;
  outputPath: string;
  format:
    | 'mp4'
    | 'gif'
    | 'webm'
    | 'svg'
    | 'animated-svg'
    | 'png-sequence'
    | 'svg-sequence'
    | 'html-player';
  fps?: number;
  width?: number;
  height?: number;
  loop?: boolean;
  quality?: 'high' | 'medium' | 'low';
  frameIndex?: number;
}

export interface ExportMediaResult {
  success: boolean;
  filePath: string;
  format: string;
  fileSizeBytes: number;
  frameCount: number;
  durationSeconds: number;
  resolution: { width: number; height: number };
  fps: number;
  message: string;
}

/**
 * Checks if ffmpeg is available on the host system PATH.
 */
export function isFFmpegAvailable(): boolean {
  try {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Renders a single timeline keyframe to an SVG XML string.
 */
export function renderFrameToSvg(
  doc: StykDocument,
  frameIndex: number,
  overrideDimensions?: { width?: number; height?: number }
): string {
  const width = overrideDimensions?.width ?? doc.canvas_width;
  const height = overrideDimensions?.height ?? doc.canvas_height;

  const keyframes = doc.keyframes;
  if (keyframes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#1a1a1a"/></svg>`;
  }

  const kfIdx = Math.max(0, Math.min(frameIndex, keyframes.length - 1));
  const keyframe: StykKeyframe = keyframes[kfIdx];

  // Resolve background color
  const bgColorHex = '#222226'; // StykAnimate dark studio default canvas

  let svgElements = '';

  // Camera transform if present
  let cameraTransform = '';
  if (keyframe.camera && !keyframe.camera.is_default) {
    const cx = keyframe.camera.x;
    const cy = keyframe.camera.y;
    const scale = keyframe.camera.scale || 1;
    const rotDeg = ((keyframe.camera.angle_rad || 0) * 180) / Math.PI;
    cameraTransform = `transform="translate(${cx}, ${cy}) scale(${scale}) rotate(${rotDeg})"`;
  }

  // Draw order
  const objectsToDraw: StykObject[] = [];
  const drawOrder = keyframe.object_draw_order || [];

  if (drawOrder.length > 0) {
    for (const slot of drawOrder) {
      const obj = keyframe.objects.find((o) => o.object_slot === slot);
      if (obj) objectsToDraw.push(obj);
    }
  } else {
    objectsToDraw.push(...keyframe.objects);
  }

  for (const obj of objectsToDraw) {
    const figureType = doc.figure_types.find((f) => f.figure_type_id === obj.figure_type_id);
    if (!figureType) continue;

    const segments = figureType.segments;
    const angles = obj.angles || segments.map((s) => s.angle_rad);
    const rootX = obj.root_x;
    const rootY = obj.root_y;
    const scale = obj.scale ?? 1;

    const fkPoints = computeForwardKinematics(segments, angles, rootX, rootY, scale);

    // Render polyfills if any
    if (figureType.polyfills && figureType.polyfills.length > 0) {
      for (const poly of figureType.polyfills) {
        const polyPoints: { x: number; y: number }[] = [];
        for (const segId of poly.segment_ids) {
          const pt = fkPoints.get(segId);
          if (pt) polyPoints.push(pt.end);
        }
        if (polyPoints.length >= 3) {
          const pathStr = polyPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + ' Z';
          const [r, g, b] = poly.color_rgb || [0, 150, 255];
          const opacity = poly.color_alpha !== undefined ? poly.color_alpha : 1;
          svgElements += `  <path d="${pathStr}" fill="rgb(${r},${g},${b})" fill-opacity="${opacity}" />\n`;
        }
      }
    }

    // Render segments
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (s.visible === false) continue;

      const pt = fkPoints.get(s.segment_id);
      if (!pt) continue;

      const [r, g, b] = obj.color_override_rgb ?? s.color_rgb ?? [13, 153, 255];
      const transparency = obj.transparency ?? s.transparency ?? 0;
      const opacity = (1 - transparency / 255) * (obj.opacity ?? 1);
      const strokeWidth = (s.thickness * scale) || (s.segment_type === 'circle' ? 0 : 12 * scale);

      if (s.segment_kind === 'circleFill' || s.primitive_code === 3) {
        // Authoritative circle geometry: midpoint between start and end, diameter = length + thickness
        const cx = (pt.start.x + pt.end.x) / 2;
        const cy = (pt.start.y + pt.end.y) / 2;
        const radius = (Math.abs(pt.length) + strokeWidth) / 2;
        if (radius > 0) {
          svgElements += `  <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${radius.toFixed(2)}" fill="rgb(${r},${g},${b})" fill-opacity="${opacity.toFixed(3)}" />\n`;
        }
      } else if (s.segment_kind === 'circle' || s.primitive_code === 1) {
        const cx = (pt.start.x + pt.end.x) / 2;
        const cy = (pt.start.y + pt.end.y) / 2;
        const radius = Math.abs(pt.length) / 2;
        const sw = Math.max(1, strokeWidth);
        if (radius > 0) {
          svgElements += `  <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${radius.toFixed(2)}" fill="none" stroke="rgb(${r},${g},${b})" stroke-width="${sw.toFixed(2)}" stroke-opacity="${opacity.toFixed(3)}" />\n`;
        }
      } else if (s.segment_kind === 'circleClear' || s.primitive_code === 4) {
        const cx = (pt.start.x + pt.end.x) / 2;
        const cy = (pt.start.y + pt.end.y) / 2;
        const radius = (Math.abs(pt.length) + strokeWidth) / 2;
        if (radius > 0) {
          svgElements += `  <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${radius.toFixed(2)}" fill="#ffffff" fill-opacity="${opacity.toFixed(3)}" />\n`;
        }
      } else if (s.segment_kind === 'squareLine' || s.primitive_code === 6) {
        svgElements += `  <line x1="${pt.start.x.toFixed(2)}" y1="${pt.start.y.toFixed(2)}" x2="${pt.end.x.toFixed(2)}" y2="${pt.end.y.toFixed(2)}" stroke="rgb(${r},${g},${b})" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="butt" stroke-opacity="${opacity.toFixed(3)}" />\n`;
      } else {
        // Standard line
        svgElements += `  <line x1="${pt.start.x.toFixed(2)}" y1="${pt.start.y.toFixed(2)}" x2="${pt.end.x.toFixed(2)}" y2="${pt.end.y.toFixed(2)}" stroke="rgb(${r},${g},${b})" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="round" stroke-opacity="${opacity.toFixed(3)}" />\n`;
      }
    }
  }

  const contentGroup = cameraTransform
    ? `<g ${cameraTransform}>\n${svgElements}</g>`
    : svgElements;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${bgColorHex}"/>
${contentGroup}
</svg>`;
}

/**
 * Renders all keyframes into SVG strings.
 */
export function renderDocumentToSvgSequence(
  doc: StykDocument,
  overrideDimensions?: { width?: number; height?: number }
): string[] {
  const result: string[] = [];
  for (let i = 0; i < doc.keyframes.length; i++) {
    result.push(renderFrameToSvg(doc, i, overrideDimensions));
  }
  return result;
}

/**
 * Creates an animated SVG containing all frames with CSS keyframe switching.
 */
export function renderDocumentToAnimatedSvg(doc: StykDocument): string {
  const width = doc.canvas_width;
  const height = doc.canvas_height;
  const totalFrames = doc.keyframes.length;
  const fps = doc.fps || 24;
  const totalDuration = totalFrames / fps;

  if (totalFrames <= 1) {
    return renderFrameToSvg(doc, 0);
  }

  let framesMarkup = '';
  let cssRules = `@keyframes frameSwitch {`;

  for (let i = 0; i < totalFrames; i++) {
    const svg = renderFrameToSvg(doc, i);
    // Extract inner content inside <svg>...</svg>
    const innerContent = svg.substring(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
    framesMarkup += `  <g id="frame_${i}" class="anim-frame frame-${i}">\n${innerContent}\n  </g>\n`;

    const startPct = ((i / totalFrames) * 100).toFixed(2);
    const endPct = (((i + 1) / totalFrames) * 100).toFixed(2);
    cssRules += `
      ${startPct}%, ${endPct}% { --active-frame: ${i}; }`;
  }
  cssRules += `\n    }`;

  // CSS for frame visibility
  let visibilityCss = '';
  for (let i = 0; i < totalFrames; i++) {
    const pctStart = ((i / totalFrames) * 100).toFixed(2);
    const pctEnd = (((i + 1) / totalFrames) * 100).toFixed(2);
    visibilityCss += `
      @keyframes showFrame_${i} {
        0%, ${pctStart}% { display: none; visibility: hidden; }
        ${pctStart}%, ${pctEnd}% { display: inline; visibility: visible; }
        ${pctEnd}%, 100% { display: none; visibility: hidden; }
      }
      .frame-${i} {
        animation: showFrame_${i} ${totalDuration.toFixed(3)}s infinite steps(1);
      }`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <style>
    .anim-frame { display: none; }
    ${visibilityCss}
  </style>
  <rect width="${width}" height="${height}" fill="#222226"/>
${framesMarkup}
</svg>`;
}

/**
 * Generates an interactive standalone HTML5 player with 60fps canvas playback and controls.
 */
export function renderDocumentToHtmlPlayer(doc: StykDocument): string {
  const jsonDoc = JSON.stringify(doc);
  const width = doc.canvas_width;
  const height = doc.canvas_height;
  const fps = doc.fps || 24;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StykAnimate Player - ${doc._styk?.name || 'Animation'}</title>
  <style>
    :root {
      --bg: #121214;
      --surface: #1e1e24;
      --border: #2e2e38;
      --accent: #0d99ff;
      --accent-hover: #38b6ff;
      --text: #e6e6e6;
      --text-muted: #888899;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .player-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 16px 40px rgba(0,0,0,0.6);
      max-width: 100%;
    }
    .header {
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
    }
    .title {
      font-weight: 600;
      font-size: 15px;
      color: var(--text);
    }
    .meta {
      font-size: 13px;
      color: var(--text-muted);
    }
    .canvas-container {
      position: relative;
      background: #222226;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    canvas {
      display: block;
      max-width: 100%;
      height: auto;
    }
    .controls {
      padding: 14px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--surface);
    }
    .timeline-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .slider {
      flex: 1;
      accent-color: var(--accent);
      cursor: pointer;
    }
    .frame-counter {
      font-variant-numeric: tabular-nums;
      font-size: 13px;
      color: var(--text-muted);
      min-width: 80px;
      text-align: right;
    }
    .button-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn-group {
      display: flex;
      gap: 8px;
    }
    button {
      background: #2a2a34;
      color: var(--text);
      border: 1px solid var(--border);
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    button:hover {
      background: #363644;
      border-color: #444455;
    }
    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    button.primary:hover {
      background: var(--accent-hover);
    }
    select {
      background: #2a2a34;
      color: var(--text);
      border: 1px solid var(--border);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
      outline: none;
    }
    label {
      font-size: 13px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="player-card">
    <div class="header">
      <div class="title">${doc._styk?.name || 'StykAnimate Project'}</div>
      <div class="meta">${width} &times; ${height} &bull; ${fps} FPS</div>
    </div>
    <div class="canvas-container">
      <canvas id="c" width="${width}" height="${height}"></canvas>
    </div>
    <div class="controls">
      <div class="timeline-row">
        <input type="range" id="scrubber" class="slider" min="0" max="${Math.max(0, doc.keyframes.length - 1)}" value="0">
        <div id="counter" class="frame-counter">1 / ${doc.keyframes.length}</div>
      </div>
      <div class="button-row">
        <div class="btn-group">
          <button id="playBtn" class="primary">&#9654; Play</button>
          <button id="prevBtn">&#9198; Prev</button>
          <button id="nextBtn">&#9197; Next</button>
          <button id="resetBtn">&#8634; Reset</button>
        </div>
        <div class="btn-group" style="align-items: center;">
          <label><input type="checkbox" id="loopCheck" checked> Loop</label>
          <select id="speedSelect">
            <option value="0.25">0.25x</option>
            <option value="0.5">0.5x</option>
            <option value="1" selected>1.0x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
          </select>
        </div>
      </div>
    </div>
  </div>

  <script>
    const doc = ${jsonDoc};
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const scrubber = document.getElementById('scrubber');
    const counter = document.getElementById('counter');
    const playBtn = document.getElementById('playBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const resetBtn = document.getElementById('resetBtn');
    const loopCheck = document.getElementById('loopCheck');
    const speedSelect = document.getElementById('speedSelect');

    const totalFrames = doc.keyframes.length;
    let currentFrame = 0;
    let isPlaying = false;
    let lastTimestamp = 0;
    let accumulator = 0;
    let speed = 1.0;
    const baseFps = doc.fps || 24;

    function computeFK(segments, angles, rootX, rootY, scale) {
      const parentPos = new Map();
      parentPos.set(0, { x: rootX, y: rootY });
      const joints = new Map();

      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        const angle = angles[i] !== undefined ? angles[i] : s.angle_rad;
        const len = (s.length || 0) * scale;
        const parent = parentPos.get(s.parent_id) || { x: rootX, y: rootY };

        const endX = parent.x + len * Math.cos(angle);
        const endY = parent.y + len * Math.sin(angle);

        joints.set(s.segment_id, {
          start: { ...parent },
          end: { x: endX, y: endY },
          length: len
        });
        parentPos.set(s.segment_id, { x: endX, y: endY });
      }
      return joints;
    }

    function render(frameIdx) {
      ctx.fillStyle = '#222226';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (totalFrames === 0) return;
      const kf = doc.keyframes[frameIdx];
      if (!kf) return;

      const objects = kf.objects || [];
      const drawOrder = kf.object_draw_order || [];
      const orderedObjects = [];

      if (drawOrder.length > 0) {
        for (const slot of drawOrder) {
          const obj = objects.find(o => o.object_slot === slot);
          if (obj) orderedObjects.push(obj);
        }
      } else {
        orderedObjects.push(...objects);
      }

      for (const obj of orderedObjects) {
        const figure = (doc.figure_types || []).find(f => f.figure_type_id === obj.figure_type_id);
        if (!figure) continue;

        const segments = figure.segments || [];
        const angles = obj.angles || segments.map(s => s.angle_rad);
        const scale = obj.scale || 1;
        const fk = computeFK(segments, angles, obj.root_x, obj.root_y, scale);

        // Render polyfills
        if (figure.polyfills) {
          for (const poly of figure.polyfills) {
            const pts = [];
            for (const id of poly.segment_ids) {
              const pt = fk.get(id);
              if (pt) pts.push(pt.end);
            }
            if (pts.length >= 3) {
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
              ctx.closePath();
              const [r, g, b] = poly.color_rgb || [0, 150, 255];
              ctx.fillStyle = \`rgba(\${r},\${g},\${b},\${poly.color_alpha ?? 1})\`;
              ctx.fill();
            }
          }
        }

        // Render segments
        for (let i = 0; i < segments.length; i++) {
          const s = segments[i];
          if (s.visible === false) continue;
          const pt = fk.get(s.segment_id);
          if (!pt) continue;

          const [r, g, b] = obj.color_override_rgb || s.color_rgb || [13, 153, 255];
          const transparency = obj.transparency ?? s.transparency ?? 0;
          const alpha = (1 - transparency / 255) * (obj.opacity ?? 1);
          const width = (s.thickness * scale) || (s.segment_type === 'circle' ? 0 : 12 * scale);

          ctx.strokeStyle = \`rgba(\${r},\${g},\${b},\${alpha})\`;
          ctx.fillStyle = \`rgba(\${r},\${g},\${b},\${alpha})\`;

          if (s.segment_kind === 'circleFill' || s.primitive_code === 3) {
            const cx = (pt.start.x + pt.end.x) / 2;
            const cy = (pt.start.y + pt.end.y) / 2;
            const radius = (Math.abs(pt.length) + width) / 2;
            if (radius > 0) {
              ctx.beginPath();
              ctx.arc(cx, cy, radius, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (s.segment_kind === 'circle' || s.primitive_code === 1) {
            const cx = (pt.start.x + pt.end.x) / 2;
            const cy = (pt.start.y + pt.end.y) / 2;
            const radius = Math.abs(pt.length) / 2;
            if (radius > 0) {
              ctx.lineWidth = Math.max(1, width);
              ctx.beginPath();
              ctx.arc(cx, cy, radius, 0, Math.PI * 2);
              ctx.stroke();
            }
          } else if (s.segment_kind === 'circleClear' || s.primitive_code === 4) {
            const cx = (pt.start.x + pt.end.x) / 2;
            const cy = (pt.start.y + pt.end.y) / 2;
            const radius = (Math.abs(pt.length) + width) / 2;
            if (radius > 0) {
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(cx, cy, radius, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            ctx.lineWidth = width;
            ctx.lineCap = (s.segment_kind === 'squareLine' || s.primitive_code === 6) ? 'butt' : 'round';
            ctx.beginPath();
            ctx.moveTo(pt.start.x, pt.start.y);
            ctx.lineTo(pt.end.x, pt.end.y);
            ctx.stroke();
          }
        }
      }
    }

    function updateUI() {
      scrubber.value = currentFrame;
      counter.textContent = \`\${currentFrame + 1} / \${totalFrames}\`;
      render(currentFrame);
    }

    function loop(timestamp) {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const delta = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      if (isPlaying && totalFrames > 1) {
        accumulator += delta;
        const frameInterval = 1 / (baseFps * speed);
        while (accumulator >= frameInterval) {
          accumulator -= frameInterval;
          currentFrame++;
          if (currentFrame >= totalFrames) {
            if (loopCheck.checked) {
              currentFrame = 0;
            } else {
              currentFrame = totalFrames - 1;
              isPlaying = false;
              playBtn.innerHTML = '&#9654; Play';
              break;
            }
          }
        }
        updateUI();
      }
      requestAnimationFrame(loop);
    }

    playBtn.addEventListener('click', () => {
      isPlaying = !isPlaying;
      playBtn.innerHTML = isPlaying ? '&#10074;&#10074; Pause' : '&#9654; Play';
      if (isPlaying && currentFrame >= totalFrames - 1) {
        currentFrame = 0;
        updateUI();
      }
    });

    prevBtn.addEventListener('click', () => {
      isPlaying = false;
      playBtn.innerHTML = '&#9654; Play';
      currentFrame = (currentFrame - 1 + totalFrames) % totalFrames;
      updateUI();
    });

    nextBtn.addEventListener('click', () => {
      isPlaying = false;
      playBtn.innerHTML = '&#9654; Play';
      currentFrame = (currentFrame + 1) % totalFrames;
      updateUI();
    });

    resetBtn.addEventListener('click', () => {
      currentFrame = 0;
      updateUI();
    });

    scrubber.addEventListener('input', (e) => {
      isPlaying = false;
      playBtn.innerHTML = '&#9654; Play';
      currentFrame = parseInt(e.target.value, 10);
      updateUI();
    });

    speedSelect.addEventListener('change', (e) => {
      speed = parseFloat(e.target.value);
    });

    updateUI();
    requestAnimationFrame(loop);
  </script>
</body>
</html>`;
}

/**
 * Converts an SVG string into a high-resolution PNG Buffer using @resvg/resvg-js.
 */
export function renderSvgToPngBuffer(svgString: string, targetWidth?: number): Buffer {
  const opts = targetWidth ? { fitTo: { mode: 'width' as const, value: targetWidth } } : {};
  const resvg = new Resvg(svgString, opts);
  const pngData = resvg.render();
  return pngData.asPng();
}

/**
 * Compiles, renders, and exports visual media (MP4, GIF, WebM, SVG, PNG sequences, HTML player).
 */
export async function renderAndExportMedia(options: ExportMediaOptions): Promise<ExportMediaResult> {
  const doc = options.document ?? ProjectSession.getActive();
  validateDocument(doc);

  const outputPath = path.resolve(options.outputPath);
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const format = options.format;
  const fps = options.fps ?? doc.fps ?? 24;
  const width = options.width ?? doc.canvas_width;
  const height = options.height ?? doc.canvas_height;
  const totalFrames = doc.keyframes.length;
  const durationSeconds = totalFrames / fps;

  // Single static SVG
  if (format === 'svg') {
    const frameIndex = options.frameIndex ?? 0;
    const svgContent = renderFrameToSvg(doc, frameIndex, { width, height });
    fs.writeFileSync(outputPath, svgContent, 'utf8');
    const stats = fs.statSync(outputPath);
    return {
      success: true,
      filePath: outputPath,
      format: 'svg',
      fileSizeBytes: stats.size,
      frameCount: 1,
      durationSeconds: 1 / fps,
      resolution: { width, height },
      fps,
      message: `Rendered frame ${frameIndex} to SVG successfully.`
    };
  }

  // Animated SVG
  if (format === 'animated-svg') {
    const animSvg = renderDocumentToAnimatedSvg(doc);
    fs.writeFileSync(outputPath, animSvg, 'utf8');
    const stats = fs.statSync(outputPath);
    return {
      success: true,
      filePath: outputPath,
      format: 'animated-svg',
      fileSizeBytes: stats.size,
      frameCount: totalFrames,
      durationSeconds,
      resolution: { width, height },
      fps,
      message: `Exported ${totalFrames} frames as standalone Animated SVG.`
    };
  }

  // Standalone HTML5 interactive player
  if (format === 'html-player') {
    const html = renderDocumentToHtmlPlayer(doc);
    fs.writeFileSync(outputPath, html, 'utf8');
    const stats = fs.statSync(outputPath);
    return {
      success: true,
      filePath: outputPath,
      format: 'html-player',
      fileSizeBytes: stats.size,
      frameCount: totalFrames,
      durationSeconds,
      resolution: { width, height },
      fps,
      message: `Exported interactive 60fps HTML5 player with timeline scrubber controls.`
    };
  }

  // SVG sequence
  if (format === 'svg-sequence') {
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    const svgs = renderDocumentToSvgSequence(doc, { width, height });
    for (let i = 0; i < svgs.length; i++) {
      const pad = String(i + 1).padStart(4, '0');
      fs.writeFileSync(path.join(outputPath, `frame_${pad}.svg`), svgs[i], 'utf8');
    }
    return {
      success: true,
      filePath: outputPath,
      format: 'svg-sequence',
      fileSizeBytes: 0,
      frameCount: svgs.length,
      durationSeconds,
      resolution: { width, height },
      fps,
      message: `Exported ${svgs.length} SVG frames into folder "${outputPath}".`
    };
  }

  // Raster exports: Need PNG frames generated via @resvg/resvg-js
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'styk-render-'));

  try {
    const svgs = renderDocumentToSvgSequence(doc, { width, height });
    for (let i = 0; i < svgs.length; i++) {
      const pngBuf = renderSvgToPngBuffer(svgs[i], width);
      const pad = String(i + 1).padStart(4, '0');
      fs.writeFileSync(path.join(tempDir, `frame_${pad}.png`), pngBuf);
    }

    // PNG Sequence destination
    if (format === 'png-sequence') {
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }
      for (let i = 0; i < svgs.length; i++) {
        const pad = String(i + 1).padStart(4, '0');
        const src = path.join(tempDir, `frame_${pad}.png`);
        const dest = path.join(outputPath, `frame_${pad}.png`);
        fs.copyFileSync(src, dest);
      }
      return {
        success: true,
        filePath: outputPath,
        format: 'png-sequence',
        fileSizeBytes: 0,
        frameCount: svgs.length,
        durationSeconds,
        resolution: { width, height },
        fps,
        message: `Exported ${svgs.length} PNG frames into folder "${outputPath}".`
      };
    }

    // Video & GIF via FFmpeg
    if (!isFFmpegAvailable()) {
      throw new Error(
        `Export format "${format}" requires ffmpeg, but ffmpeg was not found on PATH. ` +
        `Install ffmpeg or use format "html-player", "animated-svg", "svg-sequence", or "png-sequence".`
      );
    }

    const inputPattern = path.join(tempDir, 'frame_%04d.png');
    let ffmpegArgs: string[] = [];

    if (format === 'mp4') {
      ffmpegArgs = [
        '-y',
        '-framerate',
        String(fps),
        '-i',
        inputPattern,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outputPath
      ];
    } else if (format === 'gif') {
      const loopCount = options.loop !== false ? '0' : '-1';
      ffmpegArgs = [
        '-y',
        '-framerate',
        String(fps),
        '-i',
        inputPattern,
        '-filter_complex',
        'split[s0][s1];[s0]palettegen=stats_mode=full[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5',
        '-loop',
        loopCount,
        outputPath
      ];
    } else if (format === 'webm') {
      ffmpegArgs = [
        '-y',
        '-framerate',
        String(fps),
        '-i',
        inputPattern,
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        '2M',
        '-pix_fmt',
        'yuv420p',
        outputPath
      ];
    }

    const ffmpegRes = spawnSync('ffmpeg', ffmpegArgs, { encoding: 'utf8' });
    if (ffmpegRes.status !== 0) {
      throw new Error(`FFmpeg failed: ${ffmpegRes.stderr?.trim().split('\n').pop() || 'Unknown FFmpeg error'}`);
    }

    const stats = fs.statSync(outputPath);
    return {
      success: true,
      filePath: outputPath,
      format,
      fileSizeBytes: stats.size,
      frameCount: totalFrames,
      durationSeconds,
      resolution: { width, height },
      fps,
      message: `Rendered and compiled ${totalFrames} frames to ${format.toUpperCase()} (${(stats.size / 1024).toFixed(1)} KB).`
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}
