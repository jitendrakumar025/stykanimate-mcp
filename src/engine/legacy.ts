import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import {
  StykFigureType,
  StykSegment,
  StykDocument,
  StykObject,
  StykKeyframe,
  PrimitiveCode,
  SegmentType,
  SegmentKind
} from '../types/stykanimate.js';
import { createFrame, ProjectSession, validateDocument } from './document.js';

export interface ImportLegacyAssetOptions {
  filePath?: string;
  fileBuffer?: Buffer;
  format?: 'stk' | 'piv' | 'nodes' | 'auto';
  figureName?: string;
  addToProject?: boolean;
}

export interface LegacyImportResult {
  kind: 'figure' | 'document';
  name: string;
  figure?: StykFigureType;
  document?: StykDocument;
  segmentsCount?: number;
  frameCount?: number;
  sourceFormat: string;
  importedVia: 'native-ts' | 'codec-bridge';
}

class BinaryReader {
  private buffer: Buffer;
  public pos: number = 0;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  get remaining(): number {
    return this.buffer.length - this.pos;
  }

  ensure(count: number): void {
    if (this.pos + count > this.buffer.length) {
      throw new Error(`Unexpected end of data at offset ${this.pos}, needed ${count} bytes.`);
    }
  }

  u8(): number {
    this.ensure(1);
    return this.buffer.readUInt8(this.pos++);
  }

  u16(): number {
    this.ensure(2);
    const val = this.buffer.readUInt16LE(this.pos);
    this.pos += 2;
    return val;
  }

  u32(): number {
    this.ensure(4);
    const val = this.buffer.readUInt32LE(this.pos);
    this.pos += 4;
    return val;
  }

  i32(): number {
    this.ensure(4);
    const val = this.buffer.readInt32LE(this.pos);
    this.pos += 4;
    return val;
  }

  f32(): number {
    this.ensure(4);
    const val = this.buffer.readFloatLE(this.pos);
    this.pos += 4;
    return val;
  }

  f64(): number {
    this.ensure(8);
    const val = this.buffer.readDoubleLE(this.pos);
    this.pos += 8;
    return val;
  }

  bytes(count: number): Buffer {
    this.ensure(count);
    const slice = this.buffer.subarray(this.pos, this.pos + count);
    this.pos += count;
    return slice;
  }

  string8(): string {
    const len = this.u8();
    if (len === 0) return '';
    const slice = this.bytes(len);
    return slice.toString('utf8');
  }
}

/**
 * Decompress STK file buffer if compressed.
 */
function unpackStkBuffer(buffer: Buffer): Buffer {
  if (buffer.length < 2) return buffer;
  // Modern STK files start with 0x79 or 0x7a followed by zlib-compressed payload
  if ((buffer[0] === 0x79 || buffer[0] === 0x7a) && buffer[1] === 0x78) {
    try {
      return zlib.inflateSync(buffer.subarray(1));
    } catch {
      // fallback
    }
  }
  // Try direct zlib decompress
  try {
    return zlib.inflateSync(buffer);
  } catch {
    return buffer;
  }
}

/**
 * Pure TypeScript parser for Pivot .stk stick figure files.
 */
export function parseStkBuffer(rawBuffer: Buffer, figureName: string = 'ImportedFigure'): StykFigureType {
  const payload = unpackStkBuffer(rawBuffer);
  const reader = new BinaryReader(payload);

  const flags = reader.u8();
  const count = reader.u16();

  if (count <= 0 || count > 30000) {
    throw new Error(`Invalid segment count in STK: ${count}`);
  }

  const segments: StykSegment[] = [];

  for (let i = 0; i < count; i++) {
    const parentId = reader.u16();
    const segmentId = flags & 32 ? i + 1 : reader.u16();
    const length = reader.f32();
    const angleRad = reader.f64();
    const thickness = reader.f32();

    const prim = flags & 1 ? 0 : reader.u8();
    const aux = flags & 2 ? 0 : reader.u8();
    const rgb: [number, number, number] = flags & 4 ? [0, 0, 0] : [reader.u8(), reader.u8(), reader.u8()];
    const trans = flags & 8 ? 0 : reader.u8();

    if (!(flags & 128)) {
      const hasSecondary = reader.u8();
      if (hasSecondary) {
        reader.bytes(4); // rgb + a
      }
    }

    if (prim === 2 || prim === 5) {
      reader.bytes(4); // extra u16, u8, u8
    }

    let primitiveCode: PrimitiveCode = 0;
    if (prim >= 0 && prim <= 6) {
      primitiveCode = prim as PrimitiveCode;
    }

    let segType: SegmentType = 'line';
    let segKind: SegmentKind = 'line';
    if (primitiveCode === 1) {
      segType = 'circle';
      segKind = 'circle';
    } else if (primitiveCode === 3) {
      segType = 'circle';
      segKind = 'circleFill';
    } else if (primitiveCode === 4) {
      segType = 'circle';
      segKind = 'circleClear';
    } else if (primitiveCode === 6) {
      segType = 'line';
      segKind = 'squareLine';
    }

    segments.push({
      segment_id: segmentId,
      parent_id: parentId,
      length,
      angle_rad: angleRad,
      thickness,
      bend_rad: 0,
      primitive_code: primitiveCode,
      aux_code: aux,
      flags: prim | (aux << 8),
      segment_type: segType,
      segment_kind: segKind,
      color_rgb: rgb,
      transparency: trans,
      color_alpha: 1 - trans / 255,
      visible: thickness > 0.01 || primitiveCode !== 0,
      z_order: i + 1,
      is_static: Boolean(aux & 1),
      name: `Segment ${segmentId}`
    });
  }

  // Read bends if remaining
  if (reader.remaining >= 2) {
    const bendCount = reader.u16();
    for (let b = 0; b < bendCount; b++) {
      if (reader.remaining >= 10) {
        const idx = reader.u16();
        const bend = reader.f64();
        if (idx < segments.length) {
          segments[idx].bend_rad = bend;
        }
      }
    }
  }

  // Name if present
  let resolvedName = figureName;
  if (reader.remaining > 0) {
    try {
      const embeddedName = reader.string8();
      if (embeddedName && embeddedName.trim()) {
        resolvedName = embeddedName.trim();
      }
    } catch {
      // ignore name decode error
    }
  }

  return {
    figure_type_id: 1,
    name: resolvedName,
    segment_count: segments.length,
    segments,
    polyfills: [],
    image_assets: [],
    text_assets: []
  };
}

/**
 * Pure TypeScript parser for Pivot .piv animation documents.
 */
export function parsePivBuffer(rawBuffer: Buffer): StykDocument {
  let payload = rawBuffer;
  // If compressed with zlib, inflate
  try {
    payload = zlib.inflateSync(rawBuffer);
  } catch {
    payload = rawBuffer;
  }

  const reader = new BinaryReader(payload);
  const version = reader.u8();

  if (version !== 5) {
    throw new Error(`Pure TypeScript PIV parser currently handles modern Pivot version 5 (found v${version}).`);
  }

  const width = reader.u32();
  const height = reader.u32();
  const bgCount = reader.u16();

  // Skip backgrounds
  for (let b = 1; b < bgCount; b++) {
    const kind = reader.u8();
    if (kind === 0 || kind === 1) {
      const endOffset = Number(reader.u32());
      reader.u32(); // high 32 bits
      reader.pos = endOffset;
    } else if (kind === 2) {
      reader.u32();
    } else if (kind === 3 || kind === 4) {
      reader.u32();
      reader.u32();
      reader.bytes(16); // 4 floats
    }
    reader.string8(); // name
  }

  // Figures
  const figureCount = reader.u16();
  const figures: StykFigureType[] = [];

  for (let f = 1; f <= figureCount; f++) {
    const flags = reader.u8();
    const count = reader.u16();
    const segments: StykSegment[] = [];

    for (let i = 0; i < count; i++) {
      const parentId = reader.u16();
      const segId = flags & 32 ? i + 1 : reader.u16();
      const length = reader.f32();
      const angleRad = reader.f64();
      const thickness = reader.f32();
      const prim = flags & 1 ? 0 : reader.u8();
      const aux = flags & 2 ? 0 : reader.u8();
      const rgb: [number, number, number] = flags & 4 ? [0, 0, 0] : [reader.u8(), reader.u8(), reader.u8()];
      const trans = flags & 8 ? 0 : reader.u8();

      if (!(flags & 128)) {
        const hasSecondary = reader.u8();
        if (hasSecondary) reader.bytes(4);
      }
      if (prim === 2 || prim === 5) reader.bytes(4);

      let primitiveCode: PrimitiveCode = 0;
      if (prim >= 0 && prim <= 6) primitiveCode = prim as PrimitiveCode;

      segments.push({
        segment_id: segId,
        parent_id: parentId,
        length,
        angle_rad: angleRad,
        thickness,
        bend_rad: 0,
        primitive_code: primitiveCode,
        aux_code: aux,
        flags: prim | (aux << 8),
        segment_type: primitiveCode === 1 || primitiveCode === 3 ? 'circle' : 'line',
        segment_kind: primitiveCode === 3 ? 'circleFill' : primitiveCode === 1 ? 'circle' : 'line',
        color_rgb: rgb,
        transparency: trans,
        visible: thickness > 0.01 || primitiveCode !== 0,
        z_order: i + 1,
        is_static: Boolean(aux & 1)
      });
    }

    const bendCount = reader.u16();
    for (let b = 0; b < bendCount; b++) {
      const idx = reader.u16();
      const val = reader.f64();
      if (idx < segments.length) segments[idx].bend_rad = val;
    }

    const polyCount = reader.u16();
    for (let p = 0; p < polyCount; p++) {
      const sc = reader.u16();
      reader.bytes(4); // rgb + alpha
      reader.bytes(sc * 2); // vertices
    }

    if (!(flags & 16)) {
      reader.bytes(count * 2);
      reader.bytes(polyCount * 2);
    }

    if (flags & 64) {
      reader.bytes(8);
    }

    const figName = reader.string8();
    figures.push({
      figure_type_id: f,
      name: figName || `Figure ${f}`,
      segment_count: segments.length,
      segments,
      polyfills: []
    });
  }

  // Keyframes
  const keyframeCount = reader.u32();
  const keyframes: StykKeyframe[] = [];

  for (let k = 0; k < keyframeCount; k++) {
    const duration = reader.u16();
    const mix = reader.u8();
    const bgId = reader.u16();
    if (mix) reader.u16();

    const objCount = reader.u16();
    const objects: StykObject[] = [];

    for (let o = 0; o < objCount; o++) {
      const uid = reader.u32();
      const tid = reader.u16();
      const scale = reader.f32();
      const colorRaw = reader.u32();
      const field28 = reader.u8();

      const fig = figures.find((item) => item.figure_type_id === tid);
      const segCount = fig ? fig.segment_count : 0;
      const angles: number[] = [];
      for (let s = 0; s < segCount; s++) {
        angles.push(reader.f64());
      }

      const rootX = reader.f32();
      const rootY = reader.f32();

      const lenFlag = reader.u16();
      const lengths: number[] = [];
      if (lenFlag) {
        for (let s = 0; s < segCount; s++) lengths.push(reader.f32());
      }

      const bendFlag = reader.u16();
      const bends: number[] = [];
      if (bendFlag) {
        for (let s = 0; s < segCount; s++) bends.push(reader.f64());
      }

      const hasJoin = reader.u8();
      let join = null;
      if (hasJoin) {
        const slot = reader.u16();
        const handle = reader.u16();
        join = { target_object_slot: slot, target_handle_id: handle };
      }

      objects.push({
        object_slot: o,
        unique_id: uid,
        figure_type_id: tid,
        root_x: rootX,
        root_y: rootY,
        scale,
        color_override_raw: colorRaw,
        field28,
        angles,
        len_flag: lenFlag,
        lengths,
        bend_flag: bendFlag,
        bends,
        join,
        opacity: 1 - field28 / 255,
        transparency: field28
      });
    }

    const order: number[] = [];
    for (let o = 0; o < objCount; o++) {
      order.push(reader.u16());
    }

    const isDefaultCam = Boolean(reader.u8());
    let cam = { is_default: true, x: 0, y: 0, scale: 1, angle_rad: 0 };
    if (!isDefaultCam) {
      cam = {
        is_default: false,
        x: reader.f32(),
        y: reader.f32(),
        angle_rad: reader.f64(),
        scale: reader.f32()
      };
    }

    keyframes.push({
      duration_raw: duration,
      inbetweens: Math.max(0, duration - 1),
      background_id: bgId,
      background_mix: mix,
      camera: cam,
      objects,
      object_draw_order: order,
      object_draw_order_unique_ids: order.map((idx) => objects[idx]?.unique_id ?? 0)
    });
  }

  const fps = reader.remaining >= 4 ? reader.u32() : 24;

  return {
    version: 5,
    canvas_width: width,
    canvas_height: height,
    fps: fps || 24,
    auto_easing: false,
    backgrounds: [],
    figure_types: figures,
    keyframes,
    _styk: {
      format: 'StykAnimate',
      format_version: 1,
      name: 'Imported PIV Project'
    }
  };
}

/**
 * Attempts to import via Python codec_bridge.py if present.
 */
export function importViaCodecBridge(targetPath: string): StykDocument | null {
  const bridgeScript = path.resolve('temp_stykanimate/codecs/codec_bridge.py');
  if (!fs.existsSync(bridgeScript)) {
    return null;
  }

  const tempReq = path.resolve(`.tmp_req_${Date.now()}.json`);
  const tempRes = path.resolve(`.tmp_res_${Date.now()}.json`);

  try {
    fs.writeFileSync(tempReq, JSON.stringify({ operation: 'load', path: path.resolve(targetPath) }), 'utf8');
    execFileSync('python', [bridgeScript, '--request', tempReq, '--response', tempRes], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000
    });

    if (fs.existsSync(tempRes)) {
      const response = JSON.parse(fs.readFileSync(tempRes, 'utf8'));
      if (response.ok && response.document) {
        return response.document as StykDocument;
      }
    }
  } catch (err) {
    process.stderr.write(`[codec-bridge] Bridge fallback encountered: ${(err as Error).message}\n`);
  } finally {
    try {
      if (fs.existsSync(tempReq)) fs.unlinkSync(tempReq);
      if (fs.existsSync(tempRes)) fs.unlinkSync(tempRes);
    } catch {}
  }

  return null;
}

/**
 * Unified legacy asset importer for .piv, .stk, and Stick Nodes.
 */
export function importLegacyAsset(options: ImportLegacyAssetOptions): LegacyImportResult {
  const { filePath, fileBuffer, figureName, addToProject = true } = options;

  let buffer: Buffer;
  let ext = '';
  let resolvedName = figureName ?? 'ImportedFigure';

  if (filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    buffer = fs.readFileSync(filePath);
    ext = path.extname(filePath).toLowerCase();
    resolvedName = figureName ?? path.basename(filePath, ext);
  } else if (fileBuffer) {
    buffer = fileBuffer;
  } else {
    throw new Error('import_legacy_asset: Either filePath or fileBuffer must be provided.');
  }

  const format = options.format && options.format !== 'auto' ? options.format : ext.replace('.', '');

  // 1. Pure TypeScript STK reader (faster, exact, zero dependency)
  if (format === 'stk') {
    try {
      const figure = parseStkBuffer(buffer, resolvedName);
      const project = ProjectSession.getActive();

      if (addToProject && project) {
        const existingIds = project.figure_types.map((f) => f.figure_type_id);
        figure.figure_type_id = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
        project.figure_types.push(figure);

        // Create an object in the first keyframe
        const obj: StykObject = {
          object_slot: project.keyframes[0]?.objects.length ?? 0,
          unique_id: Math.max(0, ...project.keyframes.flatMap((k) => k.objects.map((o) => o.unique_id))) + 1,
          figure_type_id: figure.figure_type_id,
          root_x: Math.round(project.canvas_width / 2),
          root_y: Math.round(project.canvas_height / 2),
          scale: 1,
          color_override_raw: 0,
          field28: 0,
          angles: figure.segments.map((s) => s.angle_rad),
          len_flag: 0,
          lengths: [],
          bend_flag: 0,
          bends: [],
          join: null,
          opacity: 1,
          transparency: 0
        };

        if (project.keyframes.length === 0) {
          project.keyframes.push(createFrame([obj], 10));
        } else {
          project.keyframes[0].objects.push(obj);
          project.keyframes[0].object_draw_order.push(obj.object_slot);
          project.keyframes[0].object_draw_order_unique_ids.push(obj.unique_id);
        }
      }

      return {
        kind: 'figure',
        name: resolvedName,
        figure,
        segmentsCount: figure.segment_count,
        sourceFormat: 'stk',
        importedVia: 'native-ts'
      };
    } catch {
      // Fallback to python codec bridge
    }
  }

  // 2. Try python codec bridge if file path is available (e.g. for PIV projects)
  if (filePath && (format === 'piv' || format === 'stk')) {
    const bridgeDoc = importViaCodecBridge(filePath);
    if (bridgeDoc) {
      const isFigure = format === 'stk';
      if (addToProject) {
        if (isFigure) {
          const project = ProjectSession.getActive();
          const fig = bridgeDoc.figure_types[0];
          if (fig && project) {
            const existingIds = project.figure_types.map((f) => f.figure_type_id);
            fig.figure_type_id = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
            if (figureName) fig.name = figureName;
            project.figure_types.push(fig);
          }
        } else {
          ProjectSession.setActive(bridgeDoc);
        }
      }
      return {
        kind: isFigure ? 'figure' : 'document',
        name: isFigure ? (figureName || bridgeDoc.figure_types[0]?.name || resolvedName) : (bridgeDoc._styk?.name || resolvedName),
        document: bridgeDoc,
        figure: bridgeDoc.figure_types[0],
        frameCount: bridgeDoc.keyframes.length,
        segmentsCount: bridgeDoc.figure_types[0]?.segment_count,
        sourceFormat: format,
        importedVia: 'codec-bridge'
      };
    }
  }

  // 3. Pure TypeScript PIV reader
  if (format === 'piv') {
    const doc = parsePivBuffer(buffer);
    if (addToProject) {
      ProjectSession.setActive(doc);
    }
    return {
      kind: 'document',
      name: doc._styk?.name || resolvedName,
      document: doc,
      figure: doc.figure_types[0],
      frameCount: doc.keyframes.length,
      segmentsCount: doc.figure_types[0]?.segment_count,
      sourceFormat: 'piv',
      importedVia: 'native-ts'
    };
  }

  // 4. JSON or Stick Nodes format
  try {
    const text = buffer.toString('utf8');
    const parsed = JSON.parse(text);
    if (parsed.version === 5 && parsed.figure_types && parsed.keyframes) {
      validateDocument(parsed as StykDocument);
      if (addToProject) {
        ProjectSession.setActive(parsed as StykDocument);
      }
      return {
        kind: 'document',
        name: parsed._styk?.name || resolvedName,
        document: parsed,
        figure: parsed.figure_types[0],
        frameCount: parsed.keyframes.length,
        segmentsCount: parsed.figure_types[0]?.segment_count,
        sourceFormat: 'json',
        importedVia: 'native-ts'
      };
    }
  } catch {}

  throw new Error(`Unsupported or unrecognized asset format: ${format}. Supported types: .stk, .piv, .json`);
}
