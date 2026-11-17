const SolarModel = {
  AU: 149597870700,
  sunMu: 1.32712440018e20,
  earthOrbitEccentricity: 0.0167086,
  earthPerihelionLongitude: 102.9372 * Math.PI / 180,
  obliquity: 23.43928 * Math.PI / 180,
  yearDays: 365.256363004,
  yearSimulationSeconds: 120,
  mod(value, period) { return ((value % period) + period) % period; },
  apparentSunDirectionECI(date = new Date()) {
    const julianDate = date.getTime() / 86400000 + 2440587.5;
    const daysSinceJ2000 = julianDate - 2451545.0;
    const meanLongitude = this.mod((280.460 + 0.9856474 * daysSinceJ2000) * Math.PI / 180, 2 * Math.PI);
    const meanAnomaly = this.mod((357.528 + 0.9856003 * daysSinceJ2000) * Math.PI / 180, 2 * Math.PI);
    const longitude = meanLongitude + (1.915 * Math.PI / 180) * Math.sin(meanAnomaly) + (0.020 * Math.PI / 180) * Math.sin(2 * meanAnomaly);
    return [Math.cos(longitude), Math.sin(longitude) * Math.cos(this.obliquity), Math.sin(longitude) * Math.sin(this.obliquity)];
  },
  meanAnomalyAtDate(date = new Date()) {
    const sun = this.apparentSunDirectionECI(date);
    const sunLongitude = Math.atan2(sun[1] / Math.cos(this.obliquity), sun[0]);
    const earthLongitude = sunLongitude + Math.PI;
    const nu = Math.atan2(Math.sin(earthLongitude - this.earthPerihelionLongitude), Math.cos(earthLongitude - this.earthPerihelionLongitude));
    const e = this.earthOrbitEccentricity;
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    return this.mod(E - e * Math.sin(E), 2 * Math.PI);
  },
  solveKepler(meanAnomaly) {
    const e = this.earthOrbitEccentricity;
    let E = meanAnomaly;
    for (let iteration = 0; iteration < 16; iteration++) {
      const delta = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
      E -= delta;
      if (Math.abs(delta) < 1e-13) break;
    }
    return E;
  },
  stateAtMeanAnomaly(meanAnomaly) {
    const e = this.earthOrbitEccentricity;
    const E = this.solveKepler(meanAnomaly);
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    return this.stateAtTrueAnomaly(nu, E);
  },
  stateAtTrueAnomaly(trueAnomaly, eccentricAnomaly = null) {
    const e = this.earthOrbitEccentricity;
    const E = eccentricAnomaly ?? 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(trueAnomaly / 2), Math.sqrt(1 + e) * Math.cos(trueAnomaly / 2));
    const radiusAU = (1 - e * e) / (1 + e * Math.cos(trueAnomaly));
    const longitude = this.earthPerihelionLongitude + trueAnomaly;
    const radiusMetres = radiusAU * this.AU;
    const earthECI = [
      radiusMetres * Math.cos(longitude),
      radiusMetres * Math.sin(longitude) * Math.cos(this.obliquity),
      radiusMetres * Math.sin(longitude) * Math.sin(this.obliquity)
    ];
    const sunDirectionECI = earthECI.map((component) => -component / radiusMetres);
    const speedKmS = Math.sqrt(this.sunMu / this.AU * (2 / radiusAU - 1)) / 1000;
    return { eccentricAnomaly: E, trueAnomaly, longitude, distanceAU: radiusAU, speedKmS, earthECI, sunDirectionECI };
  },
  advanceMeanAnomaly(meanAnomaly, realDeltaSeconds) {
    return this.mod(meanAnomaly + 2 * Math.PI * realDeltaSeconds / this.yearSimulationSeconds, 2 * Math.PI);
  }
};

export { SolarModel };
