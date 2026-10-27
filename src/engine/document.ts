import {
  StykDocument,
  StykFigureType,
  StykObject,
  StykKeyframe,
  StykSegment,
  StykLayerState,
  StykLayerSheet,
  StykCamera
} from '../types/stykanimate.js';

export interface CreateProjectOptions {
  canvasWidth?: number;
  canvasHeight?: number;
  fps?: number;
  projectName?: string;
  preset?: 'blue' | 'walker' | 'empty';
  defaultDuration?: number;
}

export function createLayerState(): StykLayerState {
  return {
    version: 1,
    nextId: 2,
    order: ['layer-1'],
    byId: {
      'layer-1': {
        name: 'Layer 1',
        visible: true,
        locked: false
      }
    },
    assignments: {},
    defaultLayerId: 'layer-1',
    activeId: 'layer-1',
    fixed: {
      scene: { visible: true, locked: false },
      camera: { visible: true, locked: false }
    }
  };
}

export function createLayerSheet(duration: number = 10, layerIds: string[] = ['layer-1']): StykLayerSheet {
  const tracks: StykLayerSheet['tracks'] = {
    scene: {
      end: duration,
      keys: [{ id: 'cell-scene-1', tick: 0, sourceTick: 0, interpolation: 'constant' }]
    },
    camera: {
      end: duration,
      keys: [{ id: 'cell-camera-1', tick: 0, sourceTick: 0, interpolation: 'constant' }]
    }
  };

  let nextId = 1;
  for (const id of layerIds) {
    tracks[id] = {
      end: duration,
      keys: [{ id: `cell-${nextId++}`, tick: 0, sourceTick: 0, interpolation: 'constant' }]
    };
  }

  return {
    version: 1,
    duration,
    nextId,
    tracks
  };
}

export function createDefaultCamera(): StykCamera {
  return {
    is_default: true,
    x: 0,
    y: 0,
    scale: 1,
    angle_rad: 0
  };
}

export function createFrame(objects: StykObject[] = [], durationRaw = 1): StykKeyframe {
  objects.forEach((object, i) => {
    object.object_slot = i;
  });

  return {
    duration_raw: durationRaw,
    inbetweens: Math.max(0, durationRaw - 1),
    background_id: 0,
    background_id_b: null,
    background_mix: 0,
    camera: createDefaultCamera(),
    objects,
    object_draw_order: objects.map((_, i) => i),
    object_draw_order_unique_ids: objects.map((o) => o.unique_id),
    _styk: {
      easing: { interpolation: 'constant' }
    }
  };
}

export function createWalkerFigure(figureTypeId = 1): StykFigureType {
  const PI = Math.PI;
  const seg = (
    id: number,
    parent: number,
    length: number,
    angle: number,
    thickness = 10,
    extra: Partial<StykSegment> = {}
  ): StykSegment => ({
    segment_id: id,
    parent_id: parent,
    length,
    angle_rad: angle,
    thickness,
    bend_rad: 0,
    primitive_code: 0,
    aux_code: 0,
    flags: 0,
    segment_type: 'line',
    segment_kind: 'line',
    color_rgb: [43, 43, 43],
    transparency: 0,
    visible: true,
    z_order: id,
    ...extra
  });

  const segments: StykSegment[] = [
    seg(1, 0, 78, -PI / 2, 11, { name: 'Torso' }),
    seg(2, 1, 44, -PI / 2, 8, {
      primitive_code: 1,
      flags: 1,
      segment_type: 'circle',
      segment_kind: 'circle',
      name: 'Head'
    }),
    seg(3, 1, 53, 1.05, 9, { name: 'Left arm' }),
    seg(4, 3, 48, 1.32, 8, { name: 'Left forearm' }),
    seg(5, 1, 53, 2.02, 9, { name: 'Right arm' }),
    seg(6, 5, 48, 1.65, 8, { name: 'Right forearm' }),
    seg(7, 0, 66, 1.12, 11, { name: 'Left leg' }),
    seg(8, 7, 63, 1.52, 10, { name: 'Left calf' }),
    seg(9, 0, 66, 2.0, 11, { name: 'Right leg' }),
    seg(10, 9, 63, 1.68, 10, { name: 'Right calf' })
  ];

  return {
    figure_type_id: figureTypeId,
    name: 'Walker',
    segment_count: segments.length,
    segments,
    polyfills: [],
    image_assets: [],
    text_assets: []
  };
}

export function createBlueFigure(figureTypeId = 1): { figure: StykFigureType; object: StykObject } {
  const PI = Math.PI;
  const segments: StykSegment[] = [
    {
      segment_id: 1,
      parent_id: 0,
      length: 78,
      angle_rad: -PI / 2,
      thickness: 16,
      bend_rad: 0,
      primitive_code: 0,
      aux_code: 0,
      flags: 0,
      segment_type: 'line',
      segment_kind: 'line',
      color_rgb: [13, 153, 255],
      transparency: 0,
      visible: true,
      z_order: 1,
      name: 'Torso'
    },
    {
      segment_id: 2,
      parent_id: 1,
      length: 44,
      angle_rad: -PI / 2,
      thickness: 0,
      bend_rad: 0,
      primitive_code: 3,
      aux_code: 0,
      flags: 3,
      segment_type: 'circle',
      segment_kind: 'circleFill',
      color_rgb: [13, 153, 255],
      transparency: 0,
      visible: true,
      z_order: 2,
      name: 'Head'
    },
    {
      segment_id: 3,
      parent_id: 1,
      length: 53,
      angle_rad: 1.05,
      thickness: 12,
      bend_rad: 0,
      primitive_code: 0,
      aux_code: 0,
      flags: 0,
      segment_type: 'line',
      segment_kind: 'line',
      color_rgb: [13, 153, 255],
      transparency: 0,
      visible: true,
      z_order: 3,
      name: 'Left upper arm'
    },
    {
      segment_id: 4,
      parent_id: 3,
      length: 48,
      angle_rad: 1.32,
      thickness: 12,
      bend_rad: 0,
      primitive_code: 0,
      aux_code: 0,
      flags: 0,
      segment_type: 'line',
      segment_kind: 'line',
      color_rgb: [13, 153, 255],
      transparency: 0,
      visible: true,
      z_order: 4,
      name: 'Left forearm'
    },
    {
      segment_id: 5,
      parent_id: 1,
      length: 53,
      angle_rad: 2.09159265,
      thickness: 12,
      bend_rad: 0,
      primitive_code: 0,
      aux_code: 0,
      flags: 0,
      segment_type: 'line',
      segment_kind: 'line',
      color_rgb: [13, 153, 255],
      transparency: 0,
      visible: true,
      z_order: 5,
      name: 'Right upper arm'
    },
    {
      segment_id: 6,
      parent_id: 5,
      length: 48,
      angle_rad: 1.82159265,
      thickness: 12,
      bend_rad: 0,
      primitive_code: 0,
      aux_code: 0,
      flags: 0,
      segment_type: 'line',
      segment_kind: 'line',
      color_rgb: [13, 153, 255],
      transparency: 0,
      visible: true,
      z_order: 6,
      name: 'Right forearm'
    },
    {
      segment_id: 7,
      parent_id: 0,
      length: 66,
      angle_rad: 1.12,
      thickness: 14,
      bend_rad: 0,
      primitive_code: 0,
      aux_code: 0,
      flags: 0,
      segment_type: 'line',
      segment_kind: 'line',
      color_rgb: [13, 153, 255],
      transparency: 0,
      visible: true,
      z_order: 7,
      name: 'Left thigh'
    },
    {
      segment_id: 8,
      parent_id: 7,
      length: 63,
      angle_rad: 1.52,
      thickness: 14,
      bend_rad: 0,
      primitive_code: 0,
      aux_code: 0,
      flags: 0,
      segment_type: 'line',
      segment_kind: 'line',
      color_rgb: [13, 153, 255],
      transparency: 0,
      visible: true,
      z_order: 8,
      name: 'Left lower leg'
    },
    {
      segment_id: 9,
      parent_id: 0,
      length: 66,
      angle_rad: 2.02159265,
      thickness: 14,
      bend_rad: 0,
      primitive_code: 0,
      aux_code: 0,
      flags: 0,
      segment_type: 'line',
      segment_kind: 'line',
      color_rgb: [13, 153, 255],
      transparency: 0,
      visible: true,
      z_order: 9,
      name: 'Right thigh'
    },
    {
      segment_id: 10,
      parent_id: 9,
      length: 63,
      angle_rad: 1.62159265,
      thickness: 14,
      bend_rad: 0,
      primitive_code: 0,
      aux_code: 0,
      flags: 0,
      segment_type: 'line',
      segment_kind: 'line',
      color_rgb: [13, 153, 255],
      transparency: 0,
      visible: true,
      z_order: 10,
      name: 'Right lower leg'
    }
  ];

  const figure: StykFigureType = {
    figure_type_id: figureTypeId,
    name: 'Blue',
    segment_count: segments.length,
    segments,
    polyfills: [],
    image_assets: [],
    text_assets: []
  };

  const object: StykObject = {
    object_slot: 0,
    unique_id: 1,
    figure_type_id: figureTypeId,
    root_x: 480,
    root_y: 280,
    scale: 1,
    color_override_raw: 0,
    field28: 0,
    angles: segments.map((s) => s.angle_rad),
    len_flag: 0,
    lengths: [],
    bend_flag: 0,
    bends: [],
    join: null,
    _stykIK: {
      '4': {
        enabled: true,
        pinned: false,
        allowStretch: false,
        bendDirection: 0,
        chainLength: 2,
        target: { x: 518.28, y: 294.47, rotation: 0 },
        followers: {},
        bendReference: { side: -1, angle: 1.05, axis: 1.178, ratio: 0.99 }
      },
      '6': {
        enabled: true,
        pinned: false,
        allowStretch: false,
        bendDirection: 0,
        chainLength: 2,
        target: { x: 441.72, y: 294.47, rotation: 0 },
        followers: {},
        bendReference: { side: 1, angle: 2.09, axis: 1.963, ratio: 0.99 }
      },
      '8': {
        enabled: true,
        pinned: false,
        allowStretch: false,
        bendDirection: 0,
        chainLength: 2,
        target: { x: 511.95, y: 402.33, rotation: 0 },
        followers: {},
        bendReference: { side: -1, angle: 1.12, axis: 1.315, ratio: 0.98 }
      },
      '10': {
        enabled: true,
        pinned: false,
        allowStretch: false,
        bendDirection: 0,
        chainLength: 2,
        target: { x: 448.05, y: 402.33, rotation: 0 },
        followers: {},
        bendReference: { side: 1, angle: 2.02, axis: 1.826, ratio: 0.98 }
      }
    },
    color_override_rgb: [0, 0, 0],
    color_override_mix: 0,
    transparency: 0,
    opacity: 1
  };

  return { figure, object };
}

export function createEmptyDocument(options: CreateProjectOptions = {}): StykDocument {
  const width = options.canvasWidth ?? 960;
  const height = options.canvasHeight ?? 540;
  const fps = options.fps ?? 24;
  const name = options.projectName ?? 'Untitled animation';

  if (!Number.isInteger(width) || width < 1 || width > 100000) {
    throw new RangeError(`Canvas width must be an integer between 1 and 100000. Received: ${width}`);
  }
  if (!Number.isInteger(height) || height < 1 || height > 100000) {
    throw new RangeError(`Canvas height must be an integer between 1 and 100000. Received: ${height}`);
  }
  if (!Number.isInteger(fps) || fps < 1 || fps > 1000) {
    throw new RangeError(`FPS must be an integer between 1 and 1000. Received: ${fps}`);
  }

  const layers = createLayerState();
  const duration = options.defaultDuration ?? 10;
  const layerSheet = createLayerSheet(duration, layers.order);

  return {
    version: 5,
    canvas_width: width,
    canvas_height: height,
    fps,
    auto_easing: false,
    auto_easing_disabled_raw: 1,
    auto_easing_source: 'file',
    backgrounds: [],
    figure_types: [],
    keyframes: [],
    _styk: {
      format: 'StykAnimate',
      format_version: 1,
      name,
      layers,
      layerSheet
    }
  };
}

export function createAnimationProject(options: CreateProjectOptions = {}): StykDocument {
  const doc = createEmptyDocument(options);
  const preset = options.preset ?? 'blue';
  const duration = options.defaultDuration ?? 10;

  if (preset === 'blue') {
    const { figure, object } = createBlueFigure(1);
    // Adjust root coordinates proportionally to canvas size
    object.root_x = Math.round((object.root_x / 960) * doc.canvas_width);
    object.root_y = Math.round((object.root_y / 540) * doc.canvas_height);

    // Adjust IK targets
    const dx = object.root_x - 480;
    const dy = object.root_y - 280;
    if (object._stykIK) {
      for (const control of Object.values(object._stykIK)) {
        if (control.target) {
          control.target.x += dx;
          control.target.y += dy;
        }
      }
    }

    doc.figure_types = [figure];
    doc.keyframes = [createFrame([object], duration)];
    if (doc._styk.layers) {
      doc._styk.layers.assignments[String(object.unique_id)] = 'layer-1';
    }
  } else if (preset === 'walker') {
    const figure = createWalkerFigure(1);
    const object: StykObject = {
      object_slot: 0,
      unique_id: 1,
      figure_type_id: 1,
      root_x: Math.round(doc.canvas_width / 2),
      root_y: Math.round(doc.canvas_height / 2),
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

    doc.figure_types = [figure];
    doc.keyframes = [createFrame([object], duration)];
    if (doc._styk.layers) {
      doc._styk.layers.assignments[String(object.unique_id)] = 'layer-1';
    }
  } else {
    // empty preset
    doc.keyframes = [createFrame([], duration)];
  }

  validateDocument(doc);
  return doc;
}

export function validateDocument(doc: StykDocument): void {
  if (!doc || doc.version !== 5) {
    throw new Error('Invalid document: version must be 5.');
  }
  if (!Number.isInteger(doc.canvas_width) || doc.canvas_width < 1 || doc.canvas_width > 100000) {
    throw new Error(`Invalid canvas_width: must be between 1 and 100000. Got: ${doc.canvas_width}`);
  }
  if (!Number.isInteger(doc.canvas_height) || doc.canvas_height < 1 || doc.canvas_height > 100000) {
    throw new Error(`Invalid canvas_height: must be between 1 and 100000. Got: ${doc.canvas_height}`);
  }
  if (!Number.isInteger(doc.fps) || doc.fps < 1 || doc.fps > 1000) {
    throw new Error(`Invalid fps: must be between 1 and 1000. Got: ${doc.fps}`);
  }
  if (!Array.isArray(doc.figure_types)) {
    throw new Error('Invalid figure_types: must be an array.');
  }
  if (!Array.isArray(doc.keyframes) || doc.keyframes.length === 0) {
    throw new Error('Invalid keyframes: must contain at least one keyframe.');
  }

  const figureTypeMap = new Map<number, StykFigureType>();
  for (const figure of doc.figure_types) {
    if (!Number.isInteger(figure.figure_type_id)) {
      throw new Error(`Invalid figure_type_id: ${figure.figure_type_id}`);
    }
    if (figureTypeMap.has(figure.figure_type_id)) {
      throw new Error(`Duplicate figure_type_id: ${figure.figure_type_id}`);
    }
    figureTypeMap.set(figure.figure_type_id, figure);

    if (!Array.isArray(figure.segments) || figure.segments.length === 0) {
      throw new Error(`Figure ${figure.name || figure.figure_type_id} has no segments.`);
    }

    // Verify acyclic hierarchy
    const segmentIds = new Set<number>();
    const parentMap = new Map<number, number>();
    for (const segment of figure.segments) {
      if (!Number.isInteger(segment.segment_id) || segment.segment_id <= 0) {
        throw new Error(`Invalid segment_id: ${segment.segment_id}`);
      }
      if (segmentIds.has(segment.segment_id)) {
        throw new Error(`Duplicate segment_id ${segment.segment_id} in figure ${figure.figure_type_id}`);
      }
      segmentIds.add(segment.segment_id);
      parentMap.set(segment.segment_id, segment.parent_id);
    }

    for (const [id, parent] of parentMap.entries()) {
      if (parent !== 0 && !segmentIds.has(parent)) {
        throw new Error(`Segment ${id} refers to nonexistent parent ${parent}`);
      }
      // Check for cycles
      let cursor = parent;
      const seen = new Set<number>([id]);
      while (cursor !== 0) {
        if (seen.has(cursor)) {
          throw new Error(`Cyclic segment hierarchy detected starting from segment ${id}`);
        }
        seen.add(cursor);
        cursor = parentMap.get(cursor) ?? 0;
      }
    }
  }

  // Validate keyframes
  for (let k = 0; k < doc.keyframes.length; k++) {
    const frame = doc.keyframes[k];
    if (!Number.isInteger(frame.duration_raw) || frame.duration_raw < 0) {
      throw new Error(`Keyframe ${k} has invalid duration_raw: ${frame.duration_raw}`);
    }
    const uids = new Set<number>();
    for (const obj of frame.objects) {
      if (uids.has(obj.unique_id)) {
        throw new Error(`Duplicate object unique_id ${obj.unique_id} in keyframe ${k}`);
      }
      uids.add(obj.unique_id);
      const figure = figureTypeMap.get(obj.figure_type_id);
      if (!figure) {
        throw new Error(`Object ${obj.unique_id} refers to nonexistent figure_type_id ${obj.figure_type_id}`);
      }
      if (!Array.isArray(obj.angles) || obj.angles.length !== figure.segments.length) {
        throw new Error(
          `Object ${obj.unique_id} angles array length (${obj.angles?.length}) does not match figure segments length (${figure.segments.length})`
        );
      }
    }
  }
}

/**
 * Singleton state store for in-memory active document session.
 */
export class ProjectSession {
  private static activeDocument: StykDocument | null = null;

  public static getActive(): StykDocument {
    if (!this.activeDocument) {
      this.activeDocument = createAnimationProject({ preset: 'blue' });
    }
    return this.activeDocument;
  }

  public static setActive(doc: StykDocument): void {
    validateDocument(doc);
    this.activeDocument = doc;
  }

  public static reset(options?: CreateProjectOptions): StykDocument {
    this.activeDocument = createAnimationProject(options);
    return this.activeDocument;
  }
}
