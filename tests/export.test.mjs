import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {
  compileAndSaveProject,
  buildStykContainerV1,
  createAnimationProject
} from '../dist/index.js';

test('buildStykContainerV1: produces valid 56-byte header and compressed payload', () => {
  const jsonStr = JSON.stringify({ test: 'hello world', num: 42 });
  const container = buildStykContainerV1(jsonStr);

  assert.ok(container.length > 56);
  assert.equal(container.subarray(0, 4).toString('ascii'), 'STYK');
  assert.equal(container.readUInt8(4), 1); // version 1
  assert.equal(container.readUInt8(5), 1); // zlib compression
  assert.equal(container.readUInt16LE(6), 0); // flags

  const uncompressedLen = Number(container.readBigUInt64LE(8));
  assert.equal(uncompressedLen, Buffer.from(jsonStr).length);

  const compressedLen = Number(container.readBigUInt64LE(16));
  assert.equal(compressedLen, container.length - 56);

  // Check SHA-256
  const hash = crypto.createHash('sha256').update(Buffer.from(jsonStr)).digest();
  assert.deepEqual(container.subarray(24, 56), hash);

  // Decompress payload
  const inflated = zlib.inflateSync(container.subarray(56)).toString('utf8');
  assert.equal(inflated, jsonStr);
});

test('compileAndSaveProject: saves JSON project cleanly', () => {
  const doc = createAnimationProject({ projectName: 'Export Test', preset: 'blue' });
  const outPath = path.resolve('./temp_test_output/project.stykanimate');

  const result = compileAndSaveProject({
    document: doc,
    outputPath: outPath,
    format: 'json'
  });

  assert.ok(result.success);
  assert.equal(result.format, 'json');
  assert.ok(fs.existsSync(outPath));

  const content = fs.readFileSync(outPath, 'utf8');
  const parsed = JSON.parse(content);
  assert.equal(parsed.version, 5);
  assert.equal(parsed._styk.name, 'Export Test');

  // Clean up
  fs.rmSync(path.dirname(outPath), { recursive: true, force: true });
});

test('compileAndSaveProject: saves binary .styk container v1', () => {
  const doc = createAnimationProject({ projectName: 'Container Test', preset: 'walker' });
  const outPath = path.resolve('./temp_test_output/project.styk');

  const result = compileAndSaveProject({
    document: doc,
    outputPath: outPath,
    format: 'styk-container'
  });

  assert.ok(result.success);
  assert.equal(result.format, 'styk-container-v1');
  assert.ok(fs.existsSync(outPath));

  const buffer = fs.readFileSync(outPath);
  assert.equal(buffer.subarray(0, 4).toString('ascii'), 'STYK');

  // Clean up
  fs.rmSync(path.dirname(outPath), { recursive: true, force: true });
});
