import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseStkBuffer,
  importLegacyAsset,
  ProjectSession
} from '../dist/index.js';

function createModernStkBuffer(segments) {
  // flags: 1 (line prim) | 2 (0 aux) | 4 (rgb 0,0,0) | 8 (0 trans) | 16 (implicit z) | 128 (no secondary)
  const flags = 1 | 2 | 4 | 8 | 16 | 128;
  const header = Buffer.alloc(3);
  header.writeUInt8(flags, 0);
  header.writeUInt16LE(segments.length, 1);

  const segBuffers = [];
  for (const s of segments) {
    const buf = Buffer.alloc(20);
    buf.writeUInt16LE(s.parentId, 0);
    buf.writeUInt16LE(s.segmentId, 2);
    buf.writeFloatLE(s.length, 4);
    buf.writeDoubleLE(s.angleRad, 8);
    buf.writeFloatLE(s.thickness, 16);
    segBuffers.push(buf);
  }

  // Bends count: 0
  const bends = Buffer.alloc(2);
  bends.writeUInt16LE(0, 0);

  // Polys count: 0
  const polys = Buffer.alloc(2);
  polys.writeUInt16LE(0, 0);

  const payload = Buffer.concat([header, ...segBuffers, bends, polys]);
  const compressed = zlib.deflateSync(payload);

  // Modern STK prefix 0x79
  return Buffer.concat([Buffer.from([0x79]), compressed]);
}

test('parseStkBuffer: parses modern zlib-compressed STK binary figure', () => {
  const segments = [
    { segmentId: 1, parentId: 0, length: 80, angleRad: -Math.PI / 2, thickness: 12 },
    { segmentId: 2, parentId: 1, length: 40, angleRad: -Math.PI / 2, thickness: 10 },
    { segmentId: 3, parentId: 1, length: 50, angleRad: 1.2, thickness: 10 }
  ];

  const stkBuffer = createModernStkBuffer(segments);
  const figure = parseStkBuffer(stkBuffer, 'TestModernStk');

  assert.equal(figure.name, 'TestModernStk');
  assert.equal(figure.segment_count, 3);
  assert.equal(figure.segments.length, 3);
  assert.equal(figure.segments[0].segment_id, 1);
  assert.equal(figure.segments[0].parent_id, 0);
  assert.equal(Math.round(figure.segments[0].length), 80);
  assert.equal(figure.segments[1].parent_id, 1);
});

test('importLegacyAsset: imports STK from file and attaches to project', () => {
  ProjectSession.reset({ preset: 'empty' });

  const segments = [
    { segmentId: 1, parentId: 0, length: 75, angleRad: 0, thickness: 10 },
    { segmentId: 2, parentId: 1, length: 60, angleRad: 1.5, thickness: 10 }
  ];
  const stkBuffer = createModernStkBuffer(segments);
  const tempFile = path.resolve('./temp_test_output_legacy/sample.stk');
  fs.mkdirSync(path.dirname(tempFile), { recursive: true });
  fs.writeFileSync(tempFile, stkBuffer);

  const result = importLegacyAsset({
    filePath: tempFile,
    figureName: 'FileStk',
    addToProject: true
  });

  assert.equal(result.kind, 'figure');
  assert.equal(result.name, 'FileStk');
  assert.equal(result.segmentsCount, 2);

  // Clean up
  fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });

  // Active project should now have this figure
  const project = ProjectSession.getActive();
  assert.equal(project.figure_types.length, 1);
  assert.equal(project.figure_types[0].name, 'FileStk');

  // Clean up
  fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
});
