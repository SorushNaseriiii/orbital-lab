import test from 'node:test';
import assert from 'node:assert/strict';
import { OrbitMath as M } from '../src/core/math.js';
import { OrbitPhysics as P } from '../src/core/orbit.js';
import { SolarModel as S } from '../src/core/solar.js';

const near = (actual, expected, tolerance, message) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, received ${actual}`);
};

test('Earth has a valid default elliptic orbit', () => {
  for (const [key, body] of Object.entries(P.bodies)) {
    const elements = P.defaultElements(key);
    const metrics = P.orbitalMetrics(elements, key);
    assert.ok(elements.h > 0, `${key}: h must be positive`);
    assert.ok(elements.e >= 0 && elements.e < 1, `${key}: default orbit must be elliptic`);
    assert.ok(metrics.perigeeAltitude > 0, `${key}: default orbit intersects the body`);
    assert.ok(metrics.period > 0, `${key}: period must be positive`);
    assert.ok(body.mu > 0 && body.radius > 0, `${key}: central-body constants must be positive`);
  }
});

test('perifocal-to-ECI matrix follows the transpose convention in the lecture notes', () => {
  const q = P.rotationMatrix(0, 0, 90);
  const expected = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      near(q[row][column], expected[row][column], 1e-12, `Q_xX[${row},${column}]`);
    }
  }
});

test('perifocal-to-ECI rotation is right-handed and orthonormal', () => {
  for (const angles of [[0, 0, 0], [35, 51.6, 45], [240, 120, 310], [359.9, 89.9, 180]]) {
    const q = P.rotationMatrix(...angles);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let dot = 0;
        for (let k = 0; k < 3; k++) dot += q[k][i] * q[k][j];
        near(dot, i === j ? 1 : 0, 1e-10, `orthogonality (${i},${j})`);
      }
    }
    const determinant =
      q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) -
      q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) +
      q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
    near(determinant, 1, 1e-10, 'rotation determinant');
  }
});

test('state vectors conserve specific angular momentum and orbital energy', () => {
  for (const [key, body] of Object.entries(P.bodies)) {
    const elements = P.defaultElements(key);
    const metrics = P.orbitalMetrics(elements, key);
    for (const theta of [0, 30, 90, 179, 180, 270, 359.9]) {
      const state = P.state(elements, key, theta);
      const energy = .5 * M.dot(state.v, state.v) - body.mu / state.radius;
      const expectedEnergy = -body.mu / (2 * metrics.a);
      near(M.norm(state.hVec), elements.h, elements.h * 1e-9, `${key}: |r×v| at ${theta}°`);
      near(energy, expectedEnergy, Math.abs(expectedEnergy) * 1e-9, `${key}: energy at ${theta}°`);
      near(M.dot(state.r, state.hVec), 0, state.radius * elements.h * 1e-9, `${key}: r perpendicular h`);
      near(M.dot(state.v, state.hVec), 0, state.speed * elements.h * 1e-9, `${key}: v perpendicular h`);
    }
  }
});

test('true anomaly and time-from-perigee round-trip through Kepler equation', () => {
  for (const key of Object.keys(P.bodies)) {
    const elements = P.defaultElements(key);
    for (const theta of [0, 30, 90, 179, 180, 270, 359.9]) {
      const time = P.timeSincePerigee(theta, elements, key);
      const recovered = P.thetaAtTime(time, elements, key);
      const error = Math.abs(((recovered - theta + 540) % 360) - 180);
      assert.ok(error < 1e-7, `${key}: Kepler round-trip at ${theta}°; error=${error}°`);
    }
  }
});

test('h slider limits keep the complete allowed eccentricity range above the body surface', () => {
  for (const [key, body] of Object.entries(P.bodies)) {
    const bounds = P.getHBounds(key, 3);
    for (const h of [bounds.min, bounds.max]) {
      for (const e of [0, .2, .6, 1, 1.5, 3]) {
        const elements = { ...P.defaultElements(key), h, e };
        const metrics = P.orbitalMetrics(elements, key);
        assert.ok(metrics.perigeeAltitude > 0, `${key}: h=${h}, e=${e} intersects central body`);
      }
    }
  }
});

test('Earth h range reaches approximately a ten-day period at the requested maximum', () => {
  const bounds = P.getHBounds('earth', .2);
  near(bounds.max, 2.8e11, 1, 'maximum specific angular momentum');
  const elements = { ...P.defaultElements('earth'), h: bounds.max, e: 0.2 };
  const metrics = P.orbitalMetrics(elements, 'earth');
  assert.ok(metrics.period > 9 * 86400 && metrics.period < 12 * 86400, `expected about ten days, received ${metrics.period / 86400} days`);
  assert.ok(metrics.perigeeAltitude > 0, 'maximum h must remain above the Earth surface');
});

test('hyperbolic elements produce an open, non-periodic trajectory and signed time', () => {
  const bounds = P.getHBounds('earth', 1.5);
  const elements = { ...P.defaultElements('earth'), h: Math.max(bounds.min, 1.6e11), e: 1.5, theta: 35 };
  const metrics = P.orbitalMetrics(elements, 'earth');
  assert.equal(metrics.isHyperbolic, true);
  assert.equal(metrics.period, Infinity);
  assert.ok(metrics.perigeeAltitude > 0);
  for (const theta of [-80, -30, 0, 30, 80]) {
    const state = P.state(elements, 'earth', theta);
    const energy = .5 * M.dot(state.v, state.v) - P.bodies.earth.mu / state.radius;
    near(energy, metrics.specificEnergy, Math.abs(metrics.specificEnergy) * 1e-9, `hyperbolic energy at ${theta}°`);
    const time = P.timeSincePerigee(theta, elements, 'earth');
    const recovered = P.thetaAtTime(time, elements, 'earth');
    near(recovered, theta, 1e-7, `hyperbolic anomaly/time round-trip at ${theta}°`);
  }
  assert.ok(P.timeSincePerigee(-30, elements, 'earth') < 0, 'pre-perigee time must be negative');
  assert.ok(P.timeSincePerigee(30, elements, 'earth') > 0, 'post-perigee time must be positive');
});

test('parabolic limit is represented without an artificial orbital period', () => {
  const bounds = P.getHBounds('earth', 1);
  const elements = { ...P.defaultElements('earth'), h: Math.max(bounds.min, 1.3e11), e: 1, theta: 25 };
  const metrics = P.orbitalMetrics(elements, 'earth');
  assert.equal(metrics.isParabolic, true);
  assert.equal(metrics.period, Infinity);
  const time = P.timeSincePerigee(elements.theta, elements, 'earth');
  near(P.thetaAtTime(time, elements, 'earth'), elements.theta, 1e-7, 'parabolic Barker time round-trip');
});


test('heliocentric Sun direction is aligned with the current-date solar ephemeris', () => {
  const date = new Date('2026-11-17T00:00:00Z');
  const mean = S.meanAnomalyAtDate(date);
  const state = S.stateAtMeanAnomaly(mean);
  const expected = S.apparentSunDirectionECI(date);
  const dot = state.sunDirectionECI.reduce((sum, value, index) => sum + value * expected[index], 0);
  near(dot, 1, 1e-10, 'Earth-to-Sun direction alignment');
  assert.ok(state.distanceAU > 0.983 && state.distanceAU < 1.017);
  assert.ok(state.speedKmS > 29.2 && state.speedKmS < 30.4);
});

test('Earth heliocentric orbit uses the physical perihelion and aphelion distances', () => {
  const perihelion = S.stateAtTrueAnomaly(0);
  const aphelion = S.stateAtTrueAnomaly(Math.PI);
  near(perihelion.distanceAU, 1 - S.earthOrbitEccentricity, 1e-12, 'perihelion distance in AU');
  near(aphelion.distanceAU, 1 + S.earthOrbitEccentricity, 1e-12, 'aphelion distance in AU');
  assert.ok(perihelion.speedKmS > aphelion.speedKmS, 'Earth must move faster at perihelion');
});

test('one simulated solar year advances the heliocentric mean anomaly by one revolution', () => {
  const initial = S.meanAnomalyAtDate(new Date('2026-11-17T00:00:00Z'));
  const afterYear = S.advanceMeanAnomaly(initial, S.yearSimulationSeconds);
  const difference = Math.abs(((afterYear - initial + Math.PI * 3) % (2 * Math.PI)) - Math.PI);
  near(difference, 0, 1e-12, 'mean anomaly after one simulated year');
});
