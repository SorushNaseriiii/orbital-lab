export const SIMULATION_UTC_OFFSET_MINUTES = 210;
export const SIMULATION_UTC_OFFSET_MS = SIMULATION_UTC_OFFSET_MINUTES * 60 * 1000;
const DAY_MS = 86400000;

/** Convert an absolute instant to the simulation's fixed GMT+03:30 wall clock. */
export function toSimulationWallClock(date) {
  return new Date(new Date(date).getTime() + SIMULATION_UTC_OFFSET_MS);
}

/** Convert wall-clock fields in GMT+03:30 into an absolute UTC instant. */
export function simulationInstantFromWallClockParts(year, monthIndex, day, hours = 0, minutes = 0, seconds = 0, milliseconds = 0) {
  return new Date(Date.UTC(year, monthIndex, day, hours, minutes, seconds, milliseconds) - SIMULATION_UTC_OFFSET_MS);
}

/** Keep the local calendar day and replace only its GMT+03:30 clock time. */
export function withSimulationTimeOfDay(date, minutes) {
  const localDate = toSimulationWallClock(date);
  const selectedMinutes = Math.max(0, Math.min(1439, Math.round(Number(minutes) || 0)));
  return simulationInstantFromWallClockParts(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth(),
    localDate.getUTCDate(),
    Math.floor(selectedMinutes / 60),
    selectedMinutes % 60
  );
}

/** Unwrapped IAU Earth Rotation Angle in turns; UTC is used as a UT1 approximation. */
export function earthRotationTurnsFromDate(date = new Date()) {
  const julianDate = new Date(date).getTime() / DAY_MS + 2440587.5;
  const daysSinceJ2000 = julianDate - 2451545.0;
  return 0.7790572732640 + 1.00273781191135448 * daysSinceJ2000;
}

/** Earth orientation angle in radians, wrapped to one revolution. */
export function earthRotationAngleFromDate(date = new Date()) {
  const turns = earthRotationTurnsFromDate(date);
  const fractionalTurn = ((turns % 1) + 1) % 1;
  return fractionalTurn * Math.PI * 2;
}
