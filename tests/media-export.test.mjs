import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createAnimationProject,
  generateMotionSequence,
  addFigureInstance,
  addVisualEffect,
  renderFrameToSvg,
  renderDocumentToAnimatedSvg,
  renderDocumentToHtmlPlayer,
  renderAndExportMedia,
  ProjectSession
} from '../dist/index.js';

test('Renderer: generates SVG, Animated SVG, and HTML5 Player for active project', () => {
  const doc = createAnimationProject({
    canvasWidth: 640,
    canvasHeight: 360,
    fps: 24,
    preset: 'blue'
  });
  ProjectSession.setActive(doc);

  generateMotionSequence({
    mode: 'preset',
    preset: 'punch_combo',
    frameCount: 12
  });

  // 1. Single frame SVG
  const svg = renderFrameToSvg(doc, 0);
  assert.ok(svg.includes('<svg'), 'Missing <svg tag');
  assert.ok(svg.includes('viewBox="0 0 640 360"'));
  assert.ok(svg.includes('circle') || svg.includes('line'), 'Missing rendered primitives');

  // 2. Animated SVG
  const animSvg = renderDocumentToAnimatedSvg(doc);
  assert.ok(animSvg.includes('@keyframes showFrame_'));
  assert.ok(animSvg.includes('frame_0'));

  // 3. HTML5 interactive player
  const html = renderDocumentToHtmlPlayer(doc);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('canvas id="c"'));
  assert.ok(html.includes('id="scrubber"'));
  assert.ok(html.includes('StykAnimate Player'));
});

test('Scene: addFigureInstance and addVisualEffect enhance timeline', () => {
  const doc = createAnimationProject({
    canvasWidth: 800,
    canvasHeight: 450,
    fps: 24,
    preset: 'walker'
  });
  ProjectSession.setActive(doc);

  generateMotionSequence({
    mode: 'preset',
    preset: 'sword_slash',
    frameCount: 10
  });

  // Add broadsword prop
  const sword = addFigureInstance({
    preset: 'sword',
    rootX: 420,
    rootY: 260
  });
  assert.ok(sword.success);
  assert.equal(doc.figure_types.length, 2);
  assert.equal(doc.keyframes[0].objects.length, 2);

  // Add impact visual effect
  const effect = addVisualEffect({
    effectType: 'impact_burst',
    targetX: 450,
    targetY: 250,
    startFrame: 4,
    durationFrames: 3
  });
  assert.ok(effect.success);

  // Camera shake
  const shake = addVisualEffect({
    effectType: 'camera_shake',
    startFrame: 4,
    durationFrames: 2,
    intensity: 10
  });
  assert.ok(shake.success);
  assert.ok(!doc.keyframes[4].camera.is_default);
});

test('renderAndExportMedia: exports SVG, HTML, GIF, and MP4 successfully', async () => {
  const doc = createAnimationProject({
    canvasWidth: 480,
    canvasHeight: 270,
    fps: 12,
    preset: 'blue'
  });
  ProjectSession.setActive(doc);

  generateMotionSequence({
    mode: 'preset',
    preset: 'backflip',
    frameCount: 8
  });

  const outDir = path.resolve('./temp_media_test');

  // 1. Export HTML Player
  const htmlPath = path.join(outDir, 'animation.html');
  const htmlRes = await renderAndExportMedia({
    outputPath: htmlPath,
    format: 'html-player'
  });
  assert.ok(htmlRes.success);
  assert.ok(fs.existsSync(htmlPath));
  assert.ok(htmlRes.fileSizeBytes > 1000);

  // 2. Export Animated SVG
  const svgPath = path.join(outDir, 'animation.svg');
  const svgRes = await renderAndExportMedia({
    outputPath: svgPath,
    format: 'animated-svg'
  });
  assert.ok(svgRes.success);
  assert.ok(fs.existsSync(svgPath));

  // 3. Export Animated GIF via FFmpeg
  const gifPath = path.join(outDir, 'animation.gif');
  const gifRes = await renderAndExportMedia({
    outputPath: gifPath,
    format: 'gif'
  });
  assert.ok(gifRes.success);
  assert.ok(fs.existsSync(gifPath));
  assert.ok(gifRes.fileSizeBytes > 100);

  // 4. Export MP4 Video via FFmpeg
  const mp4Path = path.join(outDir, 'animation.mp4');
  const mp4Res = await renderAndExportMedia({
    outputPath: mp4Path,
    format: 'mp4'
  });
  assert.ok(mp4Res.success);
  assert.ok(fs.existsSync(mp4Path));
  assert.ok(mp4Res.fileSizeBytes > 100);

  // Clean up
  fs.rmSync(outDir, { recursive: true, force: true });
});
