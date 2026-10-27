/**
 * StykAnimate Authoritative Document Model and Schema Definitions.
 * Based on StykAnimate specification (src/pivot/, src/editor*, backend/native_format.py).
 */

export type PrimitiveCode = 
  | 0 // line
  | 1 // circle (unfilled)
  | 2 // image / sprite
  | 3 // circleFill
  | 4 // circleClear
  | 5 // text
  | 6; // squareLine

export type SegmentType = 'line' | 'circle' | 'image' | 'text';
export type SegmentKind = 'line' | 'circle' | 'circleFill' | 'circleClear' | 'squareLine' | 'image' | 'text';

export interface StykSecondaryColor {
  rgb: [number, number, number];
  a: number; // 0..255 transparency
}

export interface StykRigConnectorConstraint {
  start: number; // Joint handle ID
  end: number; // Joint handle ID
  restLength: number;
}

export interface StykRigStretchConstraint {
  restLength: number;
  min: number; // minimum scale ratio, e.g. 0.1
  max: number; // maximum scale ratio, e.g. 2.0
  width: 'keep' | 'inverse' | 'scale';
  branch?: boolean;
  source?: 'span' | 'slide' | 'combined';
  restPosition?: number;
}

export interface StykRigFollowConstraint {
  driver: number; // Joint handle ID of driver
  mode: 'stretch' | 'rigid';
  influence: number; // -4.0 .. 4.0
  automatic?: boolean;
}

export interface StykRigAngleLockConstraint {
  mode?: string;
  space?: string;
  reference?: number;
  angle?: number;
  restAngle?: number;
  figureRestAngle?: number;
  multiplier?: number;
}

export interface StykRigConstraints {
  connector?: StykRigConnectorConstraint;
  stretch?: StykRigStretchConstraint;
  follow?: StykRigFollowConstraint;
  orientation?: 'inherit' | 'world';
  angleLock?: StykRigAngleLockConstraint;
  anglePath?: Record<string, unknown>;
  weighted?: Record<string, unknown>;
  spatial?: Record<string, unknown>;
}

export interface StykSegment {
  segment_id: number; // 1-based unique identifier within figure
  parent_id: number; // 0 indicates figure root/origin
  length: number; // bone length in canvas pixels
  angle_rad: number; // default rotation in radians
  thickness: number; // stroke or diameter in pixels
  bend_rad?: number; // curved segment bend angle
  primitive_code: PrimitiveCode;
  aux_code?: number;
  flags?: number;
  segment_type: SegmentType;
  segment_kind: SegmentKind;
  color_rgb: [number, number, number];
  transparency?: number; // 0..255 (0 = fully opaque)
  color_alpha?: number; // 0..1 (1 = fully opaque)
  visible?: boolean;
  z_order?: number;
  is_static?: boolean;
  name?: string;
  secondary?: StykSecondaryColor | null;
  extra?: number[] | null;
  _stykRig?: StykRigConstraints;
  _sticknodes?: Record<string, unknown>;
}

export interface StykPolyfill {
  polyfill_id: number;
  segment_ids: number[]; // vertex joint IDs
  segment_ids_raw?: number[];
  vertex_id_space?: string;
  color_rgb: [number, number, number];
  alpha_raw?: number;
  color_alpha?: number;
  z_order?: number;
}

export interface StykFigureType {
  figure_type_id: number; // 1-based unique identifier in document
  name: string;
  segment_count: number;
  segments: StykSegment[];
  polyfills?: StykPolyfill[];
  image_assets?: unknown[];
  text_assets?: unknown[];
  implicit?: boolean;
  _styk?: {
    colorMode?: string;
    movieclip?: unknown;
    animationOrigin?: unknown;
    spatialMesh?: unknown;
    sticknodes?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface StykIKTarget {
  x: number;
  y: number;
  rotation: number;
}

export interface StykIKBendReference {
  side: number; // 1 or -1
  angle: number;
  axis: number;
  ratio: number;
  shape?: number[];
}

export interface StykIKController {
  enabled: boolean;
  pinned: boolean;
  allowStretch?: boolean;
  bendDirection: number; // -1, 0 (automatic), 1
  chainLength: number; // typically 2 for two-link limb
  target: StykIKTarget;
  followers?: Record<string, number>;
  attachmentOffsets?: Record<string, number>;
  bendReference?: StykIKBendReference;
}

export interface StykObjectJoin {
  target_unique_id?: number;
  target_object_slot?: number;
  target_handle_id: number;
}

export interface StykObject {
  object_slot: number; // 0-based index in frame objects array
  unique_id: number; // 1-based unique identifier across frames
  figure_type_id: number;
  root_x: number;
  root_y: number;
  scale: number;
  color_override_raw?: number;
  field28?: number; // transparency 0..255
  angles: number[]; // radian rotation for each segment in figure
  len_flag?: number; // 1 if custom lengths array is active
  lengths?: number[]; // custom bone lengths
  bend_flag?: number; // 1 if custom bends array is active
  bends?: number[];
  join?: StykObjectJoin | null;
  _stykIK?: Record<string, StykIKController>; // Key is segment_id as string
  color_override_rgb?: [number, number, number];
  color_override_mix?: number;
  transparency?: number;
  opacity?: number;
  _styk?: {
    locked?: boolean;
    zIndex?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface StykCamera {
  is_default: boolean;
  x: number;
  y: number;
  scale: number;
  angle_rad: number;
}

export interface StykKeyframe {
  keyframe_index?: number;
  duration_raw: number; // duration in ticks / exposures
  inbetweens?: number;
  hidden?: boolean;
  background_id: number;
  background_id_b?: number | null;
  background_mix?: number;
  camera: StykCamera;
  objects: StykObject[];
  object_draw_order: number[];
  object_draw_order_unique_ids: number[];
  _styk?: {
    easing?: {
      interpolation: 'constant' | 'linear' | 'hold' | 'auto';
    };
    [key: string]: unknown;
  };
}

export interface StykLayerInfo {
  name: string;
  visible: boolean;
  locked: boolean;
  color?: string;
  parallax?: unknown;
  drawing?: unknown;
}

export interface StykLayerState {
  version: 1;
  nextId: number;
  order: string[]; // ['layer-1', 'layer-2', ...]
  byId: Record<string, StykLayerInfo>;
  assignments: Record<string, string>; // unique_id string -> layer ID
  defaultLayerId: string;
  activeId: string;
  fixed: {
    scene: { visible: boolean; locked: boolean };
    camera: { visible: boolean; locked: boolean };
  };
}

export interface StykLayerSheetKey {
  id: string;
  tick: number;
  sourceTick: number;
  interpolation?: 'constant' | 'linear' | 'hold' | 'auto';
  empty?: boolean;
}

export interface StykLayerSheetTrack {
  end: number;
  keys: StykLayerSheetKey[];
}

export interface StykLayerSheet {
  version: 1;
  duration: number;
  nextId: number;
  tracks: Record<string, StykLayerSheetTrack>;
}

export interface StykBackground {
  background_id: number;
  kind: number; // 0,1: image, 2: solid color, 3,4: gradient
  name: string;
  color?: number;
  color_a?: number;
  color_b?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  data_url?: string;
  mime_type?: string;
}

export interface StykDocument {
  version: 5;
  canvas_width: number;
  canvas_height: number;
  fps: number;
  auto_easing: boolean;
  auto_easing_disabled_raw?: number;
  auto_easing_source?: string;
  backgrounds: StykBackground[];
  figure_types: StykFigureType[];
  keyframes: StykKeyframe[];
  _styk: {
    format: 'StykAnimate';
    format_version: 1;
    name: string;
    layers?: StykLayerState;
    layerSheet?: StykLayerSheet;
    [key: string]: unknown;
  };
  notes?: string[];
  [key: string]: unknown;
}
