import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { StykDocument } from '../types/stykanimate.js';
import { ProjectSession, validateDocument } from './document.js';

export interface CompileAndSaveOptions {
  document?: StykDocument;
  outputPath: string;
  format?: 'json' | 'styk-container' | 'auto';
  pretty?: boolean;
}

export interface CompileAndSaveResult {
  success: boolean;
  filePath: string;
  fileSizeBytes: number;
  format: 'json' | 'styk-container-v1';
  checksumSha256: string;
  metadata: {
    canvasWidth: number;
    canvasHeight: number;
    fps: number;
    figureCount: number;
    keyframeCount: number;
    totalDurationTicks: number;
    durationSeconds: number;
  };
}

/**
 * Builds a StykAnimate version 1 native compressed container.
 * Format specification from docs/native-file-format.md:
 * 0..3: ASCII 'STYK' (4 bytes)
 * 4: Container version (1 byte = 1)
 * 5: Compression method (1 byte = 1, zlib)
 * 6..7: Flags (2 bytes uint16 LE = 0)
 * 8..15: Uncompressed payload length (8 bytes uint64 LE)
 * 16..23: Compressed payload length (8 bytes uint64 LE)
 * 24..55: SHA-256 of uncompressed payload (32 bytes)
 * 56+: Compressed UTF-8 JSON payload
 */
export function buildStykContainerV1(jsonPayload: string): Buffer {
  const uncompressed = Buffer.from(jsonPayload, 'utf8');
  const compressed = zlib.deflateSync(uncompressed, { level: 3 });
  const hash = crypto.createHash('sha256').update(uncompressed).digest();

  const header = Buffer.alloc(56);
  // Magic: STYK
  header.write('STYK', 0, 4, 'ascii');
  // Version: 1
  header.writeUInt8(1, 4);
  // Compression: 1 (zlib)
  header.writeUInt8(1, 5);
  // Flags: 0
  header.writeUInt16LE(0, 6);
  // Uncompressed size (uint64 LE)
  header.writeBigUInt64LE(BigInt(uncompressed.length), 8);
  // Compressed size (uint64 LE)
  header.writeBigUInt64LE(BigInt(compressed.length), 16);
  // SHA-256 (32 bytes)
  hash.copy(header, 24, 0, 32);

  return Buffer.concat([header, compressed]);
}

export function compileAndSaveProject(options: CompileAndSaveOptions): CompileAndSaveResult {
  const doc = options.document ?? ProjectSession.getActive();
  validateDocument(doc);

  const outputPath = path.resolve(options.outputPath);
  const ext = path.extname(outputPath).toLowerCase();

  let resolvedFormat: 'json' | 'styk-container-v1' = 'json';
  if (options.format === 'styk-container' || (options.format === 'auto' && ext === '.styk')) {
    resolvedFormat = 'styk-container-v1';
  }

  // Ensure destination folder exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const jsonString = options.pretty !== false ? JSON.stringify(doc, null, 2) : JSON.stringify(doc);
  let fileBuffer: Buffer;

  if (resolvedFormat === 'styk-container-v1') {
    fileBuffer = buildStykContainerV1(jsonString);
  } else {
    fileBuffer = Buffer.from(jsonString, 'utf8');
  }

  // Atomic write via temporary file
  const tempPath = `${outputPath}.tmp-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, fileBuffer);
    fs.renameSync(tempPath, outputPath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
    throw new Error(`Failed to write file to ${outputPath}: ${(err as Error).message}`);
  }

  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const stats = fs.statSync(outputPath);
  const totalDurationTicks = doc.keyframes.reduce((sum, f) => sum + f.duration_raw, 0);

  return {
    success: true,
    filePath: outputPath,
    fileSizeBytes: stats.size,
    format: resolvedFormat,
    checksumSha256: sha256,
    metadata: {
      canvasWidth: doc.canvas_width,
      canvasHeight: doc.canvas_height,
      fps: doc.fps,
      figureCount: doc.figure_types.length,
      keyframeCount: doc.keyframes.length,
      totalDurationTicks,
      durationSeconds: totalDurationTicks / doc.fps
    }
  };
}
