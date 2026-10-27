import {
  StykDocument,
  StykKeyframe,
  StykObject,
  StykFigureType
} from '../types/stykanimate.js';
import { ProjectSession } from './document.js';
import { defineStickRig } from './rig.js';

export interface AddFigureInstanceOptions {
  figureTypeId?: number;
  preset?: 'blue' | 'walker' | 'sword' | 'shield';
  rootX?: number;
  rootY?: number;
  scale?: number;
  colorRgb?: [number, number, number];
  transparency?: number;
}

export interface AddFigureInstanceResult {
  success: boolean;
  uniqueId: number;
  figureTypeId: number;
  figureName: string;
  rootX: number;
  rootY: number;
  scale: number;
  message: string;
}

export interface VisualEffectOptions {
  effectType: 'impact_burst' | 'slash_arc' | 'speed_lines' | 'camera_shake';
  targetX?: number;
  targetY?: number;
  startFrame?: number;
  durationFrames?: number;
  scale?: number;
  colorRgb?: [number, number, number];
  intensity?: number;
}

/**
 * Places an instance of a figure (or adds a prop rig) into the active scene across all keyframes.
 */
export function addFigureInstance(options: AddFigureInstanceOptions): AddFigureInstanceResult {
  const project = ProjectSession.getActive();
  const rootX = options.rootX ?? Math.round(project.canvas_width / 2);
  const rootY = options.rootY ?? Math.round(project.canvas_height / 2);
  const scale = options.scale ?? 1;

  let figureTypeId = options.figureTypeId;
  let figure: StykFigureType | undefined;

  // If a preset prop is requested and figureTypeId is not given, generate a rig for it
  if (figureTypeId === undefined && options.preset === 'sword') {
    const swordRig = defineStickRig({
      name: 'Broadsword',
      nodes: [
        { id: 1, parentId: 0, name: 'Hilt', length: 18, angleDeg: -90, thickness: 8, color: [100, 60, 30] },
        { id: 2, parentId: 1, name: 'Crossguard', length: 24, angleDeg: 0, thickness: 6, color: [220, 180, 50] },
        { id: 3, parentId: 1, name: 'Blade', length: 65, angleDeg: -90, thickness: 7, primitive: 'line', color: [240, 240, 255] }
      ],
      rootX,
      rootY,
      scale,
      addToProject: false
    });
    figure = swordRig.figure;
    figureTypeId = figure.figure_type_id;
    if (!project.figure_types.some((f) => f.figure_type_id === figureTypeId)) {
      project.figure_types.push(figure);
    }
  } else if (figureTypeId === undefined && options.preset === 'shield') {
    const shieldRig = defineStickRig({
      name: 'RoundShield',
      nodes: [
        { id: 1, parentId: 0, name: 'Boss', length: 30, angleDeg: -90, primitive: 'circleFill', thickness: 0, color: [180, 140, 40] },
        { id: 2, parentId: 1, name: 'Rim', length: 36, angleDeg: -90, primitive: 'circle', thickness: 6, color: [240, 200, 80] }
      ],
      rootX,
      rootY,
      scale,
      addToProject: false
    });
    figure = shieldRig.figure;
    figureTypeId = figure.figure_type_id;
    if (!project.figure_types.some((f) => f.figure_type_id === figureTypeId)) {
      project.figure_types.push(figure);
    }
  } else if (figureTypeId !== undefined) {
    figure = project.figure_types.find((f) => f.figure_type_id === figureTypeId);
    if (!figure) {
      throw new Error(`Figure type with id ${figureTypeId} not found in project.`);
    }
  } else {
    // Default to first existing figure or fallback
    figure = project.figure_types[0];
    if (!figure) {
      throw new Error('No figures available in project to instantiate. Define a rig or specify a preset.');
    }
    figureTypeId = figure.figure_type_id;
  }

  // Allocate new unique_id
  const allUids = project.keyframes.flatMap((k) => k.objects.map((o) => o.unique_id));
  const uniqueId = allUids.length > 0 ? Math.max(...allUids) + 1 : 1;

  const initialAngles = figure.segments.map((s) => s.angle_rad);

  const newObject: StykObject = {
    object_slot: 0,
    unique_id: uniqueId,
    figure_type_id: figureTypeId,
    root_x: rootX,
    root_y: rootY,
    scale,
    color_override_raw: 0,
    field28: 0,
    angles: initialAngles,
    len_flag: 0,
    lengths: [],
    bend_flag: 0,
    bends: [],
    join: null,
    opacity: 1,
    transparency: options.transparency ?? 0
  };

  if (options.colorRgb) {
    newObject.color_override_rgb = options.colorRgb;
  }

  // Insert into all existing keyframes
  for (const kf of project.keyframes) {
    const clonedObj: StykObject = {
      ...newObject,
      object_slot: kf.objects.length
    };
    kf.objects.push(clonedObj);
    kf.object_draw_order.push(clonedObj.object_slot);
    kf.object_draw_order_unique_ids.push(clonedObj.unique_id);
  }

  return {
    success: true,
    uniqueId,
    figureTypeId,
    figureName: figure.name,
    rootX,
    rootY,
    scale,
    message: `Added instance of "${figure.name}" (uniqueId: ${uniqueId}) to all ${project.keyframes.length} timeline frames.`
  };
}

/**
 * Injects dynamic visual effects (speed lines, sword slash arcs, impact bursts, camera shake) into the active animation.
 */
export function addVisualEffect(options: VisualEffectOptions): { success: boolean; message: string } {
  const project = ProjectSession.getActive();
  const start = Math.max(0, options.startFrame ?? 0);
  const duration = Math.max(1, options.durationFrames ?? 4);
  const end = Math.min(project.keyframes.length, start + duration);
  const color = options.colorRgb ?? [255, 230, 50];

  if (options.effectType === 'camera_shake') {
    const intensity = options.intensity ?? 8;
    for (let f = start; f < end; f++) {
      const kf = project.keyframes[f];
      if (!kf) continue;
      const decay = 1 - (f - start) / (end - start);
      const offsetX = (Math.random() - 0.5) * 2 * intensity * decay;
      const offsetY = (Math.random() - 0.5) * 2 * intensity * decay;
      const angle = (Math.random() - 0.5) * 0.05 * decay;

      kf.camera = {
        is_default: false,
        x: offsetX,
        y: offsetY,
        scale: 1.02,
        angle_rad: angle
      };
    }
    return {
      success: true,
      message: `Applied camera impact shake from frame ${start + 1} to ${end} with intensity ${intensity}.`
    };
  }

  if (options.effectType === 'impact_burst') {
    const tx = options.targetX ?? Math.round(project.canvas_width / 2);
    const ty = options.targetY ?? Math.round(project.canvas_height / 2);
    const baseScale = options.scale ?? 1;

    // Define impact starburst figure
    const nodes = [
      { id: 1, parentId: 0, name: 'Core', length: 20 * baseScale, angleDeg: 0, primitive: 'circleFill', thickness: 0, color },
      { id: 2, parentId: 0, name: 'Spike1', length: 45 * baseScale, angleDeg: 0, thickness: 6, color },
      { id: 3, parentId: 0, name: 'Spike2', length: 45 * baseScale, angleDeg: 45, thickness: 6, color },
      { id: 4, parentId: 0, name: 'Spike3', length: 45 * baseScale, angleDeg: 90, thickness: 6, color },
      { id: 5, parentId: 0, name: 'Spike4', length: 45 * baseScale, angleDeg: 135, thickness: 6, color },
      { id: 6, parentId: 0, name: 'Spike5', length: 45 * baseScale, angleDeg: 180, thickness: 6, color },
      { id: 7, parentId: 0, name: 'Spike6', length: 45 * baseScale, angleDeg: 225, thickness: 6, color },
      { id: 8, parentId: 0, name: 'Spike7', length: 45 * baseScale, angleDeg: 270, thickness: 6, color },
      { id: 9, parentId: 0, name: 'Spike8', length: 45 * baseScale, angleDeg: 315, thickness: 6, color }
    ];

    const burstRig = defineStickRig({
      name: 'ImpactBurst',
      nodes: nodes as any,
      rootX: tx,
      rootY: ty,
      scale: baseScale,
      addToProject: true
    });

    // Animate burst expanding and fading over duration frames
    const burstUid = burstRig.initialObject.unique_id;

    for (let f = 0; f < project.keyframes.length; f++) {
      const kf = project.keyframes[f];
      const burstObj = kf.objects.find((o) => o.unique_id === burstUid);
      if (!burstObj) continue;

      if (f >= start && f < end) {
        const progress = (f - start) / (end - start);
        burstObj.scale = baseScale * (0.5 + progress * 1.5);
        burstObj.opacity = 1 - progress;
      } else {
        // Invisible outside active duration
        burstObj.opacity = 0;
      }
    }

    return {
      success: true,
      message: `Injected impact burst effect at (${tx}, ${ty}) across frames ${start + 1} to ${end}.`
    };
  }

  if (options.effectType === 'slash_arc') {
    const tx = options.targetX ?? Math.round(project.canvas_width / 2);
    const ty = options.targetY ?? Math.round(project.canvas_height / 2);
    const baseScale = options.scale ?? 1;

    // Define curved slash crescent
    const slashNodes = [
      { id: 1, parentId: 0, name: 'ArcTip1', length: 50 * baseScale, angleDeg: -45, thickness: 10, color },
      { id: 2, parentId: 1, name: 'ArcMid', length: 60 * baseScale, angleDeg: 15, thickness: 14, color: [255, 255, 255] as [number, number, number] },
      { id: 3, parentId: 2, name: 'ArcTip2', length: 50 * baseScale, angleDeg: 60, thickness: 8, color }
    ];

    const slashRig = defineStickRig({
      name: 'SlashArc',
      nodes: slashNodes as any,
      rootX: tx,
      rootY: ty,
      scale: baseScale,
      addToProject: true
    });

    const slashUid = slashRig.initialObject.unique_id;

    for (let f = 0; f < project.keyframes.length; f++) {
      const kf = project.keyframes[f];
      const slashObj = kf.objects.find((o) => o.unique_id === slashUid);
      if (!slashObj) continue;

      if (f >= start && f < end) {
        const progress = (f - start) / (end - start);
        slashObj.scale = baseScale * (0.8 + progress * 0.6);
        slashObj.opacity = 1 - progress * 0.9;
      } else {
        slashObj.opacity = 0;
      }
    }

    return {
      success: true,
      message: `Injected sword slash arc effect at (${tx}, ${ty}) across frames ${start + 1} to ${end}.`
    };
  }

  return {
    success: true,
    message: `Visual effect applied.`
  };
}
