import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  createAnimationProject,
  ProjectSession
} from './engine/document.js';
import { defineStickRig } from './engine/rig.js';
import { generateMotionSequence } from './engine/motion.js';
import { importLegacyAsset } from './engine/legacy.js';
import { compileAndSaveProject } from './engine/export.js';
import { renderAndExportMedia } from './engine/renderer.js';
import { addFigureInstance, addVisualEffect } from './engine/scene.js';

export function createStykAnimateServer(): McpServer {
  const server = new McpServer(
    {
      name: 'stykanimate-mcp',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  /**
   * Tool 1: create_animation_project
   * Initializes a brand new StykAnimate project context.
   */
  server.tool(
    'create_animation_project',
    'Initializes a brand new StykAnimate project context (canvas dimensions, target FPS, empty frame timeline, default layers). Returns the raw initialization object mirroring StykAnimate\'s document model.',
    {
      canvasWidth: z
        .number()
        .int()
        .min(1)
        .max(100000)
        .optional()
        .describe('Canvas width in pixels (default: 960)'),
      canvasHeight: z
        .number()
        .int()
        .min(1)
        .max(100000)
        .optional()
        .describe('Canvas height in pixels (default: 540)'),
      fps: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Target playback frame rate (default: 24)'),
      projectName: z
        .string()
        .optional()
        .describe('Human-readable project title (default: "Untitled animation")'),
      preset: z
        .enum(['blue', 'walker', 'empty'])
        .optional()
        .describe('Starter figure preset: "blue" (StykAnimate default stickman with IK), "walker" (classic stickman), or "empty" (no figures)'),
      defaultDuration: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Initial frame hold duration in ticks (default: 10)')
    },
    async (args) => {
      try {
        const doc = createAnimationProject({
          canvasWidth: args.canvasWidth,
          canvasHeight: args.canvasHeight,
          fps: args.fps,
          projectName: args.projectName,
          preset: args.preset ?? 'blue',
          defaultDuration: args.defaultDuration ?? 10
        });

        ProjectSession.setActive(doc);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `StykAnimate project "${doc._styk.name}" initialized successfully.`,
                  canvas: { width: doc.canvas_width, height: doc.canvas_height, fps: doc.fps },
                  figuresCount: doc.figure_types.length,
                  keyframesCount: doc.keyframes.length,
                  document: doc
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        const message = (error as Error).message;
        process.stderr.write(`[create_animation_project] Error: ${message}\n`);
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to create animation project: ${message}` }]
        };
      }
    }
  );

  /**
   * Tool 2: define_stick_rig
   * Defines a custom stick figure rig/skeleton configuration mapping bones, segments, fixed-length joints, and IK targets.
   */
  server.tool(
    'define_stick_rig',
    'Defines a custom stick figure rig/skeleton configuration mapping bones, segments, fixed-length joints, and interpolation properties (like Inverse Kinematics targets).',
    {
      name: z.string().describe('Name of the stick figure rig (e.g. "StickNinja")'),
      nodes: z
        .array(
          z.object({
            id: z.number().int().min(1).describe('Unique segment ID (1-based integer)'),
            parentId: z.number().int().min(0).describe('Parent segment ID (0 represents root joint)'),
            name: z.string().optional().describe('Label for bone/joint (e.g. "Torso", "Left arm")'),
            length: z.number().optional().describe('Length of the segment in canvas pixels'),
            angleRad: z.number().optional().describe('Default rotation in radians'),
            angleDeg: z.number().optional().describe('Default rotation in degrees (alternative to angleRad)'),
            x: z.number().optional().describe('End coordinate X relative to parent (auto-computes length & angle)'),
            y: z.number().optional().describe('End coordinate Y relative to parent (auto-computes length & angle)'),
            thickness: z.number().optional().describe('Stroke thickness or circle radius (default: 12)'),
            primitive: z
              .enum(['line', 'circle', 'circleFill', 'circleClear', 'squareLine'])
              .optional()
              .describe('Visual shape primitive (default: "line")'),
            color: z
              .tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)])
              .optional()
              .describe('RGB color tuple [r, g, b] (default: [13, 153, 255])'),
            transparency: z.number().int().min(0).max(255).optional().describe('Transparency 0-255 (0 = opaque)'),
            isStatic: z.boolean().optional().describe('Whether this joint is static / locked'),
            bendRad: z.number().optional().describe('Curved segment bend in radians'),
            constraints: z
              .object({
                connector: z
                  .object({
                    start: z.number().int(),
                    end: z.number().int(),
                    restLength: z.number()
                  })
                  .optional(),
                stretch: z
                  .object({
                    restLength: z.number(),
                    min: z.number(),
                    max: z.number(),
                    width: z.enum(['keep', 'inverse', 'scale'])
                  })
                  .optional(),
                follow: z
                  .object({
                    driver: z.number().int(),
                    mode: z.enum(['stretch', 'rigid']),
                    influence: z.number()
                  })
                  .optional()
              })
              .optional()
              .describe('StykAnimate rig relationships (connectors, smart stretch, follow constraints)'),
            ik: z
              .object({
                enabled: z.boolean().optional(),
                pinned: z.boolean().optional(),
                chainLength: z.number().int().min(1).max(10).optional(),
                bendDirection: z.number().int().min(-1).max(1).optional(),
                targetX: z.number().optional(),
                targetY: z.number().optional()
              })
              .optional()
              .describe('Inverse Kinematics controller setup for this endpoint (e.g. hand or foot)')
          })
        )
        .describe('Array of joint/bone definitions forming the skeleton hierarchy'),
      rootX: z.number().optional().describe('Initial root coordinate X (default: center of canvas)'),
      rootY: z.number().optional().describe('Initial root coordinate Y (default: center of canvas)'),
      scale: z.number().optional().describe('Scale factor (default: 1.0)'),
      addToProject: z.boolean().optional().describe('Whether to add figure to active document (default: true)'),
      figureTypeId: z.number().int().optional().describe('Explicit figure_type_id (auto-generated if omitted)')
    },
    async (args) => {
      try {
        const result = defineStickRig({
          name: args.name,
          nodes: args.nodes,
          rootX: args.rootX,
          rootY: args.rootY,
          scale: args.scale ?? 1,
          addToProject: args.addToProject ?? true,
          figureTypeId: args.figureTypeId
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Stick rig "${result.figure.name}" created successfully with ${result.figure.segment_count} segments.`,
                  figure: result.figure,
                  initialObject: result.initialObject
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        const message = (error as Error).message;
        process.stderr.write(`[define_stick_rig] Error: ${message}\n`);
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to define stick rig: ${message}` }]
        };
      }
    }
  );

  /**
   * Tool 3: generate_motion_sequence
   * Accepts keyframes or mathematical expressions to automatically compute absolute/relative joint rotation changes across frames.
   */
  server.tool(
    'generate_motion_sequence',
    'Accepts keyframes or mathematical expressions (e.g., sine waves for walking/running loops) to automatically compute absolute/relative joint rotation changes across a specified number of frames. Returns an array of calculated timeline frames injected into the document model state.',
    {
      mode: z
        .enum(['preset', 'expression', 'keyframes'])
        .describe('Generation mode: "preset" (pre-programmed loop), "expression" (math formulas), or "keyframes" (in-between interpolation)'),
      preset: z
        .enum([
          'walk_loop',
          'run_loop',
          'idle_breathe',
          'wave_hand',
          'jumping_jacks',
          'punch_combo',
          'sword_slash',
          'spin_kick',
          'backflip',
          'dash_dodge'
        ])
        .optional()
        .describe('Built-in motion preset: walk_loop, run_loop, idle_breathe, wave_hand, jumping_jacks, punch_combo, sword_slash, spin_kick, backflip, dash_dodge'),
      frameCount: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Number of frames to generate (default: 24)'),
      durationPerFrame: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Hold duration per keyframe in ticks (default: 1)'),
      expressions: z
        .object({
          rootX: z.string().optional().describe('Math expression for root X coordinate over time (e.g. "baseX + Math.sin(phase)*10")'),
          rootY: z.string().optional().describe('Math expression for root Y coordinate over time'),
          scale: z.string().optional().describe('Math expression for scale over time'),
          jointExpressions: z
            .record(z.string(), z.string())
            .optional()
            .describe('Map of segment name or ID to math expression for rotation in radians (e.g. {"Left arm": "baseAngle + Math.sin(phase)*0.5"})')
        })
        .optional()
        .describe('Mathematical motion expressions (used when mode is "expression")'),
      keyframes: z
        .array(
          z.object({
            frameIndex: z.number().int().min(0).describe('Timeline frame index (0, 10, 20...)'),
            rootX: z.number().optional(),
            rootY: z.number().optional(),
            scale: z.number().optional(),
            angles: z.union([z.array(z.number()), z.record(z.string(), z.number())]).optional().describe('Joint angles in radians'),
            anglesDeg: z.record(z.string(), z.number()).optional().describe('Joint angles in degrees (name/id -> deg)'),
            easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out', 'constant']).optional()
          })
        )
        .optional()
        .describe('Keyframes to interpolate between (used when mode is "keyframes")'),
      easing: z
        .enum(['linear', 'ease_in', 'ease_out', 'ease_in_out', 'constant'])
        .optional()
        .describe('Default easing method between keyframes (default: "ease_in_out")'),
      targetFigureId: z.number().int().optional().describe('Target figure_type_id to animate (default: first figure in project)'),
      injectIntoDocument: z
        .boolean()
        .optional()
        .describe('Whether to replace current project keyframes with the generated sequence (default: true)')
    },
    async (args) => {
      try {
        const result = generateMotionSequence({
          mode: args.mode,
          preset: args.preset,
          frameCount: args.frameCount,
          durationPerFrame: args.durationPerFrame ?? 1,
          expressions: args.expressions,
          keyframes: args.keyframes,
          easing: args.easing,
          targetFigureId: args.targetFigureId,
          injectIntoDocument: args.injectIntoDocument ?? true
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Motion sequence generated successfully: ${result.frameCount} frames (${result.totalDurationTicks} ticks, ${result.durationSeconds.toFixed(2)}s).`,
                  frameCount: result.frameCount,
                  totalDurationTicks: result.totalDurationTicks,
                  durationSeconds: result.durationSeconds,
                  injectedIntoActiveDocument: result.injected,
                  keyframes: result.keyframes
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        const message = (error as Error).message;
        process.stderr.write(`[generate_motion_sequence] Error: ${message}\n`);
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to generate motion sequence: ${message}` }]
        };
      }
    }
  );

  /**
   * Tool 4: import_legacy_asset
   * Bridges the LLM to the codebase parsing layer to read standard .piv or .stk data types.
   */
  server.tool(
    'import_legacy_asset',
    'Bridges the LLM to the codebase parsing layer to read standard .piv or .stk data types. Returns extracted structural configurations converted into a StykAnimate-native schema format.',
    {
      filePath: z.string().describe('Local filesystem path to .stk, .piv, or .json file'),
      figureName: z.string().optional().describe('Custom name to override the imported figure name'),
      format: z.enum(['auto', 'stk', 'piv', 'nodes']).optional().describe('Format hint (default: "auto" detected from file extension)'),
      addToProject: z.boolean().optional().describe('Whether to load the imported asset into active project session (default: true)')
    },
    async (args) => {
      try {
        const result = importLegacyAsset({
          filePath: args.filePath,
          figureName: args.figureName,
          format: args.format ?? 'auto',
          addToProject: args.addToProject ?? true
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Legacy asset imported successfully (${result.kind}: "${result.name}").`,
                  result
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        const message = (error as Error).message;
        process.stderr.write(`[import_legacy_asset] Error: ${message}\n`);
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to import legacy asset: ${message}` }]
        };
      }
    }
  );

  /**
   * Tool 5: compile_and_save_project
   * Bundles the accumulated project state, frames, rigs, and layers into a final .stykanimate or valid project JSON string, writing it cleanly to a local path.
   */
  server.tool(
    'compile_and_save_project',
    'Bundles the accumulated project state, frames, rigs, and layers into a final .stykanimate or valid project JSON string, writing it cleanly to a local path specified by the user.',
    {
      outputPath: z.string().describe('Destination file path (e.g. "./output/my_animation.stykanimate" or "./scene.styk")'),
      format: z
        .enum(['auto', 'json', 'styk-container'])
        .optional()
        .describe('Output packaging format: "json" (standard JSON), "styk-container" (binary v1 container), or "auto" (detected from extension)'),
      pretty: z.boolean().optional().describe('Whether to pretty-print JSON files with 2-space indentation (default: true)')
    },
    async (args) => {
      try {
        const result = compileAndSaveProject({
          outputPath: args.outputPath,
          format: args.format ?? 'auto',
          pretty: args.pretty ?? true
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Project compiled and saved successfully to "${result.filePath}".`,
                  result
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        const message = (error as Error).message;
        process.stderr.write(`[compile_and_save_project] Error: ${message}\n`);
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to compile and save project: ${message}` }]
        };
      }
    }
  );

  /**
   * Tool 6: add_figure_instance
   * Places an instance of a figure (or adds a prop rig like sword or shield) into the active scene across all keyframes.
   */
  server.tool(
    'add_figure_instance',
    'Places a new instance of an existing figure type or preset prop (e.g., broadsword, round shield, enemy stickman) into the animation scene across all keyframes.',
    {
      figureTypeId: z
        .number()
        .int()
        .optional()
        .describe('ID of existing figure type in document (optional if preset is used)'),
      preset: z
        .enum(['blue', 'walker', 'sword', 'shield'])
        .optional()
        .describe('Spawn a character or prop rig preset: "blue", "walker", "sword", or "shield"'),
      rootX: z.number().optional().describe('Initial X position on canvas (default: center)'),
      rootY: z.number().optional().describe('Initial Y position on canvas (default: center)'),
      scale: z.number().optional().describe('Scale multiplier (default: 1.0)'),
      colorRgb: z
        .tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)])
        .optional()
        .describe('Color tint [r, g, b]'),
      transparency: z.number().int().min(0).max(255).optional().describe('Transparency 0-255 (0 = opaque)')
    },
    async (args) => {
      try {
        const result = addFigureInstance({
          figureTypeId: args.figureTypeId,
          preset: args.preset,
          rootX: args.rootX,
          rootY: args.rootY,
          scale: args.scale,
          colorRgb: args.colorRgb,
          transparency: args.transparency
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        const message = (error as Error).message;
        process.stderr.write(`[add_figure_instance] Error: ${message}\n`);
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to add figure instance: ${message}` }]
        };
      }
    }
  );

  /**
   * Tool 7: add_visual_effect
   * Injects dynamic visual effects (impact bursts, sword slash arcs, camera shake) into the active animation timeline.
   */
  server.tool(
    'add_visual_effect',
    'Injects dynamic action visual effects (impact bursts, sword slash arcs, screen shake) into specific timeline frames to create high-impact, production-level visuals.',
    {
      effectType: z
        .enum(['impact_burst', 'slash_arc', 'camera_shake'])
        .describe('Visual effect type: "impact_burst" (hit spark/burst), "slash_arc" (blade motion arc), or "camera_shake" (screen impact rumble)'),
      targetX: z.number().optional().describe('Target canvas X coordinate for the effect'),
      targetY: z.number().optional().describe('Target canvas Y coordinate for the effect'),
      startFrame: z.number().int().min(0).optional().describe('Keyframe index to trigger effect (0-based, default: 0)'),
      durationFrames: z.number().int().min(1).max(100).optional().describe('How many frames the effect lasts (default: 4)'),
      scale: z.number().optional().describe('Scale multiplier of the effect (default: 1.0)'),
      colorRgb: z
        .tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)])
        .optional()
        .describe('RGB color tuple [r, g, b] (default: bright yellow/white)'),
      intensity: z.number().optional().describe('Shake amplitude in pixels (used when effectType is "camera_shake", default: 8)')
    },
    async (args) => {
      try {
        const result = addVisualEffect({
          effectType: args.effectType,
          targetX: args.targetX,
          targetY: args.targetY,
          startFrame: args.startFrame,
          durationFrames: args.durationFrames,
          scale: args.scale,
          colorRgb: args.colorRgb,
          intensity: args.intensity
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        const message = (error as Error).message;
        process.stderr.write(`[add_visual_effect] Error: ${message}\n`);
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to add visual effect: ${message}` }]
        };
      }
    }
  );

  /**
   * Tool 8: render_and_export_media
   * Renders and exports production-grade visual media (MP4, animated GIF, WebM, SVG, Animated SVG, PNG Sequence, HTML5 interactive player).
   */
  server.tool(
    'render_and_export_media',
    'Renders and exports the active stick figure animation to visual media formats: "mp4" (H.264 video), "gif" (palette-optimized animated GIF), "webm" (VP9 video), "svg" (single frame vector), "animated-svg" (standalone self-playing vector), "png-sequence" (folder of crisp PNG frames), "svg-sequence" (folder of SVGs), or "html-player" (interactive standalone 60fps web player with timeline scrubber controls).',
    {
      outputPath: z.string().describe('Output file or directory path (e.g. "./renders/battle.mp4", "./stick.gif", "./preview.html", or "./frames")'),
      format: z
        .enum(['mp4', 'gif', 'webm', 'svg', 'animated-svg', 'png-sequence', 'svg-sequence', 'html-player'])
        .describe('Export format: "mp4", "gif", "webm", "svg", "animated-svg", "png-sequence", "svg-sequence", or "html-player"'),
      fps: z.number().int().min(1).max(120).optional().describe('Playback frame rate (defaults to document fps)'),
      width: z.number().int().min(16).max(7680).optional().describe('Output width in pixels (defaults to canvas width)'),
      height: z.number().int().min(16).max(4320).optional().describe('Output height in pixels (defaults to canvas height)'),
      loop: z.boolean().optional().describe('Whether to loop video/GIF animation indefinitely (default: true)'),
      frameIndex: z.number().int().min(0).optional().describe('Single frame index to render when format is "svg" (default: 0)')
    },
    async (args) => {
      try {
        const result = await renderAndExportMedia({
          outputPath: args.outputPath,
          format: args.format,
          fps: args.fps,
          width: args.width,
          height: args.height,
          loop: args.loop,
          frameIndex: args.frameIndex
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        const message = (error as Error).message;
        process.stderr.write(`[render_and_export_media] Error: ${message}\n`);
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to render and export media: ${message}` }]
        };
      }
    }
  );

  return server;
}

export async function runServer(): Promise<void> {
  const server = createStykAnimateServer();
  const transport = new StdioServerTransport();

  process.stderr.write('[stykanimate-mcp] Starting StykAnimate MCP server on stdio...\n');
  await server.connect(transport);
  process.stderr.write('[stykanimate-mcp] Server running and ready to handle requests.\n');
}
