import {
  StykDocument,
  StykFigureType,
  StykSegment,
  StykObject,
  StykRigConstraints,
  StykIKController,
  PrimitiveCode,
  SegmentType,
  SegmentKind
} from '../types/stykanimate.js';
import { ProjectSession } from './document.js';

export interface RigNodeInput {
  id: number;
  parentId: number;
  name?: string;
  // Either specify length and angle...
  length?: number;
  angleRad?: number;
  angleDeg?: number;
  // ...or specify end coordinate (x, y) relative to parent joint
  x?: number;
  y?: number;
  thickness?: number;
  primitive?: 'line' | 'circle' | 'circleFill' | 'circleClear' | 'squareLine' | PrimitiveCode;
  color?: [number, number, number];
  transparency?: number;
  isStatic?: boolean;
  bendRad?: number;
  constraints?: StykRigConstraints;
  ik?: {
    enabled?: boolean;
    pinned?: boolean;
    chainLength?: number;
    bendDirection?: number; // -1, 0, 1
    targetX?: number;
    targetY?: number;
  };
}

export interface DefineStickRigOptions {
  name: string;
  nodes: RigNodeInput[];
  rootX?: number;
  rootY?: number;
  scale?: number;
  addToProject?: boolean;
  figureTypeId?: number;
}

export interface JointPoint {
  start: { x: number; y: number };
  end: { x: number; y: number };
  angle: number;
  length: number;
}

export function parsePrimitive(prim?: string | number): {
  code: PrimitiveCode;
  type: SegmentType;
  kind: SegmentKind;
} {
  if (typeof prim === 'number') {
    switch (prim) {
      case 1:
        return { code: 1, type: 'circle', kind: 'circle' };
      case 2:
        return { code: 2, type: 'image', kind: 'image' };
      case 3:
        return { code: 3, type: 'circle', kind: 'circleFill' };
      case 4:
        return { code: 4, type: 'circle', kind: 'circleClear' };
      case 5:
        return { code: 5, type: 'text', kind: 'text' };
      case 6:
        return { code: 6, type: 'line', kind: 'squareLine' };
      case 0:
      default:
        return { code: 0, type: 'line', kind: 'line' };
    }
  }

  switch (prim) {
    case 'circle':
      return { code: 1, type: 'circle', kind: 'circle' };
    case 'circleFill':
      return { code: 3, type: 'circle', kind: 'circleFill' };
    case 'circleClear':
      return { code: 4, type: 'circle', kind: 'circleClear' };
    case 'squareLine':
      return { code: 6, type: 'line', kind: 'squareLine' };
    case 'line':
    default:
      return { code: 0, type: 'line', kind: 'line' };
  }
}

/**
 * Computes forward kinematics joint positions given root position and segment rotations.
 */
export function computeForwardKinematics(
  segments: StykSegment[],
  angles: number[],
  rootX: number,
  rootY: number,
  scale: number = 1
): Map<number, JointPoint> {
  const jointPoints = new Map<number, JointPoint>();
  const parentPositions = new Map<number, { x: number; y: number }>();
  parentPositions.set(0, { x: rootX, y: rootY });

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const angle = angles[i] ?? s.angle_rad;
    const len = s.length * scale;
    const parentPos = parentPositions.get(s.parent_id) ?? { x: rootX, y: rootY };

    const endX = parentPos.x + len * Math.cos(angle);
    const endY = parentPos.y + len * Math.sin(angle);

    const point: JointPoint = {
      start: { ...parentPos },
      end: { x: endX, y: endY },
      angle,
      length: len
    };

    jointPoints.set(s.segment_id, point);
    parentPositions.set(s.segment_id, { x: endX, y: endY });
  }

  return jointPoints;
}

export function defineStickRig(options: DefineStickRigOptions): {
  figure: StykFigureType;
  initialObject: StykObject;
} {
  const { name, nodes, rootX = 480, rootY = 270, scale = 1, addToProject = true } = options;

  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('define_stick_rig: nodes array must not be empty.');
  }

  // Validate node identifiers
  const nodeMap = new Map<number, RigNodeInput>();
  for (const node of nodes) {
    if (!Number.isInteger(node.id) || node.id <= 0) {
      throw new Error(`Node id must be a positive integer. Got: ${node.id}`);
    }
    if (nodeMap.has(node.id)) {
      throw new Error(`Duplicate node id ${node.id}`);
    }
    nodeMap.set(node.id, node);
  }

  // Validate parents and check for cycles
  for (const node of nodes) {
    if (node.parentId !== 0 && !nodeMap.has(node.parentId)) {
      throw new Error(`Node ${node.id} references nonexistent parentId ${node.parentId}`);
    }
    let cursor = node.parentId;
    const seen = new Set<number>([node.id]);
    while (cursor !== 0) {
      if (seen.has(cursor)) {
        throw new Error(`Cycle detected in rig topology at node ${node.id}`);
      }
      seen.add(cursor);
      cursor = nodeMap.get(cursor)?.parentId ?? 0;
    }
  }

  const segments: StykSegment[] = [];
  const ikControllers: Record<string, StykIKController> = {};

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    let length = node.length ?? 50;
    let angleRad = node.angleRad ?? (node.angleDeg !== undefined ? (node.angleDeg * Math.PI) / 180 : 0);

    // If x and y are provided instead of angle/length, compute them
    if (node.x !== undefined && node.y !== undefined && node.length === undefined) {
      length = Math.hypot(node.x, node.y);
      angleRad = Math.atan2(node.y, node.x);
    }

    const { code, type, kind } = parsePrimitive(node.primitive);
    const color = node.color ?? [13, 153, 255];
    const thickness = node.thickness ?? (type === 'circle' ? 0 : 12);
    const auxCode = node.isStatic ? 1 : 0;
    const flags = code | (auxCode << 8);

    const segment: StykSegment = {
      segment_id: node.id,
      parent_id: node.parentId,
      length,
      angle_rad: angleRad,
      thickness,
      bend_rad: node.bendRad ?? 0,
      primitive_code: code,
      aux_code: auxCode,
      flags,
      segment_type: type,
      segment_kind: kind,
      color_rgb: color,
      transparency: node.transparency ?? 0,
      visible: true,
      z_order: i + 1,
      is_static: Boolean(node.isStatic),
      name: node.name ?? `Segment ${node.id}`
    };

    if (node.constraints) {
      segment._stykRig = node.constraints;
    }

    segments.push(segment);
  }

  // Determine figure_type_id
  let figureTypeId = options.figureTypeId;
  let project: StykDocument | null = null;
  try {
    project = ProjectSession.getActive();
  } catch {
    project = null;
  }

  if (figureTypeId === undefined && project) {
    const existingIds = project.figure_types.map((f: StykFigureType) => f.figure_type_id);
    figureTypeId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  } else if (figureTypeId === undefined) {
    figureTypeId = 1;
  }

  const figure: StykFigureType = {
    figure_type_id: figureTypeId,
    name,
    segment_count: segments.length,
    segments,
    polyfills: [],
    image_assets: [],
    text_assets: []
  };

  const angles = segments.map((s) => s.angle_rad);
  const fkPoints = computeForwardKinematics(segments, angles, rootX, rootY, scale);

  // Setup IK controllers for requested nodes
  for (const node of nodes) {
    if (node.ik && (node.ik.enabled ?? true)) {
      const fk = fkPoints.get(node.id);
      const targetX = node.ik.targetX ?? fk?.end.x ?? rootX;
      const targetY = node.ik.targetY ?? fk?.end.y ?? rootY;
      const chainLen = node.ik.chainLength ?? 2;
      const bendDir = node.ik.bendDirection ?? 1;

      ikControllers[String(node.id)] = {
        enabled: true,
        pinned: Boolean(node.ik.pinned),
        allowStretch: false,
        bendDirection: bendDir,
        chainLength: chainLen,
        target: {
          x: targetX,
          y: targetY,
          rotation: 0
        },
        followers: {},
        bendReference: {
          side: bendDir === 0 ? 1 : bendDir,
          angle: fk ? fk.angle : 0,
          axis: fk ? Math.atan2(fk.end.y - fk.start.y, fk.end.x - fk.start.x) : 0,
          ratio: 0.98
        }
      };
    }
  }

  // Create initial pose object
  let uniqueId = 1;
  if (project) {
    const allUids = project.keyframes.flatMap((k) => k.objects.map((o) => o.unique_id));
    if (allUids.length > 0) {
      uniqueId = Math.max(...allUids) + 1;
    }
  }

  const initialObject: StykObject = {
    object_slot: 0,
    unique_id: uniqueId,
    figure_type_id: figureTypeId,
    root_x: rootX,
    root_y: rootY,
    scale,
    color_override_raw: 0,
    field28: 0,
    angles,
    len_flag: 0,
    lengths: [],
    bend_flag: 0,
    bends: [],
    join: null,
    opacity: 1,
    transparency: 0
  };

  if (Object.keys(ikControllers).length > 0) {
    initialObject._stykIK = ikControllers;
  }

  if (addToProject && project) {
    // Replace or add figure to document
    const existingIdx = project.figure_types.findIndex((f) => f.figure_type_id === figureTypeId);
    if (existingIdx >= 0) {
      project.figure_types[existingIdx] = figure;
    } else {
      project.figure_types.push(figure);
    }

    // Update first keyframe or add object
    if (project.keyframes.length > 0) {
      const firstFrame = project.keyframes[0];
      const objIdx = firstFrame.objects.findIndex((o) => o.figure_type_id === figureTypeId);
      if (objIdx >= 0) {
        firstFrame.objects[objIdx] = initialObject;
      } else {
        initialObject.object_slot = firstFrame.objects.length;
        firstFrame.objects.push(initialObject);
        firstFrame.object_draw_order.push(initialObject.object_slot);
        firstFrame.object_draw_order_unique_ids.push(initialObject.unique_id);
      }
    }

    if (project._styk.layers) {
      project._styk.layers.assignments[String(uniqueId)] = project._styk.layers.defaultLayerId || 'layer-1';
    }
  }

  return { figure, initialObject };
}
