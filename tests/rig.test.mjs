import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defineStickRig,
  computeForwardKinematics,
  ProjectSession
} from '../dist/index.js';

test('defineStickRig: creates a custom stick figure with bone hierarchy and IK', () => {
  ProjectSession.reset({ preset: 'empty' });

  const PI = Math.PI;
  const result = defineStickRig({
    name: 'Ninja',
    rootX: 400,
    rootY: 300,
    nodes: [
      { id: 1, parentId: 0, name: 'Torso', length: 70, angleRad: -PI / 2, thickness: 14 },
      { id: 2, parentId: 1, name: 'Head', length: 35, angleRad: -PI / 2, primitive: 'circleFill', thickness: 0 },
      { id: 3, parentId: 1, name: 'Left arm', length: 50, angleRad: 1.1, thickness: 10 },
      { id: 4, parentId: 3, name: 'Left forearm', length: 45, angleRad: 1.3, thickness: 10, ik: { enabled: true, chainLength: 2, bendDirection: -1 } },
      { id: 5, parentId: 1, name: 'Right arm', length: 50, angleRad: 2.0, thickness: 10 },
      { id: 6, parentId: 5, name: 'Right forearm', length: 45, angleRad: 1.8, thickness: 10, ik: { enabled: true, chainLength: 2, bendDirection: 1 } },
      { id: 7, parentId: 0, name: 'Left leg', length: 60, angleRad: 1.2, thickness: 12 },
      { id: 8, parentId: 7, name: 'Left shin', length: 55, angleRad: 1.5, thickness: 12, ik: { enabled: true, chainLength: 2, bendDirection: -1 } },
      { id: 9, parentId: 0, name: 'Right leg', length: 60, angleRad: 1.9, thickness: 12 },
      { id: 10, parentId: 9, name: 'Right shin', length: 55, angleRad: 1.6, thickness: 12, ik: { enabled: true, chainLength: 2, bendDirection: 1 } }
    ]
  });

  assert.equal(result.figure.name, 'Ninja');
  assert.equal(result.figure.segment_count, 10);
  assert.equal(result.initialObject.root_x, 400);
  assert.equal(result.initialObject.root_y, 300);
  assert.equal(result.initialObject.angles.length, 10);

  // Check IK controller setup
  assert.ok(result.initialObject._stykIK);
  assert.equal(result.initialObject._stykIK['4'].chainLength, 2);
  assert.equal(result.initialObject._stykIK['4'].bendDirection, -1);
  assert.ok(result.initialObject._stykIK['4'].target.x > 0);
  assert.ok(result.initialObject._stykIK['4'].target.y > 0);

  // Verify it was injected into active document
  const project = ProjectSession.getActive();
  assert.equal(project.figure_types.length, 1);
  assert.equal(project.figure_types[0].name, 'Ninja');
});

test('defineStickRig: supports Cartesian coordinate definitions', () => {
  ProjectSession.reset({ preset: 'empty' });

  const result = defineStickRig({
    name: 'CoordinateStickman',
    nodes: [
      { id: 1, parentId: 0, name: 'Spine', x: 0, y: -80, thickness: 12 },
      { id: 2, parentId: 1, name: 'Head', x: 0, y: -40, primitive: 'circle', thickness: 8 },
      { id: 3, parentId: 1, name: 'Arm', x: 40, y: 30, thickness: 10 }
    ]
  });

  assert.equal(result.figure.segments.length, 3);
  assert.equal(result.figure.segments[0].length, 80);
  assert.ok(Math.abs(result.figure.segments[0].angle_rad - (-Math.PI / 2)) < 1e-6);
  assert.equal(result.figure.segments[1].length, 40);
  assert.equal(result.figure.segments[2].length, 50);
});

test('defineStickRig: rejects cyclic or nonexistent parent hierarchies', () => {
  assert.throws(
    () =>
      defineStickRig({
        name: 'BadRig',
        nodes: [
          { id: 1, parentId: 2, length: 50 },
          { id: 2, parentId: 1, length: 50 }
        ]
      }),
    /Cycle detected|nonexistent parentId/
  );
});

test('computeForwardKinematics: computes correct joint endpoints', () => {
  const PI = Math.PI;
  const segments = [
    {
      segment_id: 1,
      parent_id: 0,
      length: 100,
      angle_rad: 0, // right
      thickness: 10,
      primitive_code: 0,
      segment_type: 'line',
      segment_kind: 'line',
      color_rgb: [0, 0, 0]
    },
    {
      segment_id: 2,
      parent_id: 1,
      length: 50,
      angle_rad: PI / 2, // down
      thickness: 10,
      primitive_code: 0,
      segment_type: 'line',
      segment_kind: 'line',
      color_rgb: [0, 0, 0]
    }
  ];

  const points = computeForwardKinematics(segments, [0, PI / 2], 200, 100);
  const p1 = points.get(1);
  assert.ok(p1);
  assert.equal(p1.start.x, 200);
  assert.equal(p1.start.y, 100);
  assert.equal(Math.round(p1.end.x), 300);
  assert.equal(Math.round(p1.end.y), 100);

  const p2 = points.get(2);
  assert.ok(p2);
  assert.equal(Math.round(p2.start.x), 300);
  assert.equal(Math.round(p2.start.y), 100);
  assert.equal(Math.round(p2.end.x), 300);
  assert.equal(Math.round(p2.end.y), 150);
});
