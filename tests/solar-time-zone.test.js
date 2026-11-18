import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIMULATION_UTC_OFFSET_MINUTES,
  simulationInstantFromWallClockParts,
  toSimulationWallClock,
  withSimulationTimeOfDay,
  earthRotationTurnsFromDate
} from '../src/core/time.js';

const DAY_MS = 86400000;

test('simulation wall clock is fixed at GMT+03:30 regardless of host timezone', () => {
  assert.equal(SIMULATION_UTC_OFFSET_MINUTES, 210);
  const localNoon = simulationInstantFromWallClockParts(2026, 2, 21, 12, 0);
  assert.equal(localNoon.toISOString(), '2026-03-21T08:30:00.000Z');

  const wallClock = toSimulationWallClock(localNoon);
  assert.equal(wallClock.getUTCFullYear(), 2026);
  assert.equal(wallClock.getUTCMonth(), 2);
  assert.equal(wallClock.getUTCDate(), 21);
  assert.equal(wallClock.getUTCHours(), 12);
  assert.equal(wallClock.getUTCMinutes(), 0);
});

test('moving the date forward one day preserves the selected GMT+03:30 clock time', () => {
  const firstDay = simulationInstantFromWallClockParts(2026, 2, 21, 18, 45);
  const nextDay = simulationInstantFromWallClockParts(2026, 2, 22, 18, 45);
  assert.equal(nextDay.getTime() - firstDay.getTime(), DAY_MS);

  const nextWallClock = toSimulationWallClock(nextDay);
  assert.equal(nextWallClock.getUTCHours(), 18);
  assert.equal(nextWallClock.getUTCMinutes(), 45);
  assert.equal(nextWallClock.getUTCDate(), 22);
});

test('moving the time slider preserves the selected GMT+03:30 calendar date', () => {
  const initial = simulationInstantFromWallClockParts(2026, 2, 21, 12, 0);
  const selected = withSimulationTimeOfDay(initial, 23 * 60 + 59);
  const wallClock = toSimulationWallClock(selected);
  assert.equal(wallClock.getUTCFullYear(), 2026);
  assert.equal(wallClock.getUTCMonth(), 2);
  assert.equal(wallClock.getUTCDate(), 21);
  assert.equal(wallClock.getUTCHours(), 23);
  assert.equal(wallClock.getUTCMinutes(), 59);
});

test('Earth rotation advances by one complete turn plus sidereal correction per solar day', () => {
  const firstDay = simulationInstantFromWallClockParts(2026, 2, 21, 12, 0);
  const nextDay = new Date(firstDay.getTime() + DAY_MS);
  const turnsAdvanced = earthRotationTurnsFromDate(nextDay) - earthRotationTurnsFromDate(firstDay);
  assert.ok(Math.abs(turnsAdvanced - 1.00273781191135448) < 1e-8);
});

test('Earth rotation advances consistently with the selected local clock time', () => {
  const midnight = simulationInstantFromWallClockParts(2026, 2, 21, 0, 0);
  const oneHourLater = simulationInstantFromWallClockParts(2026, 2, 21, 1, 0);
  const turnsAdvanced = earthRotationTurnsFromDate(oneHourLater) - earthRotationTurnsFromDate(midnight);
  assert.ok(Math.abs(turnsAdvanced - 1.00273781191135448 / 24) < 1e-8);
});
