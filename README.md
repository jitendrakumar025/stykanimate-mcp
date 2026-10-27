# stykanimate-mcp

A production-ready **Model Context Protocol (MCP)** server built in TypeScript/Node.js that interfaces with the open-source **[StykAnimate](https://github.com/filippocalippo/StykAnimate-App)** stick figure animation engine.

`stykanimate-mcp` allows LLMs and AI coding assistants to programmatically create, rig, animate, import, and export stick figure animations over the standard MCP `stdio` transport.

---

## Features

- **Headless & Loosely Coupled**: Operates completely in a headless Node.js context without requiring Electron, WebGPU, or browser display layers.
- **Authoritative StykAnimate Document Model**: Conforms directly to the StykAnimate v5 specification (`canvas_width`, `canvas_height`, `fps`, `figure_types`, `keyframes`, `layers`, `layerSheet`).
- **Kinematic & Mathematical Rigging**: Supports Forward Kinematics (FK), Analytical 2-Bone Inverse Kinematics (IK), and StykAnimate joint constraints (`connector`, `stretch`, `follow`).
- **Algorithmic Motion Sequences**: Generates smooth animation loops from mathematical expressions (sine/cosine waves for walking, running, breathing) or interpolates between keyframes with shortest-angle angular difference logic.
- **Legacy Asset Bridge**: Parses native Pivot `.stk` figure files, `.piv` animation projects, and Stick Nodes `.nodes` formats.
- **Multi-Format Compilation**: Compiles projects into native `.styk` binary v1 containers (56-byte header with SHA-256 and zlib) or formatted `.stykanimate` / `.json` project files.
- **Clean MCP stdio Protocol**: Sends error and diagnostic logs exclusively to `stderr`, keeping `stdout` completely clean for JSON-RPC messages.

---

## Installation

### Prerequisites
- Node.js 22.0.0 or higher
- npm

### Build from Source
```bash
git clone https://github.com/your-username/stykanimate-mcp.git
cd stykanimate-mcp
npm install
npm run build
```

To run the automated test suite:
```bash
npm test
```

To link the binary globally:
```bash
npm link
```

---

## MCP Client Configuration

Add `stykanimate-mcp` to your MCP client configuration (such as Claude Desktop, Claude Code, Cursor, or Antigravity):

### Antigravity (Global & Project Plugin)

#### Global Configuration
Add to `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "stykanimate": {
      "command": "node",
      "args": ["C:/CodeStorage/stykanimate-mcp/dist/index.js"]
    }
  }
}
```

#### Project Plugin (`.agents/plugins/`)
Place within `.agents/plugins/stykanimate/`:
- `plugin.json`:
  ```json
  {
    "name": "stykanimate",
    "description": "StykAnimate animation engine MCP plugin"
  }
  ```
- `mcp_config.json`:
  ```json
  {
    "mcpServers": {
      "stykanimate": {
        "command": "node",
        "args": ["C:/CodeStorage/stykanimate-mcp/dist/index.js"]
      }
    }
  }
  ```

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "stykanimate": {
      "command": "node",
      "args": ["C:/CodeStorage/stykanimate-mcp/dist/index.js"]
    }
  }
}
```

Or if installed globally:
```json
{
  "mcpServers": {
    "stykanimate": {
      "command": "stykanimate-mcp"
    }
  }
}
```

---

## Core MCP Tools

### 1. `create_animation_project`
Initializes a new StykAnimate project context mirroring the application's document model.

- **Inputs**:
  - `canvasWidth` (number, optional, default: `960`): Canvas width in pixels (1–100000).
  - `canvasHeight` (number, optional, default: `540`): Canvas height in pixels (1–100000).
  - `fps` (number, optional, default: `24`): Target playback frame rate (1–1000).
  - `projectName` (string, optional, default: `"Untitled animation"`): Project title.
  - `preset` (`"blue"` | `"walker"` | `"empty"`, optional, default: `"blue"`):
    - `"blue"`: The official StykAnimate startup figure with 10 segments and 4 IK chains (hands and feet).
    - `"walker"`: The classic Pivot stickman figure.
    - `"empty"`: Blank project ready for custom figure creation.
  - `defaultDuration` (number, optional, default: `10`): Initial hold duration in timeline ticks.

### 2. `define_stick_rig`
Defines a custom stick figure rig/skeleton configuration mapping bones, segments, fixed-length joints, and IK controller targets.

- **Inputs**:
  - `name` (string, required): Rig name (e.g., `"StickNinja"`).
  - `nodes` (array of objects, required):
    - `id` (integer, 1-based, unique): Segment identifier.
    - `parentId` (integer, 0 for root): Parent segment ID.
    - `name` (string, optional): Bone label (e.g., `"Torso"`, `"Right forearm"`).
    - `length` (number, optional): Bone length in pixels.
    - `angleRad` (number, optional): Default rotation angle in radians.
    - `angleDeg` (number, optional): Default rotation angle in degrees.
    - `x`, `y` (numbers, optional): End coordinate relative to parent (auto-computes length & angle).
    - `thickness` (number, optional, default: 12): Stroke thickness or circle radius.
    - `primitive` (`"line"` | `"circle"` | `"circleFill"` | `"circleClear"` | `"squareLine"`, optional).
    - `color` (`[r, g, b]`, optional, default: `[13, 153, 255]`).
    - `constraints` (object, optional): StykAnimate `connector`, `stretch`, or `follow` constraints.
    - `ik` (object, optional): IK controller properties (`enabled`, `chainLength`, `bendDirection`, `targetX`, `targetY`).
  - `rootX`, `rootY` (numbers, optional): Initial root placement on canvas.
  - `scale` (number, optional, default: `1.0`): Figure scale.
  - `addToProject` (boolean, optional, default: `true`): Inject into active session.

### 3. `generate_motion_sequence`
Accepts keyframes or mathematical expressions to automatically compute absolute and relative joint rotation changes across frames.

- **Inputs**:
  - `mode` (`"preset"` | `"expression"` | `"keyframes"`, required):
    - `"preset"`: Built-in cycles:
      - Mobility: `"walk_loop"`, `"run_loop"`, `"idle_breathe"`, `"wave_hand"`, `"jumping_jacks"`
      - Action & Combat: `"punch_combo"`, `"sword_slash"`, `"spin_kick"`, `"backflip"`, `"dash_dodge"`
    - `"expression"`: Mathematical formulas evaluated over time (`t`, `phase`, `frame`, `fps`).
    - `"keyframes"`: Smooth interpolation between sparse keyframe poses with shortest-angle easing.
  - `frameCount` (number, optional, default: `24`): Number of timeline frames.
  - `durationPerFrame` (number, optional, default: `1`): Exposure duration per frame.
  - `expressions` (object, optional):
    - `rootX`: e.g., `"baseX + Math.sin(phase) * 10"`
    - `rootY`: e.g., `"baseY - Math.abs(Math.sin(phase * 2)) * 8"`
    - `jointExpressions`: map of segment names/IDs to math expressions (e.g., `{"Left arm": "baseAngle + sin(phase) * 0.6"}`).
  - `keyframes` (array of objects, optional): Authored poses at specific `frameIndex` positions.
  - `easing` (`"linear"` | `"ease_in"` | `"ease_out"` | `"ease_in_out"`, optional).
  - `injectIntoDocument` (boolean, optional, default: `true`).

### 4. `add_figure_instance`
Places a new instance of an existing figure type or preset prop (e.g., broadsword, round shield, enemy fighter) into the animation scene across all keyframes.

- **Inputs**:
  - `figureTypeId` (integer, optional): Figure type ID to instantiate.
  - `preset` (`"blue"` | `"walker"` | `"sword"` | `"shield"`, optional): Spawn a preset prop or character.
  - `rootX`, `rootY` (numbers, optional): Canvas position coordinates.
  - `scale` (number, optional, default: `1.0`): Scale factor.
  - `colorRgb` (`[r, g, b]`, optional): Color override tint.
  - `transparency` (integer 0–255, optional): Transparency level.

### 5. `add_visual_effect`
Injects dynamic action visual effects (impact bursts, blade slash arcs, screen shake) into specific timeline frames for high-impact production visuals.

- **Inputs**:
  - `effectType` (`"impact_burst"` | `"slash_arc"` | `"camera_shake"`, required).
  - `targetX`, `targetY` (numbers, optional): Canvas coordinates for the effect.
  - `startFrame` (integer, optional, default: `0`): Beginning frame index (0-based).
  - `durationFrames` (integer, optional, default: `4`): Active frame length.
  - `scale` (number, optional, default: `1.0`): Effect scale.
  - `colorRgb` (`[r, g, b]`, optional): Effect color.
  - `intensity` (number, optional, default: `8`): Amplitude for camera shake.

### 6. `import_legacy_asset`
Bridges to the parsing layer to read standard Pivot `.stk`, `.piv`, and Stick Nodes `.nodes` data files.

- **Inputs**:
  - `filePath` (string, required): Absolute or relative path to the asset file.
  - `figureName` (string, optional): Override label for the imported figure.
  - `format` (`"auto"` | `"stk"` | `"piv"` | `"nodes"`, optional, default: `"auto"`).
  - `addToProject` (boolean, optional, default: `true`).

### 7. `compile_and_save_project`
Bundles the accumulated project state, frames, rigs, and layers into a native project container (`.styk`) or `.stykanimate` / `.json` file.

- **Inputs**:
  - `outputPath` (string, required): Destination file path (e.g., `"./project.stykanimate"` or `"./scene.styk"`).
  - `format` (`"auto"` | `"json"` | `"styk-container"`, optional, default: `"auto"`).
  - `pretty` (boolean, optional, default: `true`).

### 8. `render_and_export_media`
Renders and exports production-ready visual media files directly from the timeline without requiring external editors or GUI tools.

- **Inputs**:
  - `outputPath` (string, required): Target destination file or folder (e.g., `"./battle.mp4"`, `"./anim.gif"`, `"./player.html"`, `"./frames"`).
  - `format` (`"mp4"` | `"gif"` | `"webm"` | `"svg"` | `"animated-svg"` | `"png-sequence"` | `"svg-sequence"` | `"html-player"`, required):
    - `"mp4"`: High-definition H.264 video with faststart streaming (via FFmpeg).
    - `"gif"`: High-quality animated GIF with 2-pass Bayer palette generation (via FFmpeg).
    - `"webm"`: Web-optimized VP9 video (via FFmpeg).
    - `"html-player"`: Self-contained interactive 60fps HTML5 player with timeline scrubber and speed controls.
    - `"animated-svg"`: Standalone self-playing vector animation using CSS keyframes.
    - `"svg"`: Crisp vector rendering of a specific keyframe.
    - `"png-sequence"`: Folder of crisp raster PNG frames rendered at full canvas resolution.
    - `"svg-sequence"`: Folder of individual SVG vector frames.
  - `fps` (number, optional): Playback frame rate (defaults to document fps).
  - `width`, `height` (numbers, optional): Custom resolution overrides.
  - `loop` (boolean, optional, default: `true`): Video/GIF loop setting.
  - `frameIndex` (number, optional, default: `0`): Single frame index to export for format `"svg"`.
  - `outputPath` (string, required): Output file path (e.g. `./scene.stykanimate` or `./project.styk`).
  - `format` (`"auto"` | `"json"` | `"styk-container"`, optional, default: `"auto"`):
    - `"json"`: Valid StykAnimate v5 JSON project.
    - `"styk-container"`: Compressed v1 native container with 56-byte header and SHA-256 checksum.
  - `pretty` (boolean, optional, default: `true`): 2-space indented JSON formatting.

---

## Example Workflow

An LLM can interact with the server through a simple workflow:

```json
// 1. Initialize project
callTool("create_animation_project", { "preset": "blue", "fps": 24 })

// 2. Animate a walking cycle
callTool("generate_motion_sequence", {
  "mode": "preset",
  "preset": "walk_loop",
  "frameCount": 24
})

// 3. Save the project file
callTool("compile_and_save_project", {
  "outputPath": "C:/Animations/walking_blue.stykanimate"
})
```

---

## License

MIT
