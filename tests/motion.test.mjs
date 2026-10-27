import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMotionSequence,
  solveTwoBoneIK,
  evaluateMathExpression,
  shortest,
  ProjectSession
} from '../dist/index.js';

test('shortest: normalizes angular difference between -PI and PI', () => {
  const PI = Math.PI;
  assert.equal(shortest(0), 0);
  assert.ok(Math.abs(shortest(PI)) <= PI);
  assert.ok(Math.abs(shortest(3 * PI) - (-PI)) < 1e-6 || Math.abs(shortest(3 * PI) - PI) < 1e-6);
  assert.ok(Math.abs(shortest(2.5 * PI) - 0.5 * PI) < 1e-6);
});

test('solveTwoBoneIK: computes exact two-link joint articulation', () => {
  // Base at (0, 0), target at (0, 100), lengths 50 and 50 (straight line down)
  const result = solveTwoBoneIK(0, 0, 0, 100, 50, 50, 1);
  assert.ok(Math.abs(result.angle1 - Math.PI / 2) < 1e-5);
  assert.ok(Math.abs(result.angle2 - Math.PI / 2) < 1e-5);

  // Target at (50, 50), bend direction 1
  const bent = solveTwoBoneIK(0, 0, 50, 50, 50, 50, 1);
  assert.ok(Number.isFinite(bent.angle1));
  assert.ok(Number.isFinite(bent.angle2));
  assert.ok(Number.isFinite(bent.elbowX));
  assert.ok(Number.isFinite(bent.elbowY));
});

test('evaluateMathExpression: evaluates mathematical expressions safely', () => {
  const val1 = evaluateMathExpression('sin(phase) * 10', { phase: Math.PI / 2 });
  assert.ok(Math.abs(val1 - 10) < 1e-6);

  const val2 = evaluateMathExpression('baseX + t * 50', { baseX: 100, t: 0.5 });
  assert.equal(val2, 125);

  // Rejects unsafe expressions
  assert.throws(() => evaluateMathExpression('process.exit(1)', {}), /Unsafe/);
});

test('generateMotionSequence: generates walk loop preset', () => {
  ProjectSession.reset({ preset: 'blue' });

  const result = generateMotionSequence({
    mode: 'preset',
    preset: 'walk_loop',
    frameCount: 24,
    durationPerFrame: 1
  });

  assert.equal(result.frameCount, 24);
  assert.equal(result.keyframes.length, 24);
  assert.equal(result.totalDurationTicks, 24);
  assert.equal(result.durationSeconds, 1.0);

  // Check that leg and arm angles oscillate across frames (compare frame 0 and frame 6 at max swing)
  const frame0 = result.keyframes[0].objects[0];
  const frame6 = result.keyframes[6].objects[0];
  // Thigh segments should have different angles due to swing
  assert.notEqual(frame0.angles[6], frame6.angles[6]);
  assert.notEqual(frame0.angles[8], frame6.angles[8]);

  // Project session timeline should be updated
  const project = ProjectSession.getActive();
  assert.equal(project.keyframes.length, 24);
  assert.equal(project._styk.layerSheet?.duration, 24);
});

test('generateMotionSequence: generates expression-driven motion', () => {
  ProjectSession.reset({ preset: 'walker' });

  const result = generateMotionSequence({
    mode: 'expression',
    frameCount: 16,
    expressions: {
      rootX: 'baseX + Math.sin(phase) * 20',
      rootY: 'baseY + Math.cos(phase) * 10',
      jointExpressions: {
        'Torso': 'baseAngle + Math.sin(phase) * 0.1',
        'Left arm': 'baseAngle + Math.sin(phase) * 0.5'
      }
    }
  });

  assert.equal(result.frameCount, 16);
  assert.ok(result.keyframes[4].objects[0].root_x !== result.keyframes[0].objects[0].root_x);
});

test('generateMotionSequence: interpolates keyframes with shortest angle easing', () => {
  ProjectSession.reset({ preset: 'walker' });

  const result = generateMotionSequence({
    mode: 'keyframes',
    frameCount: 21,
    keyframes: [
      { frameIndex: 0, rootX: 200, rootY: 200, anglesDeg: { 'Head': -90, 'Left arm': 30 } },
      { frameIndex: 10, rootX: 300, rootY: 220, anglesDeg: { 'Head': -70, 'Left arm': 90 } },
      { frameIndex: 20, rootX: 400, rootY: 200, anglesDeg: { 'Head': -90, 'Left arm': 30 } }
    ]
  });

  assert.equal(result.keyframes.length, 21);
  // Midpoint at frame 10 should match keyframe
  const mid = result.keyframes[10].objects[0];
  assert.equal(Math.round(mid.root_x), 300);
  assert.equal(Math.round(mid.root_y), 220);
});
