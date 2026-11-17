import { OrbitMath as M } from './math.js';

const Physics = {
  bodies: {
    earth: { name: 'Earth', symbol: 'EARTH', mu: 3.986004418e14, radius: 6371000, rotation: 86164.0905, rotationDirection: 1, obliquity: 23.43928, base: '#286c9b', texture: 'earth' }
  },
  defaults: { e: 0.2, i: 51.6, raan: 35, argp: 45, theta: 25, pRatio: 2.2 },
  getHBounds(bodyKey = 'earth', eForSafety = 0.2, requestedMin = 1e10, requestedMax = 2.8e11) {
    const body = this.bodies[bodyKey];
    const safePeriapsis = 1.08 * body.radius;
    const physicalMin = Math.sqrt(body.mu * safePeriapsis * (1 + Math.max(0, eForSafety)));
    const min = Math.max(requestedMin, physicalMin);
    return { min, max: Math.max(requestedMax, min * 1.001), physicalMin };
  },
  defaultElements(bodyKey = 'earth') {
    const body = this.bodies[bodyKey];
    return { h: Math.sqrt(body.mu * body.radius * this.defaults.pRatio), e: this.defaults.e, i: this.defaults.i, raan: this.defaults.raan, argp: this.defaults.argp, theta: this.defaults.theta };
  },
  rotationMatrix(raanDeg, iDeg, argpDeg) {
    const O = raanDeg * M.DEG, i = iDeg * M.DEG, w = argpDeg * M.DEG;
    const cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(w), sw = Math.sin(w);
    return [
      [cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci, sO * si],
      [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci, -cO * si],
      [sw * si, cw * si, ci]
    ];
  },
  matVec(q, v) {
    return [q[0][0] * v[0] + q[0][1] * v[1] + q[0][2] * v[2], q[1][0] * v[0] + q[1][1] * v[1] + q[1][2] * v[2], q[2][0] * v[0] + q[2][1] * v[1] + q[2][2] * v[2]];
  },
  perifocalState(el, mu, thetaDeg) {
    const theta = thetaDeg * M.DEG;
    const p = el.h * el.h / mu;
    const den = 1 + el.e * Math.cos(theta);
    if (den <= 1e-9) throw new RangeError('True anomaly is outside the physical conic branch.');
    const rMag = p / den;
    const r = [rMag * Math.cos(theta), rMag * Math.sin(theta), 0];
    const v = [-mu / el.h * Math.sin(theta), mu / el.h * (el.e + Math.cos(theta)), 0];
    return { r, v, p, rMag, speed: M.norm(v) };
  },
  state(el, bodyKey = 'earth', thetaDeg = el.theta) {
    const body = this.bodies[bodyKey];
    const q = this.rotationMatrix(el.raan, el.i, el.argp);
    const pf = this.perifocalState(el, body.mu, thetaDeg);
    const r = this.matVec(q, pf.r), v = this.matVec(q, pf.v);
    const hVec = M.cross(r, v);
    return { r, v, hVec, speed: M.norm(v), radius: M.norm(r), p: pf.p };
  },
  orbitalMetrics(el, bodyKey = 'earth') {
    const body = this.bodies[bodyKey], p = el.h * el.h / body.mu, e = el.e;
    const isElliptic = e < 1 - 1e-8;
    const isParabolic = Math.abs(e - 1) <= 1e-8;
    const isHyperbolic = e > 1 + 1e-8;
    const a = isParabolic ? Infinity : p / (1 - e * e);
    const rp = p / (1 + e);
    const ra = isElliptic ? p / (1 - e) : Infinity;
    const period = isElliptic ? 2 * Math.PI * Math.sqrt(a * a * a / body.mu) : Infinity;
    const displayTheta = isHyperbolic ? Math.acos(-1 / e) * 0.88 : isParabolic ? 160 * M.DEG : Math.PI;
    const displayRadius = p / (1 + e * Math.cos(displayTheta));
    return {
      p, a, rp, ra, period, isElliptic, isParabolic, isHyperbolic,
      perigeeAltitude: rp - body.radius,
      apogeeAltitude: isElliptic ? ra - body.radius : Infinity,
      displayRadius,
      specificEnergy: isParabolic ? 0 : -body.mu / (2 * a)
    };
  },
  eccentricFromTrue(thetaDeg, e) {
    const nu = thetaDeg * M.DEG;
    if (e < 1 - 1e-8) {
      return Math.atan2(Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(nu), e + Math.cos(nu));
    }
    if (e > 1 + 1e-8) {
      const factor = Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2);
      return 2 * Math.atanh(M.clamp(factor, -0.999999999, 0.999999999));
    }
    return Math.tan(nu / 2); // Barker variable D for a parabolic trajectory.
  },
  trueFromEccentric(anomaly, e) {
    if (e < 1 - 1e-8) {
      return M.mod(Math.atan2(Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(anomaly), Math.cos(anomaly) - e), 2 * Math.PI) * M.RAD;
    }
    if (e > 1 + 1e-8) {
      return 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(anomaly / 2)) * M.RAD;
    }
    return 2 * Math.atan(anomaly) * M.RAD;
  },
  meanFromTrue(thetaDeg, e) {
    const anomaly = this.eccentricFromTrue(thetaDeg, e);
    if (e < 1 - 1e-8) return M.mod(anomaly - e * Math.sin(anomaly), 2 * Math.PI);
    if (e > 1 + 1e-8) return e * Math.sinh(anomaly) - anomaly;
    return anomaly + anomaly * anomaly * anomaly / 3;
  },
  solveKepler(meanAnomaly, e) {
    if (e < 1 - 1e-8) {
      let E = e < 0.8 ? meanAnomaly : Math.PI;
      for (let k = 0; k < 24; k++) {
        const f = E - e * Math.sin(E) - meanAnomaly;
        const fp = 1 - e * Math.cos(E);
        const d = f / fp;
        E -= d;
        if (Math.abs(d) < 1e-12) break;
      }
      return E;
    }
    let H = Math.asinh(meanAnomaly / Math.max(e, 1));
    for (let k = 0; k < 40; k++) {
      const f = e * Math.sinh(H) - H - meanAnomaly;
      const fp = e * Math.cosh(H) - 1;
      const d = f / fp;
      H -= d;
      if (Math.abs(d) < 1e-12) break;
    }
    return H;
  },
  meanMotion(el, bodyKey = 'earth') {
    const m = this.orbitalMetrics(el, bodyKey);
    if (m.isParabolic) return 0;
    return Math.sqrt(this.bodies[bodyKey].mu / Math.pow(Math.abs(m.a), 3));
  },
  timeSincePerigee(thetaDeg, el, bodyKey = 'earth') {
    const m = this.orbitalMetrics(el, bodyKey);
    const anomalyMean = this.meanFromTrue(thetaDeg, el.e);
    if (m.isParabolic) return 0.5 * Math.sqrt(Math.pow(m.p, 3) / this.bodies[bodyKey].mu) * anomalyMean;
    return anomalyMean / this.meanMotion(el, bodyKey);
  },
  thetaAtTime(timeSec, el, bodyKey = 'earth') {
    const m = this.orbitalMetrics(el, bodyKey);
    if (m.isParabolic) {
      const scale = 0.5 * Math.sqrt(Math.pow(m.p, 3) / this.bodies[bodyKey].mu);
      const target = timeSec / scale;
      let D = Math.cbrt(3 * target);
      for (let k = 0; k < 30; k++) {
        const f = D + D * D * D / 3 - target;
        const d = f / (1 + D * D);
        D -= d;
        if (Math.abs(d) < 1e-12) break;
      }
      return this.trueFromEccentric(D, 1);
    }
    const n = this.meanMotion(el, bodyKey);
    const mean = m.isElliptic ? M.mod(n * timeSec, 2 * Math.PI) : n * timeSec;
    return this.trueFromEccentric(this.solveKepler(mean, el.e), el.e);
  },
  orbitPath(el, bodyKey = 'earth', samples = 360, scale = 1) {
    const body = this.bodies[bodyKey], p = el.h * el.h / body.mu;
    let start = 0, end = 2 * Math.PI;
    if (el.e > 1 + 1e-8) {
      const limit = Math.acos(-1 / el.e) * 0.94;
      start = -limit; end = limit;
    } else if (Math.abs(el.e - 1) <= 1e-8) {
      start = -155 * M.DEG; end = 155 * M.DEG;
    }
    const points = [];
    for (let k = 0; k <= samples; k++) {
      const theta = start + (end - start) * k / samples;
      const radius = p / (1 + el.e * Math.cos(theta));
      points.push([radius * Math.cos(theta) * scale / body.radius, radius * Math.sin(theta) * scale / body.radius, 0]);
    }
    return points;
  },
  ascendingNodeTheta(el) { return M.mod(-el.argp, 360); },
  nodeDirection(el) {
    const O = el.raan * M.DEG;
    return [Math.cos(O), Math.sin(O), 0];
  }
};

export { Physics as OrbitPhysics };
if (typeof window !== 'undefined') window.OrbitPhysics = Physics;
