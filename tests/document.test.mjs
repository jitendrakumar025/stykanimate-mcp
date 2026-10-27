import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnimationProject,
  createEmptyDocument,
  validateDocument,
  ProjectSession
} from '../dist/index.js';

test('createAnimationProject: creates default blue stickman project', () => {
  const doc = createAnimationProject({ preset: 'blue' });

  assert.equal(doc.version, 5);
  assert.equal(doc.canvas_width, 960);
  assert.equal(doc.canvas_height, 540);
  assert.equal(doc.fps, 24);
  assert.equal(doc.figure_types.length, 1);
  assert.equal(doc.figure_types[0].name, 'Blue');
  assert.equal(doc.figure_types[0].segment_count, 10);
  assert.equal(doc.keyframes.length, 1);
  assert.equal(doc.keyframes[0].objects.length, 1);
  assert.equal(doc.keyframes[0].objects[0].figure_type_id, 1);
  assert.equal(doc.keyframes[0].duration_raw, 10);
  assert.ok(doc._styk.layers);
  assert.ok(doc._styk.layerSheet);
  assert.equal(doc._styk.layerSheet.tracks['layer-1'].keys[0].tick, 0);

  // Validate IK controllers are attached to Blue figure
  const obj = doc.keyframes[0].objects[0];
  assert.ok(obj._stykIK);
  assert.ok(obj._stykIK['4']); // Left hand
  assert.ok(obj._stykIK['6']); // Right hand
  assert.ok(obj._stykIK['8']); // Left foot
  assert.ok(obj._stykIK['10']); // Right foot
});

test('createAnimationProject: creates walker preset with custom dimensions', () => {
  const doc = createAnimationProject({
    canvasWidth: 1920,
    canvasHeight: 1080,
    fps: 30,
    projectName: 'HD Animation',
    preset: 'walker',
    defaultDuration: 5
  });

  assert.equal(doc.canvas_width, 1920);
  assert.equal(doc.canvas_height, 1080);
  assert.equal(doc.fps, 30);
  assert.equal(doc._styk.name, 'HD Animation');
  assert.equal(doc.figure_types[0].name, 'Walker');
  assert.equal(doc.keyframes[0].duration_raw, 5);
  assert.equal(doc.keyframes[0].objects[0].root_x, 960);
  assert.equal(doc.keyframes[0].objects[0].root_y, 540);
});

test('createAnimationProject: creates empty project', () => {
  const doc = createAnimationProject({ preset: 'empty' });
  assert.equal(doc.figure_types.length, 0);
  assert.equal(doc.keyframes.length, 1);
  assert.equal(doc.keyframes[0].objects.length, 0);
});

test('validateDocument: rejects invalid canvas dimensions or fps', () => {
  const doc = createEmptyDocument();
  // @ts-ignore
  doc.canvas_width = -100;
  assert.throws(() => validateDocument(doc), /canvas_width/);

  doc.canvas_width = 960;
  // @ts-ignore
  doc.fps = 0;
  assert.throws(() => validateDocument(doc), /fps/);
});

test('ProjectSession: persists active project across calls', () => {
  const doc = ProjectSession.reset({ projectName: 'Session Test', preset: 'walker' });
  assert.equal(ProjectSession.getActive()._styk.name, 'Session Test');
});
