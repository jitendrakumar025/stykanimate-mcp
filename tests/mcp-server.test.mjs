import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createStykAnimateServer } from '../dist/index.js';

test('MCP Server: exposes all 5 required tools and handles end-to-end execution', async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createStykAnimateServer();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(clientTransport);

  // 1. List tools
  const toolsResponse = await client.listTools();
  const toolNames = toolsResponse.tools.map((t) => t.name);

  assert.ok(toolNames.includes('create_animation_project'), 'Missing create_animation_project');
  assert.ok(toolNames.includes('define_stick_rig'), 'Missing define_stick_rig');
  assert.ok(toolNames.includes('generate_motion_sequence'), 'Missing generate_motion_sequence');
  assert.ok(toolNames.includes('import_legacy_asset'), 'Missing import_legacy_asset');
  assert.ok(toolNames.includes('compile_and_save_project'), 'Missing compile_and_save_project');
  assert.ok(toolNames.includes('add_figure_instance'), 'Missing add_figure_instance');
  assert.ok(toolNames.includes('add_visual_effect'), 'Missing add_visual_effect');
  assert.ok(toolNames.includes('render_and_export_media'), 'Missing render_and_export_media');

  // 2. Call create_animation_project
  const createRes = await client.callTool({
    name: 'create_animation_project',
    arguments: {
      canvasWidth: 1280,
      canvasHeight: 720,
      fps: 24,
      projectName: 'MCP E2E Test',
      preset: 'blue'
    }
  });

  assert.ok(!createRes.isError);
  const parsedCreate = JSON.parse(createRes.content[0].text);
  assert.equal(parsedCreate.canvas.width, 1280);
  assert.equal(parsedCreate.document._styk.name, 'MCP E2E Test');

  // 3. Call define_stick_rig
  const rigRes = await client.callTool({
    name: 'define_stick_rig',
    arguments: {
      name: 'Swordsman',
      nodes: [
        { id: 1, parentId: 0, name: 'Torso', length: 65, angleDeg: -90, thickness: 14 },
        { id: 2, parentId: 1, name: 'Head', length: 30, angleDeg: -90, primitive: 'circleFill' },
        { id: 3, parentId: 1, name: 'Sword arm', length: 50, angleDeg: 30, thickness: 10 },
        { id: 4, parentId: 3, name: 'Blade', length: 70, angleDeg: 15, thickness: 6, primitive: 'line', ik: { enabled: true, chainLength: 2 } }
      ]
    }
  });

  assert.ok(!rigRes.isError);
  const parsedRig = JSON.parse(rigRes.content[0].text);
  assert.equal(parsedRig.figure.name, 'Swordsman');
  assert.equal(parsedRig.figure.segment_count, 4);

  // 4. Call generate_motion_sequence
  const motionRes = await client.callTool({
    name: 'generate_motion_sequence',
    arguments: {
      mode: 'preset',
      preset: 'walk_loop',
      frameCount: 12
    }
  });

  assert.ok(!motionRes.isError);
  const parsedMotion = JSON.parse(motionRes.content[0].text);
  assert.equal(parsedMotion.frameCount, 12);
  assert.equal(parsedMotion.totalDurationTicks, 12);

  // 5. Call add_figure_instance
  const swordRes = await client.callTool({
    name: 'add_figure_instance',
    arguments: {
      preset: 'sword',
      rootX: 600,
      rootY: 360
    }
  });
  assert.ok(!swordRes.isError);

  // 6. Call add_visual_effect
  const vfxRes = await client.callTool({
    name: 'add_visual_effect',
    arguments: {
      effectType: 'slash_arc',
      targetX: 650,
      targetY: 340,
      startFrame: 3,
      durationFrames: 4
    }
  });
  assert.ok(!vfxRes.isError);

  // 7. Call compile_and_save_project
  const testOutPath = path.resolve('./temp_test_output_mcp/e2e_animation.stykanimate');
  const saveRes = await client.callTool({
    name: 'compile_and_save_project',
    arguments: {
      outputPath: testOutPath,
      format: 'json'
    }
  });

  assert.ok(!saveRes.isError);
  const parsedSave = JSON.parse(saveRes.content[0].text);
  assert.ok(parsedSave.result.success);
  assert.ok(fs.existsSync(testOutPath));

  // 8. Call render_and_export_media (HTML player)
  const htmlOutPath = path.resolve('./temp_test_output_mcp/player.html');
  const htmlRes = await client.callTool({
    name: 'render_and_export_media',
    arguments: {
      outputPath: htmlOutPath,
      format: 'html-player'
    }
  });
  assert.ok(!htmlRes.isError);
  assert.ok(fs.existsSync(htmlOutPath));

  // Clean up
  fs.rmSync(path.dirname(testOutPath), { recursive: true, force: true });
  await client.close();
  await server.close();
});
