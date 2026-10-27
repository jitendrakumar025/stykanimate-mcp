import {
  StykDocument,
  StykKeyframe,
  StykObject,
  StykFigureType
} from '../types/stykanimate.js';
import { createFrame, ProjectSession } from './document.js';

export const shortest = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export function lerpAngle(a: number, b: number, t: number): number {
  return a + shortest(b - a) * t;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export type EasingType = 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out' | 'constant';

export function applyEasing(t: number, easing: EasingType = 'ease_in_out'): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'linear':
      return clamped;
    case 'ease_in':
      return clamped * clamped;
    case 'ease_out':
      return clamped * (2 - clamped);
    case 'ease_in_out':
      return (1 - Math.cos(clamped * Math.PI)) / 2;
    case 'constant':
      return clamped >= 1 ? 1 : 0;
    default:
      return clamped;
  }
}

/**
 * Analytical 2-bone Inverse Kinematics solver.
 */
export function solveTwoBoneIK(
  baseX: number,
  baseY: number,
  targetX: number,
  targetY: number,
  length1: number,
  length2: number,
  bendDirection: number = 1
): { angle1: number; angle2: number; elbowX: number; elbowY: number } {
  const dx = targetX - baseX;
  const dy = targetY - baseY;
  const distance = Math.hypot(dx, dy);
  const total = length1 + length2;
  const EPS = 1e-7;

  if (distance < EPS) {
    return {
      angle1: 0,
      angle2: 0,
      elbowX: baseX + length1,
      elbowY: baseY
    };
  }

  const ux = dx / distance;
  const uy = dy / distance;

  if (distance >= total - EPS) {
    const angle = Math.atan2(dy, dx);
    return {
      angle1: angle,
      angle2: angle,
      elbowX: baseX + ux * length1,
      elbowY: baseY + uy * length1
    };
  }

  const d = Math.max(Math.abs(length1 - length2) + EPS, Math.min(total - EPS, distance));

  const along = (length1 * length1 - length2 * length2 + d * d) / (2 * d);
  const heightMag = Math.sqrt(Math.max(0, length1 * length1 - along * along));
  const height = heightMag * bendDirection;

  const elbowX = baseX + ux * along - uy * height;
  const elbowY = baseY + uy * along + ux * height;

  const angle1 = Math.atan2(elbowY - baseY, elbowX - baseX);
  const angle2 = Math.atan2(targetY - elbowY, targetX - elbowX);

  return { angle1, angle2, elbowX, elbowY };
}

/**
 * Evaluates a mathematical expression safely with given scope variables.
 */
export function evaluateMathExpression(expr: string, userScope: Record<string, number>): number {
  const mathScope: Record<string, any> = {
    Math,
    PI: Math.PI,
    E: Math.E,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    abs: Math.abs,
    sqrt: Math.sqrt,
    min: Math.min,
    max: Math.max,
    pow: Math.pow,
    exp: Math.exp,
    log: Math.log,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round
  };

  const allowedIdentifiers = new Set([...Object.keys(mathScope), ...Object.keys(userScope)]);

  // Check every identifier word
  const identifiers = expr.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) ?? [];
  for (const ident of identifiers) {
    if (!allowedIdentifiers.has(ident)) {
      throw new Error(`Unsafe or unrecognized identifier in expression: "${ident}"`);
    }
  }

  // Whitelist safe characters
  const allowedPattern = /^[0-9+\-*/%().,\s\w$]+$/;
  if (!allowedPattern.test(expr)) {
    throw new Error(`Unsafe mathematical expression: "${expr}"`);
  }

  const fullScope = { ...mathScope, ...userScope };
  const keys = Object.keys(fullScope);
  const values = Object.values(fullScope);

  try {
    const fn = new Function('process', 'global', 'globalThis', ...keys, `return (${expr});`);
    const result = fn(undefined, undefined, undefined, ...values);
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      throw new Error(`Expression evaluated to non-finite number: ${result}`);
    }
    return result;
  } catch (err) {
    throw new Error(`Failed to evaluate expression "${expr}": ${(err as Error).message}`);
  }
}

export interface KeyframePoseInput {
  frameIndex: number; // target frame (0, 10, 20, ...)
  rootX?: number;
  rootY?: number;
  scale?: number;
  // Angles can be passed as an array matching segments order, or record mapping joint name/id to angle in rad or deg
  angles?: number[] | Record<string, number>;
  anglesDeg?: Record<string, number>;
  easing?: EasingType;
}

export interface GenerateMotionSequenceOptions {
  frameCount?: number; // total number of frames to generate (default 24)
  durationPerFrame?: number; // duration_raw per keyframe (default 1)
  mode: 'preset' | 'expression' | 'keyframes';
  preset?:
    | 'walk_loop'
    | 'run_loop'
    | 'idle_breathe'
    | 'wave_hand'
    | 'jumping_jacks'
    | 'punch_combo'
    | 'sword_slash'
    | 'spin_kick'
    | 'backflip'
    | 'dash_dodge';
  expressions?: {
    rootX?: string;
    rootY?: string;
    scale?: string;
    jointExpressions?: Record<string, string>; // joint id (e.g. "3") or name (e.g. "Left arm") -> expression
  };
  keyframes?: KeyframePoseInput[];
  easing?: EasingType;
  targetFigureId?: number;
  injectIntoDocument?: boolean;
}

export interface MotionSequenceResult {
  keyframes: StykKeyframe[];
  frameCount: number;
  totalDurationTicks: number;
  durationSeconds: number;
  injected: boolean;
}

export function generateMotionSequence(options: GenerateMotionSequenceOptions): MotionSequenceResult {
  const project = ProjectSession.getActive();
  const figureId = options.targetFigureId ?? project.figure_types[0]?.figure_type_id ?? 1;
  const figure = project.figure_types.find((f) => f.figure_type_id === figureId);

  if (!figure) {
    throw new Error(`Figure with figure_type_id ${figureId} not found in active document.`);
  }

  const frameCount = options.frameCount ?? (options.keyframes ? Math.max(...options.keyframes.map((k) => k.frameIndex)) + 1 : 24);
  const durationPerFrame = options.durationPerFrame ?? 1;
  const inject = options.injectIntoDocument ?? true;

  // Base pose values
  const baseObject = project.keyframes[0]?.objects.find((o) => o.figure_type_id === figureId);
  const baseX = baseObject?.root_x ?? Math.round(project.canvas_width / 2);
  const baseY = baseObject?.root_y ?? Math.round(project.canvas_height / 2);
  const baseScale = baseObject?.scale ?? 1;
  const baseAngles = baseObject?.angles?.slice() ?? figure.segments.map((s) => s.angle_rad);

  // Map segment name and ID to index
  const segmentIndexMap = new Map<string, number>();
  figure.segments.forEach((s, idx) => {
    segmentIndexMap.set(String(s.segment_id), idx);
    if (s.name) {
      segmentIndexMap.set(s.name.toLowerCase(), idx);
    }
  });

  const generatedFrames: StykKeyframe[] = [];

  if (options.mode === 'preset') {
    const preset = options.preset ?? 'walk_loop';
    const PI = Math.PI;

    for (let f = 0; f < frameCount; f++) {
      const t = f / frameCount;
      const phase = t * 2 * PI;
      const angles = baseAngles.slice();
      let rootX = baseX;
      let rootY = baseY;

      if (preset === 'walk_loop') {
        const swing = Math.sin(phase);
        const lift = Math.cos(phase * 2);

        rootX = baseX + Math.sin(phase) * 8;
        rootY = baseY - lift * 4;

        // Find limb indices (either from standard Walker/Blue setup or by name)
        const leftArm = segmentIndexMap.get('left arm') ?? segmentIndexMap.get('left upper arm') ?? 2;
        const leftForearm = segmentIndexMap.get('left forearm') ?? 3;
        const rightArm = segmentIndexMap.get('right arm') ?? segmentIndexMap.get('right upper arm') ?? 4;
        const rightForearm = segmentIndexMap.get('right forearm') ?? 5;
        const leftThigh = segmentIndexMap.get('left leg') ?? segmentIndexMap.get('left thigh') ?? 6;
        const leftCalf = segmentIndexMap.get('left calf') ?? segmentIndexMap.get('left lower leg') ?? 7;
        const rightThigh = segmentIndexMap.get('right leg') ?? segmentIndexMap.get('right thigh') ?? 8;
        const rightCalf = segmentIndexMap.get('right calf') ?? segmentIndexMap.get('right lower leg') ?? 9;

        if (leftArm < angles.length) angles[leftArm] = PI / 2 - swing * 0.65;
        if (leftForearm < angles.length) angles[leftForearm] = PI / 2 - swing * 0.4 - 0.35;
        if (rightArm < angles.length) angles[rightArm] = PI / 2 + swing * 0.65;
        if (rightForearm < angles.length) angles[rightForearm] = PI / 2 + swing * 0.4 - 0.35;

        if (leftThigh < angles.length) angles[leftThigh] = PI / 2 + swing * 0.52;
        if (leftCalf < angles.length) angles[leftCalf] = PI / 2 + Math.max(0, -swing) * 0.85;
        if (rightThigh < angles.length) angles[rightThigh] = PI / 2 - swing * 0.52;
        if (rightCalf < angles.length) angles[rightCalf] = PI / 2 + Math.max(0, swing) * 0.85;
      } else if (preset === 'run_loop') {
        const swing = Math.sin(phase);
        const bounce = Math.abs(Math.sin(phase * 2));

        rootX = baseX + Math.sin(phase) * 14;
        rootY = baseY - bounce * 16;

        const leftArm = segmentIndexMap.get('left arm') ?? segmentIndexMap.get('left upper arm') ?? 2;
        const leftForearm = segmentIndexMap.get('left forearm') ?? 3;
        const rightArm = segmentIndexMap.get('right arm') ?? segmentIndexMap.get('right upper arm') ?? 4;
        const rightForearm = segmentIndexMap.get('right forearm') ?? 5;
        const leftThigh = segmentIndexMap.get('left leg') ?? segmentIndexMap.get('left thigh') ?? 6;
        const leftCalf = segmentIndexMap.get('left calf') ?? segmentIndexMap.get('left lower leg') ?? 7;
        const rightThigh = segmentIndexMap.get('right leg') ?? segmentIndexMap.get('right thigh') ?? 8;
        const rightCalf = segmentIndexMap.get('right calf') ?? segmentIndexMap.get('right lower leg') ?? 9;

        if (leftArm < angles.length) angles[leftArm] = PI / 2 - swing * 0.95;
        if (leftForearm < angles.length) angles[leftForearm] = 1.3 - swing * 0.7;
        if (rightArm < angles.length) angles[rightArm] = PI / 2 + swing * 0.95;
        if (rightForearm < angles.length) angles[rightForearm] = 1.3 + swing * 0.7;

        if (leftThigh < angles.length) angles[leftThigh] = PI / 2 + swing * 0.85;
        if (leftCalf < angles.length) angles[leftCalf] = PI / 2 + Math.max(0, -swing) * 1.4;
        if (rightThigh < angles.length) angles[rightThigh] = PI / 2 - swing * 0.85;
        if (rightCalf < angles.length) angles[rightCalf] = PI / 2 + Math.max(0, swing) * 1.4;
      } else if (preset === 'idle_breathe') {
        const breathe = Math.sin(phase);
        rootY = baseY + breathe * 3;

        const torso = segmentIndexMap.get('torso') ?? 0;
        if (torso < angles.length) angles[torso] = -PI / 2 + breathe * 0.02;

        const leftArm = segmentIndexMap.get('left arm') ?? segmentIndexMap.get('left upper arm') ?? 2;
        const rightArm = segmentIndexMap.get('right arm') ?? segmentIndexMap.get('right upper arm') ?? 4;
        if (leftArm < angles.length) angles[leftArm] = baseAngles[leftArm] + breathe * 0.04;
        if (rightArm < angles.length) angles[rightArm] = baseAngles[rightArm] - breathe * 0.04;
      } else if (preset === 'wave_hand') {
        const wave = Math.sin(phase * 3);
        const rightArm = segmentIndexMap.get('right arm') ?? segmentIndexMap.get('right upper arm') ?? 4;
        const rightForearm = segmentIndexMap.get('right forearm') ?? 5;

        if (rightArm < angles.length) angles[rightArm] = -PI / 2 - 0.4;
        if (rightForearm < angles.length) angles[rightForearm] = -PI / 2 + wave * 0.55;
      } else if (preset === 'jumping_jacks') {
        const open = (Math.sin(phase) + 1) / 2; // 0..1
        rootY = baseY - open * 15;

        const leftArm = segmentIndexMap.get('left arm') ?? segmentIndexMap.get('left upper arm') ?? 2;
        const rightArm = segmentIndexMap.get('right arm') ?? segmentIndexMap.get('right upper arm') ?? 4;
        const leftThigh = segmentIndexMap.get('left leg') ?? segmentIndexMap.get('left thigh') ?? 6;
        const rightThigh = segmentIndexMap.get('right leg') ?? segmentIndexMap.get('right thigh') ?? 8;

        if (leftArm < angles.length) angles[leftArm] = lerpAngle(1.2, -PI / 2 + 0.3, open);
        if (rightArm < angles.length) angles[rightArm] = lerpAngle(PI - 1.2, -PI / 2 - 0.3, open);
        if (leftThigh < angles.length) angles[leftThigh] = lerpAngle(1.3, 1.0, open);
        if (rightThigh < angles.length) angles[rightThigh] = lerpAngle(PI - 1.3, PI - 1.0, open);
      } else if (preset === 'punch_combo') {
        // Fast dynamic 1-2 punch combination with body twist and impact extension
        const torso = segmentIndexMap.get('torso') ?? 0;
        const leftArm = segmentIndexMap.get('left arm') ?? segmentIndexMap.get('left upper arm') ?? 2;
        const leftForearm = segmentIndexMap.get('left forearm') ?? 3;
        const rightArm = segmentIndexMap.get('right arm') ?? segmentIndexMap.get('right upper arm') ?? 4;
        const rightForearm = segmentIndexMap.get('right forearm') ?? 5;
        const leftThigh = segmentIndexMap.get('left leg') ?? segmentIndexMap.get('left thigh') ?? 6;
        const rightThigh = segmentIndexMap.get('right leg') ?? segmentIndexMap.get('right thigh') ?? 8;

        if (t < 0.45) {
          // Strike 1: Right cross punch
          const p1 = t / 0.45;
          const ext = Math.sin(p1 * PI);
          rootX = baseX + ext * 25;
          rootY = baseY + ext * 4;
          if (torso < angles.length) angles[torso] = -PI / 2 + ext * 0.2;
          if (rightArm < angles.length) angles[rightArm] = lerpAngle(1.8, 0.05, ext);
          if (rightForearm < angles.length) angles[rightForearm] = lerpAngle(1.4, 0.02, ext);
          if (leftArm < angles.length) angles[leftArm] = -PI / 2 + 0.6;
          if (leftForearm < angles.length) angles[leftForearm] = -PI / 2 - 0.2;
        } else if (t < 0.85) {
          // Strike 2: Left lead hook
          const p2 = (t - 0.45) / 0.4;
          const ext = Math.sin(p2 * PI);
          rootX = baseX + ext * 35;
          if (torso < angles.length) angles[torso] = -PI / 2 - ext * 0.25;
          if (leftArm < angles.length) angles[leftArm] = lerpAngle(1.2, -0.3, ext);
          if (leftForearm < angles.length) angles[leftForearm] = lerpAngle(1.0, 0.5, ext);
          if (rightArm < angles.length) angles[rightArm] = -PI / 2 + 0.4;
          if (rightForearm < angles.length) angles[rightForearm] = -PI / 2 - 0.2;
        } else {
          // Recovery back to fighting stance
          const p3 = (t - 0.85) / 0.15;
          rootX = lerp(baseX + 10, baseX, p3);
          if (torso < angles.length) angles[torso] = -PI / 2;
          if (leftArm < angles.length) angles[leftArm] = -PI / 2 + 0.4;
          if (rightArm < angles.length) angles[rightArm] = -PI / 2 - 0.3;
        }
        if (leftThigh < angles.length) angles[leftThigh] = 1.35;
        if (rightThigh < angles.length) angles[rightThigh] = 1.85;
      } else if (preset === 'sword_slash') {
        // High wind-up into a powerful diagonal downward cleave
        const torso = segmentIndexMap.get('torso') ?? 0;
        const leftArm = segmentIndexMap.get('left arm') ?? segmentIndexMap.get('left upper arm') ?? 2;
        const leftForearm = segmentIndexMap.get('left forearm') ?? 3;
        const rightArm = segmentIndexMap.get('right arm') ?? segmentIndexMap.get('right upper arm') ?? 4;
        const rightForearm = segmentIndexMap.get('right forearm') ?? 5;

        if (t < 0.35) {
          // Wind up overhead
          const w = t / 0.35;
          rootX = baseX - w * 12;
          rootY = baseY + w * 6;
          if (torso < angles.length) angles[torso] = -PI / 2 - w * 0.2;
          if (rightArm < angles.length) angles[rightArm] = lerpAngle(1.8, -PI * 0.8, w);
          if (rightForearm < angles.length) angles[rightForearm] = lerpAngle(1.5, -PI * 0.6, w);
          if (leftArm < angles.length) angles[leftArm] = lerpAngle(1.2, -PI * 0.75, w);
          if (leftForearm < angles.length) angles[leftForearm] = lerpAngle(1.0, -PI * 0.6, w);
        } else if (t < 0.65) {
          // Slash release
          const s = (t - 0.35) / 0.3;
          rootX = baseX + s * 45;
          rootY = baseY + s * 10;
          if (torso < angles.length) angles[torso] = -PI / 2 + s * 0.4;
          if (rightArm < angles.length) angles[rightArm] = lerpAngle(-PI * 0.8, 0.4, s);
          if (rightForearm < angles.length) angles[rightForearm] = lerpAngle(-PI * 0.6, 0.25, s);
          if (leftArm < angles.length) angles[leftArm] = lerpAngle(-PI * 0.75, 0.35, s);
          if (leftForearm < angles.length) angles[leftForearm] = lerpAngle(-PI * 0.6, 0.2, s);
        } else {
          // Recovery pose
          const r = (t - 0.65) / 0.35;
          rootX = lerp(baseX + 45, baseX, r);
          rootY = lerp(baseY + 10, baseY, r);
          if (torso < angles.length) angles[torso] = lerp(-PI / 2 + 0.4, -PI / 2, r);
          if (rightArm < angles.length) angles[rightArm] = lerp(0.4, 1.8, r);
          if (rightForearm < angles.length) angles[rightForearm] = lerp(0.25, 1.4, r);
        }
      } else if (preset === 'spin_kick') {
        // Full athletic 360 roundhouse kick
        const torso = segmentIndexMap.get('torso') ?? 0;
        const leftArm = segmentIndexMap.get('left arm') ?? segmentIndexMap.get('left upper arm') ?? 2;
        const rightArm = segmentIndexMap.get('right arm') ?? segmentIndexMap.get('right upper arm') ?? 4;
        const leftThigh = segmentIndexMap.get('left leg') ?? segmentIndexMap.get('left thigh') ?? 6;
        const rightThigh = segmentIndexMap.get('right leg') ?? segmentIndexMap.get('right thigh') ?? 8;
        const rightCalf = segmentIndexMap.get('right calf') ?? segmentIndexMap.get('right lower leg') ?? 9;

        const spin = Math.sin(t * PI);
        rootY = baseY - spin * 20;

        if (t < 0.5) {
          // Chamber and snap kick outward
          const k = t / 0.5;
          if (torso < angles.length) angles[torso] = -PI / 2 - k * 0.4;
          if (rightThigh < angles.length) angles[rightThigh] = lerpAngle(PI / 2, -0.1, k);
          if (rightCalf < angles.length) angles[rightCalf] = lerpAngle(PI / 2, -0.05, k);
          if (leftThigh < angles.length) angles[leftThigh] = 1.6;
        } else {
          // Retract and land
          const l = (t - 0.5) / 0.5;
          if (torso < angles.length) angles[torso] = lerp(-PI / 2 - 0.4, -PI / 2, l);
          if (rightThigh < angles.length) angles[rightThigh] = lerpAngle(-0.1, PI / 2, l);
          if (rightCalf < angles.length) angles[rightCalf] = lerpAngle(-0.05, PI / 2, l);
          if (leftThigh < angles.length) angles[leftThigh] = lerpAngle(1.6, 1.3, l);
        }
        if (leftArm < angles.length) angles[leftArm] = -PI / 2 - 0.5;
        if (rightArm < angles.length) angles[rightArm] = -PI / 2 + 0.5;
      } else if (preset === 'backflip') {
        // Full gymnastics / ninja backflip with takeoff, tuck, and landing
        const torso = segmentIndexMap.get('torso') ?? 0;
        const leftArm = segmentIndexMap.get('left arm') ?? segmentIndexMap.get('left upper arm') ?? 2;
        const rightArm = segmentIndexMap.get('right arm') ?? segmentIndexMap.get('right upper arm') ?? 4;
        const leftThigh = segmentIndexMap.get('left leg') ?? segmentIndexMap.get('left thigh') ?? 6;
        const leftCalf = segmentIndexMap.get('left calf') ?? segmentIndexMap.get('left lower leg') ?? 7;
        const rightThigh = segmentIndexMap.get('right leg') ?? segmentIndexMap.get('right thigh') ?? 8;
        const rightCalf = segmentIndexMap.get('right calf') ?? segmentIndexMap.get('right lower leg') ?? 9;

        const jumpHeight = Math.sin(t * PI);
        rootX = baseX - t * 30;
        rootY = baseY - jumpHeight * 70;

        // Torso rotates 360 degrees backward
        const flipRotation = -t * 2 * PI;
        if (torso < angles.length) angles[torso] = -PI / 2 + flipRotation;

        // Tuck knees during midair
        const tuck = Math.sin(t * PI);
        if (leftThigh < angles.length) angles[leftThigh] = -PI / 2 + flipRotation + lerp(2.2, 0.4, tuck);
        if (leftCalf < angles.length) angles[leftCalf] = -PI / 2 + flipRotation + lerp(2.2, 0.2, tuck);
        if (rightThigh < angles.length) angles[rightThigh] = -PI / 2 + flipRotation + lerp(2.2, 0.4, tuck);
        if (rightCalf < angles.length) angles[rightCalf] = -PI / 2 + flipRotation + lerp(2.2, 0.2, tuck);

        // Arms swing overhead
        if (leftArm < angles.length) angles[leftArm] = -PI / 2 + flipRotation - tuck * 0.8;
        if (rightArm < angles.length) angles[rightArm] = -PI / 2 + flipRotation - tuck * 0.8;
      } else if (preset === 'dash_dodge') {
        // Fast anime dash / flash-step forward with motion lean
        const torso = segmentIndexMap.get('torso') ?? 0;
        const leftThigh = segmentIndexMap.get('left leg') ?? segmentIndexMap.get('left thigh') ?? 6;
        const rightThigh = segmentIndexMap.get('right leg') ?? segmentIndexMap.get('right thigh') ?? 8;
        const leftArm = segmentIndexMap.get('left arm') ?? segmentIndexMap.get('left upper arm') ?? 2;
        const rightArm = segmentIndexMap.get('right arm') ?? segmentIndexMap.get('right upper arm') ?? 4;

        const dashProgress = Math.min(1, t * 1.4);
        rootX = baseX + dashProgress * 150;
        rootY = baseY + Math.sin(t * PI) * 10;

        // Figure leans deep forward during dash
        const lean = Math.sin(t * PI) * 0.6;
        if (torso < angles.length) angles[torso] = -PI / 2 + lean;
        if (leftArm < angles.length) angles[leftArm] = -PI / 2 - 1.2;
        if (rightArm < angles.length) angles[rightArm] = -PI / 2 - 1.2;
        if (leftThigh < angles.length) angles[leftThigh] = PI / 2 - 0.4;
        if (rightThigh < angles.length) angles[rightThigh] = PI / 2 + 0.8;
      }

      const frameObj: StykObject = {
        object_slot: 0,
        unique_id: baseObject?.unique_id ?? 1,
        figure_type_id: figureId,
        root_x: rootX,
        root_y: rootY,
        scale: baseScale,
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

      generatedFrames.push(createFrame([frameObj], durationPerFrame));
    }
  } else if (options.mode === 'expression') {
    const exprs = options.expressions ?? {};
    const jointExprs = exprs.jointExpressions ?? {};

    for (let f = 0; f < frameCount; f++) {
      const t = frameCount > 1 ? f / (frameCount - 1) : 0;
      const phase = t * 2 * Math.PI;

      const scope = {
        t,
        frame: f,
        fps: project.fps,
        phase,
        baseX,
        baseY,
        baseScale
      };

      let rootX = baseX;
      if (exprs.rootX) {
        rootX = evaluateMathExpression(exprs.rootX, scope);
      }

      let rootY = baseY;
      if (exprs.rootY) {
        rootY = evaluateMathExpression(exprs.rootY, scope);
      }

      let scale = baseScale;
      if (exprs.scale) {
        scale = evaluateMathExpression(exprs.scale, scope);
      }

      const angles = baseAngles.slice();
      for (const [key, expr] of Object.entries(jointExprs)) {
        const segIdx = segmentIndexMap.get(key.toLowerCase()) ?? segmentIndexMap.get(key);
        if (segIdx !== undefined && segIdx < angles.length) {
          const jointScope = {
            ...scope,
            baseAngle: baseAngles[segIdx],
            currentAngle: angles[segIdx]
          };
          angles[segIdx] = evaluateMathExpression(expr, jointScope);
        }
      }

      const frameObj: StykObject = {
        object_slot: 0,
        unique_id: baseObject?.unique_id ?? 1,
        figure_type_id: figureId,
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

      generatedFrames.push(createFrame([frameObj], durationPerFrame));
    }
  } else if (options.mode === 'keyframes') {
    const keyframesInput = (options.keyframes ?? []).slice().sort((a, b) => a.frameIndex - b.frameIndex);

    if (keyframesInput.length === 0) {
      throw new Error('keyframes mode requires at least one keyframe in keyframes array.');
    }

    // Ensure there is a keyframe at 0
    if (keyframesInput[0].frameIndex !== 0) {
      keyframesInput.unshift({
        frameIndex: 0,
        rootX: baseX,
        rootY: baseY,
        angles: baseAngles
      });
    }

    // Normalized keyframe records
    const normalizedKeys = keyframesInput.map((k) => {
      const angles = baseAngles.slice();
      if (Array.isArray(k.angles)) {
        k.angles.forEach((val, idx) => {
          if (idx < angles.length) angles[idx] = val;
        });
      } else if (k.angles) {
        for (const [key, val] of Object.entries(k.angles)) {
          const idx = segmentIndexMap.get(key.toLowerCase()) ?? segmentIndexMap.get(key);
          if (idx !== undefined && idx < angles.length) angles[idx] = val;
        }
      } else if (k.anglesDeg) {
        for (const [key, val] of Object.entries(k.anglesDeg)) {
          const idx = segmentIndexMap.get(key.toLowerCase()) ?? segmentIndexMap.get(key);
          if (idx !== undefined && idx < angles.length) angles[idx] = (val * Math.PI) / 180;
        }
      }

      return {
        frameIndex: k.frameIndex,
        rootX: k.rootX ?? baseX,
        rootY: k.rootY ?? baseY,
        scale: k.scale ?? baseScale,
        angles,
        easing: k.easing ?? options.easing ?? 'ease_in_out'
      };
    });

    for (let f = 0; f < frameCount; f++) {
      // Find bounding keyframes
      let left = normalizedKeys[0];
      let right = normalizedKeys[normalizedKeys.length - 1];

      for (let i = 0; i < normalizedKeys.length - 1; i++) {
        if (f >= normalizedKeys[i].frameIndex && f <= normalizedKeys[i + 1].frameIndex) {
          left = normalizedKeys[i];
          right = normalizedKeys[i + 1];
          break;
        }
      }

      let t = 0;
      if (right.frameIndex > left.frameIndex) {
        t = (f - left.frameIndex) / (right.frameIndex - left.frameIndex);
      }
      const easedT = applyEasing(t, left.easing);

      const rootX = lerp(left.rootX, right.rootX, easedT);
      const rootY = lerp(left.rootY, right.rootY, easedT);
      const scale = lerp(left.scale, right.scale, easedT);
      const angles = figure.segments.map((_, i) => lerpAngle(left.angles[i], right.angles[i], easedT));

      const frameObj: StykObject = {
        object_slot: 0,
        unique_id: baseObject?.unique_id ?? 1,
        figure_type_id: figureId,
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

      generatedFrames.push(createFrame([frameObj], durationPerFrame));
    }
  }

  const totalDurationTicks = generatedFrames.reduce((sum, f) => sum + f.duration_raw, 0);

  if (inject) {
    project.keyframes = generatedFrames;
    if (project._styk.layerSheet) {
      project._styk.layerSheet.duration = totalDurationTicks;
      for (const track of Object.values(project._styk.layerSheet.tracks)) {
        track.end = totalDurationTicks;
      }
    }
  }

  return {
    keyframes: generatedFrames,
    frameCount: generatedFrames.length,
    totalDurationTicks,
    durationSeconds: totalDurationTicks / project.fps,
    injected: inject
  };
}
