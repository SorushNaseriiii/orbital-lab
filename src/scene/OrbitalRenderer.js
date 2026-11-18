import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OrbitPhysics as P } from '../core/orbit.js';
import { SolarModel as Solar } from '../core/solar.js';

const defaultVisuals = {
  orbit: { label: 'Orbit path', color: '#67d9ee', visible: true, opacity: .50 },
  orbitalPlane: { label: 'Orbital plane', color: '#4389b9', visible: false, opacity: .12 },
  equatorialPlane: { label: 'Equatorial plane', color: '#8d9fb9', visible: true, opacity: .075 },
  eclipticPlane: { label: 'Ecliptic plane', color: '#e8bd69', visible: false, opacity: .10 },
  rVector: { label: 'Position vector r', color: '#f4c76d', visible: true, opacity: 1, legend: true },
  vVector: { label: 'Velocity vector v', color: '#ff8297', visible: true, opacity: 1, legend: true },
  hVector: { label: 'Angular momentum h', color: '#b69bff', visible: true, opacity: .9, legend: true },
  eVector: { label: 'Eccentricity vector e', color: '#a3e6a0', visible: true, opacity: .9, legend: true },
  nodeLine: { label: 'Node line N', color: '#54d7a2', visible: true, opacity: .9 },
  satellite: { label: 'Satellite', color: '#e9f4ff', visible: true, opacity: 1 },
  trail: { label: 'Motion trail', color: '#f39ac4', visible: true, opacity: .72 },
  axes: { label: 'ECI axes', color: '#8193ad', visible: true, opacity: .82, legend: true },
  body: { label: 'Body base color', color: '#286c9b', visible: true, opacity: 1 },
  atmosphere: { label: 'Atmosphere', color: '#5aa8f5', visible: true, opacity: .62 },
  sunDirection: { label: 'Sun direction', color: '#f0ca7a', visible: true, opacity: .10 },
};

const eciToThree = ([x, y, z]) => new THREE.Vector3(x, z, -y);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const EARTH_SURFACE_CLEARANCE = 1.035;

function clipRayLengthOutsideSphere(origin, direction, requestedLength, minimumRadius = EARTH_SURFACE_CLEARANCE) {
  const dir = direction.clone().normalize();
  const b = origin.dot(dir);
  if (b >= 0) return requestedLength;
  const c = origin.lengthSq() - minimumRadius * minimumRadius;
  if (c <= 0) return 0;
  const discriminant = b * b - c;
  if (discriminant <= 0) return requestedLength;
  const firstIntersection = -b - Math.sqrt(discriminant);
  if (firstIntersection < 0 || firstIntersection >= requestedLength) return requestedLength;
  return Math.max(0, firstIntersection - 0.025);
}

function keepPointOutsideSphere(point, minimumRadius = 1.075) {
  if (point.lengthSq() < minimumRadius * minimumRadius) {
    if (point.lengthSq() < 1e-12) point.set(minimumRadius, 0, 0);
    else point.setLength(minimumRadius);
  }
  return point;
}

function greenwichSiderealAngle(date = new Date()) {
  const julianDate = date.getTime() / 86400000 + 2440587.5;
  const centuries = (julianDate - 2451545.0) / 36525;
  const degrees = 280.46061837
    + 360.98564736629 * (julianDate - 2451545.0)
    + 0.000387933 * centuries * centuries
    - (centuries * centuries * centuries) / 38710000;
  return THREE.MathUtils.degToRad(THREE.MathUtils.euclideanModulo(degrees, 360));
}


function makeTextSprite(text, color = '#ffe0a0') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '700 54px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(0,0,0,.85)';
  context.shadowBlur = 18;
  context.fillStyle = color;
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(1.05, .33, 1);
  sprite.userData.labelTexture = texture;
  return sprite;
}

function updateTextSprite(sprite, text, color = '#ffffff') {
  if (sprite.userData.currentText === text && sprite.userData.currentColor === color) return;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  context.font = '700 54px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(0,0,0,.9)';
  context.shadowBlur = 18;
  context.fillStyle = color;
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  sprite.material.map?.dispose();
  sprite.material.map = texture;
  sprite.material.needsUpdate = true;
  sprite.userData.currentText = text;
  sprite.userData.currentColor = color;
}

function makeSunGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 4, 128, 128, 124);
  gradient.addColorStop(0, 'rgba(255,255,235,1)');
  gradient.addColorStop(.10, 'rgba(255,226,150,.92)');
  gradient.addColorStop(.28, 'rgba(255,174,78,.46)');
  gradient.addColorStop(.58, 'rgba(255,130,42,.13)');
  gradient.addColorStop(1, 'rgba(255,110,28,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}


function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(170,245,255,.95)');
  gradient.addColorStop(.18, 'rgba(93,215,255,.45)');
  gradient.addColorStop(.55, 'rgba(65,172,255,.12)');
  gradient.addColorStop(1, 'rgba(65,172,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function seeded(seed) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

function makeStars() {
  const random = seeded(82177);
  const positions = [];
  for (let i = 0; i < 1700; i++) {
    const u = random() * 2 - 1;
    const a = random() * Math.PI * 2;
    const r = 250000 + random() * 30000;
    const s = Math.sqrt(1 - u * u);
    positions.push(r * s * Math.cos(a), r * u, r * s * Math.sin(a));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x9bb9d8, size: 1.65, sizeAttenuation: false, transparent: true, opacity: .62 }));
}

function makeAtmosphereMaterial(color = '#5aa8f5') {
  return new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(color) }, glowOpacity: { value: .55 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float glowOpacity;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        float facing = max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0);
        float rim = pow(1.0 - facing, 2.15);
        gl_FragColor = vec4(glowColor, rim * glowOpacity);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
}

function makeArrow(color, opacity = 1) {
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color, .16, .085);
  arrow.line.material.transparent = true;
  arrow.cone.material.transparent = true;
  arrow.line.material.opacity = opacity;
  arrow.cone.material.opacity = opacity;
  arrow.line.material.depthTest = true;
  arrow.cone.material.depthTest = true;
  return arrow;
}

function setObjectMaterial(object, color, opacity) {
  object.traverse((child) => {
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    for (const material of materials) {
      if (material.color && color) material.color.set(color);
      if ('opacity' in material) {
        material.opacity = opacity;
        material.transparent = opacity < .999;
      }
      material.needsUpdate = true;
    }
  });
}

function makeTaperedTubeGeometry(curve, tubularSegments, radius, radialSegments = 8, tailRatio = 0.045) {
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const positions = geometry.attributes.position;
  const ringSize = radialSegments + 1;
  for (let ring = 0; ring <= tubularSegments; ring++) {
    const t = ring / tubularSegments;
    const center = curve.getPointAt(t);
    const taper = tailRatio + (1 - tailRatio) * Math.pow(t, 1.28);
    for (let side = 0; side <= radialSegments; side++) {
      const index = ring * ringSize + side;
      const vertex = new THREE.Vector3().fromBufferAttribute(positions, index);
      vertex.sub(center).multiplyScalar(taper).add(center);
      positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export class OrbitalRenderer {
  static defaults = defaultVisuals;

  constructor(canvas) {
    this.canvas = canvas;
    this.bodyKey = 'earth';
    this.elements = P.defaultElements('earth');
    this.timeSec = P.timeSincePerigee(this.elements.theta, this.elements, 'earth');
    this.running = false;
    this.speed = 600;
    this.pulseStart = 0;
    this.settings = {
      planetOpacity: 1,
      textureStrength: 1,
      atmosphereOpacity: .55,
      showAtmosphere: true,
      glowOnChange: true,
      equatorialScale: 1.35,
      showEarthSolarOrbit: false,
      angleAnnotations: { raan: true, inclination: true, argp: true, theta: true },
      visuals: JSON.parse(JSON.stringify(defaultVisuals))
    };
    this.textureCache = new Map();
    this.trailPoints = [];
    this.lastTrailPosition = null;
    this.trailLastMovementTime = 0;
    this.trailAlpha = 0;
    this.lastTheta = null;
    this.userInteracting = false;
    this.lastPulseStart = 0;
    // Align the map's Greenwich meridian approximately with the current GMST at startup.
    this.earthRotationAngle = greenwichSiderealAngle();
    this.lastRenderTimestamp = null;
    this.viewMode = 'earth';
    this.cameraTransition = null;
    this.solarEpochDate = new Date();
    this.solarMeanAnomaly = Solar.meanAnomalyAtDate(this.solarEpochDate);
    this.solarEpochMeanAnomaly = this.solarMeanAnomaly;
    this.savedEarthCamera = null;
    this.lastFittedCameraDistance = 0;
    this.sunDirection = eciToThree(Solar.apparentSunDirectionECI(this.solarEpochDate)).normalize();
    const earthRadius = P.bodies.earth.radius;
    this.sunDistance = Solar.AU / earthRadius;
    this.sunRadius = 695700000 / earthRadius;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line.threshold = 0.055;
    this.hoverTargets = [];
    this.hoveredObject = null;

    this.scene = new THREE.Scene();
    this.scene.add(makeStars());
    this.camera = new THREE.PerspectiveCamera(39, 1, .08, 1000000);
    this.camera.position.set(4.8, 3.5, 7.0);
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.setClearColor(0x000000, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.cameraDampingEnabled = true;
    this.controls.dampingFactor = .065;
    this.controls.enablePan = false;
    this.controls.minDistance = this.cameraMinDistance();
    this.controls.maxDistance = 100000;
    this.controls.target.copy(this.framedTarget('earth', this.camera.position.length()));
    this.camera.position.add(this.controls.target);
    this.homeCameraPosition = this.camera.position.clone();
    this.controls.addEventListener('start', () => { this.userInteracting = true; });
    this.controls.addEventListener('end', () => { this.userInteracting = false; });

    this.earthSystemGroup = new THREE.Group();
    this.scene.add(this.earthSystemGroup);
    this.scene.add(new THREE.HemisphereLight(0xa9c9ed, 0x101827, .72));
    const keyLight = new THREE.DirectionalLight(0xfff1d7, 2.65);
    keyLight.position.copy(this.sunDirection).multiplyScalar(this.sunDistance);
    keyLight.target = this.earthSystemGroup;
    this.keyLight = keyLight;
    this.scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x3f91df, .48);
    rimLight.position.set(5, -2, -5);
    this.scene.add(rimLight);

    this.sunGroup = new THREE.Group();
    this.sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(this.sunRadius, 48, 32),
      new THREE.MeshBasicMaterial({ color: '#fff0ad', transparent: true, opacity: .98, depthWrite: false, toneMapped: false })
    );
    this.sunCore.renderOrder = -2;
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeSunGlowTexture(), color: '#fff0bd', transparent: true, opacity: .80, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false }));
    this.sunGlow.scale.set(this.sunRadius * 6.1, this.sunRadius * 6.1, 1);
    this.sunGlow.renderOrder = -3;
    this.sunLabel = makeTextSprite('Sun', '#fff0bd');
    this.sunLabel.scale.set(720, 220, 1);
    this.sunLabel.position.set(0, 190, 0);
    this.sunGroup.add(this.sunCore, this.sunGlow, this.sunLabel);
    this.sunLabel.visible = false;
    this.sunGroup.userData.tooltip = 'Sun';
    this.sunCore.userData.tooltip = 'Sun';
    this.sunGlow.userData.tooltip = 'Sun';
    this.scene.add(this.sunGroup);

    this.sunDirectionLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 4)]),
      new THREE.LineDashedMaterial({ color: defaultVisuals.sunDirection.color, dashSize: .42, gapSize: .28, transparent: true, opacity: defaultVisuals.sunDirection.opacity, depthWrite: false })
    );
    this.sunDirectionLine.computeLineDistances();
    this.sunDirectionLine.userData.tooltip = 'Sun direction';
    this.scene.add(this.sunDirectionLine);

    const solarOrbitSamples = 360;
    const earthSolarGeometry = new THREE.BufferGeometry();
    earthSolarGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((solarOrbitSamples + 1) * 3), 3));
    this.earthSolarOrbitLine = new THREE.Line(
      earthSolarGeometry,
      new THREE.LineDashedMaterial({ color: '#d6b878', dashSize: 260, gapSize: 190, transparent: true, opacity: .24, depthWrite: false })
    );
    this.earthSolarOrbitLine.userData.tooltip = 'Earth heliocentric orbit · visual reference only';
    this.earthSolarOrbitLine.frustumCulled = false;
    this.scene.add(this.earthSolarOrbitLine);


    this.bodyGroup = new THREE.Group();
    this.earthSystemGroup.add(this.bodyGroup);
    this.bodyGeometry = new THREE.SphereGeometry(1, 112, 80);
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9, metalness: .015 });
    // Keep the Earth albedo on the native Three.js UV map. Texture strength is blended
    // in linear color space without copying the source image through an intermediate canvas.
    this.bodyMaterial.onBeforeCompile = (shader) => {
      const nightState = this.textureCache.get('night');
      shader.uniforms.uTextureStrength = { value: clamp(this.settings.textureStrength, 0, 1) };
      shader.uniforms.uBodyTint = { value: new THREE.Color(this.settings.visuals.body.color || '#286c9b') };
      shader.uniforms.uNightMap = { value: nightState?.texture || null };
      shader.uniforms.uHasNightMap = { value: !!nightState?.loadedRealMap };
      shader.uniforms.uNightLightStrength = { value: 0.38 };
      shader.uniforms.uSunDirectionView = { value: new THREE.Vector3(1, 0, 0) };
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nuniform float uTextureStrength;\nuniform vec3 uBodyTint;\nuniform sampler2D uNightMap;\nuniform bool uHasNightMap;\nuniform float uNightLightStrength;\nuniform vec3 uSunDirectionView;'
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n#ifdef USE_MAP\n  diffuseColor.rgb = mix(uBodyTint, diffuseColor.rgb, clamp(uTextureStrength, 0.0, 1.0));\n#endif'
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n#ifdef USE_MAP\n  if (uHasNightMap) {\n    vec3 nightSample = texture2D(uNightMap, vMapUv).rgb;\n    float nightLuma = dot(nightSample, vec3(0.2126, 0.7152, 0.0722));\n    float cityMask = smoothstep(0.035, 0.20, nightLuma);\n    float sunFacing = dot(normalize(normal), normalize(uSunDirectionView));\n    float nightFactor = 1.0 - smoothstep(-0.12, 0.08, sunFacing);\n    vec3 nightEmission = nightSample * (0.10 + cityMask * 0.78);\n    totalEmissiveRadiance += nightEmission * uNightLightStrength * nightFactor;\n  }\n#endif`
      );
      this.bodyMaterial.userData.shader = shader;
      this.updateEarthTextureUniforms();
    };
    this.bodyMaterial.customProgramCacheKey = () => 'orbital-lab-earth-albedo-nightlights-v2';
    this.bodyMesh = new THREE.Mesh(this.bodyGeometry, this.bodyMaterial);
    this.bodyMesh.userData.tooltip = 'Earth';
    this.bodyGroup.add(this.bodyMesh);
    this.atmosphereMesh = new THREE.Mesh(new THREE.SphereGeometry(1.055, 96, 64), makeAtmosphereMaterial());
    this.atmosphereMesh.renderOrder = 4;
    this.bodyGroup.add(this.atmosphereMesh);

    this.orbitalFrame = new THREE.Group();
    this.earthSystemGroup.add(this.orbitalFrame);
    this.orbitPlaneMaterial = new THREE.MeshBasicMaterial({ color: defaultVisuals.orbitalPlane.color, transparent: true, opacity: defaultVisuals.orbitalPlane.opacity, side: THREE.DoubleSide, depthWrite: false });
    this.orbitPlane = new THREE.Mesh(new THREE.CircleGeometry(1, 144), this.orbitPlaneMaterial);
    this.orbitPlane.renderOrder = 1;
    this.orbitPlane.userData.tooltip = 'Orbital plane · perifocal plane rotated into ECI';
    this.orbitalFrame.add(this.orbitPlane);
    const orbitSamples = 420;
    const orbitGeometry = new THREE.BufferGeometry();
    orbitGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((orbitSamples + 1) * 3), 3));
    this.orbitLine = new THREE.Line(orbitGeometry, new THREE.LineDashedMaterial({ color: defaultVisuals.orbit.color, dashSize: .16, gapSize: .11, transparent: true, opacity: defaultVisuals.orbit.opacity }));
    this.orbitSamples = orbitSamples;
    this.orbitLine.userData.tooltip = 'Keplerian conic trajectory · ECI · elliptic, parabolic or hyperbolic';
    this.orbitalFrame.add(this.orbitLine);
    this.perigeeLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]),
      new THREE.LineBasicMaterial({ color: '#f4c76d', transparent: true, opacity: .48, depthWrite: false })
    );
    this.perigeeLine.userData.tooltip = 'Perigee direction';
    this.perigeeMarker = new THREE.Mesh(
      new THREE.SphereGeometry(.035, 18, 12),
      new THREE.MeshBasicMaterial({ color: '#f4c76d' })
    );
    this.perigeeMarker.userData.tooltip = 'Perigee';
    this.orbitalFrame.add(this.perigeeLine, this.perigeeMarker);

    this.equatorialGroup = this.createReferencePlane(1.2, '#8d9fb9', .075);
    this.equatorialGroup.userData.tooltip = 'Equatorial plane · ECI reference plane (XY)';
    this.earthSystemGroup.add(this.equatorialGroup);
    this.eclipticGroup = this.createReferencePlane(1.34, '#e8bd69', .10, false);
    this.eclipticGroup.userData.tooltip = 'Ecliptic plane · Earth orbital plane around the Sun';
    this.earthSystemGroup.add(this.eclipticGroup);

    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.nodeLine = new THREE.LineSegments(nodeGeometry, new THREE.LineDashedMaterial({ color: defaultVisuals.nodeLine.color, dashSize: .10, gapSize: .065, transparent: true, opacity: defaultVisuals.nodeLine.opacity }));
    this.nodeLine.userData.tooltip = 'Reference node line N · direction defined by RAAN in the equatorial plane · ECI';
    this.earthSystemGroup.add(this.nodeLine);

    this.axesGroup = new THREE.Group();
    this.axisArrows = [
      new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1.65, '#d8797d', .13, .07),
      new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1.65, '#72c99a', .13, .07),
      new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1.65, '#77a8ed', .13, .07)
    ];
    this.axisArrows.forEach((arrow, index) => {
      const labels = ['ECI X · vernal equinox direction', 'ECI Y · equatorial 90° direction', 'ECI Z · north celestial pole'];
      arrow.line.userData.tooltip = labels[index];
      arrow.cone.userData.tooltip = labels[index];
      this.axesGroup.add(arrow);
    });
    this.axisLabels = [
      makeTextSprite('X', '#d8797d'),
      makeTextSprite('Y', '#72c99a'),
      makeTextSprite('Z', '#77a8ed')
    ];
    const axisLabelPositions = [new THREE.Vector3(1.95, 0, 0), new THREE.Vector3(0, 0, -1.95), new THREE.Vector3(0, 1.95, 0)];
    this.axisLabels.forEach((label, index) => {
      label.position.copy(axisLabelPositions[index]);
      label.renderOrder = 10;
      label.userData.tooltip = `ECI ${['X','Y','Z'][index]} axis`;
      this.axesGroup.add(label);
    });
    this.earthSystemGroup.add(this.axesGroup);

    this.rArrow = makeArrow(defaultVisuals.rVector.color, 1);
    this.vArrow = makeArrow(defaultVisuals.vVector.color, 1);
    this.hArrow = makeArrow(defaultVisuals.hVector.color, .9);
    this.eArrow = makeArrow(defaultVisuals.eVector.color, .9);
    for (const [arrow, label] of [[this.rArrow, 'Position vector r · Earth-centred inertial (ECI)'], [this.vArrow, 'Velocity vector v · Earth-centred inertial (ECI)'], [this.hArrow, 'Specific angular momentum vector h = r × v · ECI'], [this.eArrow, 'Eccentricity vector e · points toward perigee · ECI']]) {
      arrow.line.userData.tooltip = label;
      arrow.cone.userData.tooltip = label;
    }
    this.earthSystemGroup.add(this.rArrow, this.vArrow, this.hArrow, this.eArrow);
    this.vectorLabels = {
      rVector: makeTextSprite('r', defaultVisuals.rVector.color),
      vVector: makeTextSprite('v', defaultVisuals.vVector.color),
      hVector: makeTextSprite('h', defaultVisuals.hVector.color),
      eVector: makeTextSprite('e', defaultVisuals.eVector.color)
    };
    for (const label of Object.values(this.vectorLabels)) { label.scale.set(.34, .34, 1); this.earthSystemGroup.add(label); }

    this.satelliteGroup = this.createSatellite();
    this.satelliteGroup.userData.tooltip = 'Satellite · position and local orbital frame';
    this.satelliteGroup.traverse((child) => { if (child.isMesh) child.userData.tooltip = 'Satellite · body and solar panels'; });
    this.earthSystemGroup.add(this.satelliteGroup);
    this.glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: '#8ceaff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .18 }));
    this.glowSprite.scale.set(.72, .72, .72);
    this.earthSystemGroup.add(this.glowSprite);

    this.trailInnerMaterial = new THREE.MeshBasicMaterial({ color: defaultVisuals.trail.color, transparent: true, opacity: .88, blending: THREE.AdditiveBlending, depthWrite: false });
    this.trailOuterMaterial = new THREE.MeshBasicMaterial({ color: defaultVisuals.trail.color, transparent: true, opacity: .19, blending: THREE.AdditiveBlending, depthWrite: false });
    this.trailInner = new THREE.Mesh(new THREE.BufferGeometry(), this.trailInnerMaterial);
    this.trailOuter = new THREE.Mesh(new THREE.BufferGeometry(), this.trailOuterMaterial);
    this.trailInner.frustumCulled = false;
    this.trailOuter.frustumCulled = false;
    this.trailInner.userData.tooltip = 'Satellite motion trail · recent simulated path';
    this.earthSystemGroup.add(this.trailOuter, this.trailInner);

    this.angleAnnotations = {};
    for (const [key, label, color] of [
      ['raan', 'Ω', '#7bd9ff'], ['inclination', 'i', '#c1a4ff'], ['argp', 'ω', '#77e0b1'], ['theta', 'θ', '#ffc66f']
    ]) this.angleAnnotations[key] = this.createAngleAnnotation(label, color);

    this.sceneTooltip = document.createElement('div');
    this.sceneTooltip.className = 'scene-tooltip';
    this.sceneTooltip.hidden = true;
    canvas.parentElement?.appendChild(this.sceneTooltip);
    this.bindSceneTooltips();
    this.loadEarthTexture();
    this.loadEarthNightTexture();
    this.updateSunPlacement();
    this.updateSolarOrbitPaths(this.solarMeanAnomaly);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement || canvas);
    this.bindCameraReset();
    this.setBody('earth');
    this.resize();
  }

  createReferencePlane(radius, color, opacity, showOutline = true) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 144), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 0;
    group.add(mesh);
    if (showOutline) {
      const points = [];
      for (let i = 0; i < 180; i++) {
        const a = i / 180 * Math.PI * 2;
        points.push(new THREE.Vector3(radius * Math.cos(a), 0, radius * Math.sin(a)));
      }
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: Math.min(1, opacity * 3.2) }));
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);
    }
    return group;
  }

  createSatellite() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#d8e2ed', metalness: .72, roughness: .32 });
    this.satelliteBodyMaterial = bodyMat;
    const goldMat = new THREE.MeshStandardMaterial({ color: '#b99458', metalness: .76, roughness: .28 });
    const panelMat = new THREE.MeshStandardMaterial({ color: '#285b9b', metalness: .48, roughness: .38, emissive: '#102b55', emissiveIntensity: .18 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(.105, .09, .16), bodyMat);
    group.add(body);
    const core = new THREE.Mesh(new THREE.BoxGeometry(.12, .075, .09), goldMat);
    core.position.x = -.01;
    group.add(core);
    for (const sign of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(.018, .42, .14), panelMat);
      panel.position.y = sign * .255;
      group.add(panel);
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .12, 8), goldMat);
      strut.position.y = sign * .07;
      group.add(strut);
    }
    const antennaStem = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .16, 8), goldMat);
    antennaStem.position.set(.015, .015, -.12);
    antennaStem.rotation.x = Math.PI / 3;
    group.add(antennaStem);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(.065, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#cbd8e8', metalness: .8, roughness: .22, side: THREE.DoubleSide }));
    dish.position.set(.02, .07, -.16);
    dish.rotation.x = Math.PI / 2;
    group.add(dish);
    group.scale.setScalar(.45);
    return group;
  }

  getTextureState(type = 'earth') {
    if (this.textureCache.has(type)) return this.textureCache.get(type);
    const state = { texture: null, loadedRealMap: false, sourceUrl: null, attemptedUrls: [], loading: false };
    this.textureCache.set(type, state);
    return state;
  }

  configureEarthTexture(texture) {
    texture.mapping = THREE.UVMapping;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.flipY = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 16);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  updateEarthTextureUniforms() {
    const shader = this.bodyMaterial?.userData?.shader;
    if (!shader) return;
    shader.uniforms.uTextureStrength.value = clamp(this.settings.textureStrength, 0, 1);
    shader.uniforms.uBodyTint.value.set(this.settings.visuals.body.color || '#286c9b');
    const nightState = this.textureCache.get('night');
    shader.uniforms.uNightMap.value = nightState?.texture || null;
    shader.uniforms.uHasNightMap.value = !!nightState?.loadedRealMap;
  }

  updateEarthNightLightUniforms() {
    const shader = this.bodyMaterial?.userData?.shader;
    if (!shader) return;
    this.camera.updateMatrixWorld();
    shader.uniforms.uSunDirectionView.value.copy(this.sunDirection).transformDirection(this.camera.matrixWorldInverse).normalize();
  }

  loadEarthNightTexture() {
    const textureState = this.getTextureState('night');
    if (textureState.loading || textureState.loadedRealMap) return;

    const base = import.meta.env.BASE_URL || './';
    const basePath = base.endsWith('/') ? base : `${base}/`;
    const candidateUrls = [
      new URL(`${basePath}assets/earth-night-lights.jpg`, window.location.href),
      new URL(`${basePath}earth-night-lights.jpg`, window.location.href),
      new URL('./assets/earth-night-lights.jpg', window.location.href)
    ];
    const urls = [...new Map(candidateUrls.map((url) => [url.href, url])).values()];
    textureState.attemptedUrls = urls.map((url) => url.href);
    textureState.loading = true;

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const tryLoad = (index) => {
      if (index >= urls.length) {
        textureState.loading = false;
        textureState.loadedRealMap = false;
        console.warn(`[ORBITAL LAB] Optional NASA night-lights map unavailable. Place earth-night-lights.jpg in public/assets/ to enable city lights on the night hemisphere. Tried: ${textureState.attemptedUrls.join(' | ')}`);
        this.canvas.dispatchEvent(new CustomEvent('earth-night-texture-fallback'));
        return;
      }
      const url = urls[index];
      textureState.sourceUrl = url.href;
      loader.load(url.href, (loadedTexture) => {
        const image = loadedTexture.image;
        const width = image?.naturalWidth || image?.width || 0;
        const height = image?.naturalHeight || image?.height || 0;
        if (width < 1024 || height < 512 || Math.abs(width / Math.max(1, height) - 2) > 0.12) {
          loadedTexture.dispose();
          console.warn(`[ORBITAL LAB] Rejected night-lights map ${url.href}: ${width}×${height}; expected a 2:1 equirectangular map.`);
          tryLoad(index + 1);
          return;
        }
        this.configureEarthTexture(loadedTexture);
        textureState.texture = loadedTexture;
        textureState.loadedRealMap = true;
        textureState.loading = false;
        this.updateEarthTextureUniforms();
        console.info(`[ORBITAL LAB] NASA Black Marble night-lights map loaded: ${width}×${height} (${url.href})`);
        this.canvas.dispatchEvent(new CustomEvent('earth-night-texture-loaded', { detail: { width, height, url: url.href } }));
      }, undefined, (error) => {
        console.warn(`[ORBITAL LAB] Night-lights map load failed at ${url.href}`, error || '');
        tryLoad(index + 1);
      });
    };
    tryLoad(0);
  }

  loadEarthTexture() {
    const textureState = this.getTextureState('earth');
    if (textureState.loading || textureState.loadedRealMap) return;

    const base = import.meta.env.BASE_URL || './';
    const basePath = base.endsWith('/') ? base : `${base}/`;
    const candidateUrls = [
      new URL(`${basePath}assets/earth-blue-marble.jpg`, window.location.href),
      new URL(`${basePath}earth-blue-marble.jpg`, window.location.href),
      new URL('./assets/earth-blue-marble.jpg', window.location.href),
      new URL('./earth-blue-marble.jpg', window.location.href)
    ];
    const urls = [...new Map(candidateUrls.map((url) => [url.href, url])).values()];
    textureState.attemptedUrls = urls.map((url) => url.href);
    textureState.loading = true;

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    const tryLoad = (index) => {
      if (index >= urls.length) {
        textureState.loading = false;
        this.handleEarthTextureFailure(
          textureState,
          `No valid 2:1 equirectangular Earth map was found. Tried: ${textureState.attemptedUrls.join(' | ')}. Place earth-blue-marble.jpg in public/assets/ before starting or building.`
        );
        return;
      }

      const url = urls[index];
      textureState.sourceUrl = url.href;
      loader.load(url.href, (loadedTexture) => {
        const image = loadedTexture.image;
        const sourceWidth = image?.naturalWidth || image?.width || 0;
        const sourceHeight = image?.naturalHeight || image?.height || 0;
        const aspect = sourceWidth / Math.max(1, sourceHeight);
        if (sourceWidth < 1024 || sourceHeight < 512 || Math.abs(aspect - 2) > 0.12) {
          loadedTexture.dispose();
          console.warn(`[ORBITAL LAB] Rejected Earth map ${url.href}: ${sourceWidth}×${sourceHeight}; expected a 2:1 equirectangular map.`);
          tryLoad(index + 1);
          return;
        }

        const uv = this.bodyGeometry.getAttribute('uv');
        const positions = this.bodyGeometry.getAttribute('position');
        if (!uv || !positions || uv.count !== positions.count) {
          loadedTexture.dispose();
          textureState.loading = false;
          this.handleEarthTextureFailure(textureState, 'Earth sphere geometry has no valid UV coordinates.');
          return;
        }

        // Use the loaded image directly as MeshStandardMaterial.map. Downsample only
        // when the source exceeds the GPU limit; this avoids unnecessary canvas copies.
        const gpuLimit = Math.min(8192, this.renderer.capabilities.maxTextureSize || 4096);
        let earthTexture = loadedTexture;
        let finalWidth = sourceWidth;
        let finalHeight = sourceHeight;
        if (sourceWidth > gpuLimit || sourceHeight > gpuLimit) {
          const scale = Math.min(1, gpuLimit / sourceWidth, gpuLimit / sourceHeight);
          finalWidth = Math.max(2, Math.round(sourceWidth * scale));
          finalHeight = Math.max(2, Math.round(sourceHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = finalWidth;
          canvas.height = finalHeight;
          const context = canvas.getContext('2d', { alpha: false });
          if (!context) {
            loadedTexture.dispose();
            textureState.loading = false;
            this.handleEarthTextureFailure(textureState, 'The browser could not create a 2D canvas context to resize the Earth map for the GPU.');
            return;
          }
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          context.drawImage(image, 0, 0, finalWidth, finalHeight);
          earthTexture = new THREE.CanvasTexture(canvas);
          loadedTexture.dispose();
        }

        this.configureEarthTexture(earthTexture);
        textureState.texture = earthTexture;
        textureState.loadedRealMap = true;
        textureState.loading = false;
        this.bodyMaterial.map = earthTexture;
        this.bodyMaterial.color.set('#ffffff');
        this.bodyMaterial.needsUpdate = true;
        this.updateEarthTextureUniforms();

        console.info(`[ORBITAL LAB] Earth albedo mapped directly to SphereGeometry UVs: ${sourceWidth}×${sourceHeight} → ${finalWidth}×${finalHeight}; UVMapping, sRGB, RepeatWrapping and anisotropic filtering enabled (${url.href})`);
        this.canvas.dispatchEvent(new CustomEvent('earth-texture-loaded', {
          detail: { width: finalWidth, height: finalHeight, sourceWidth, sourceHeight, url: url.href, mapping: 'UVMapping' }
        }));
      }, undefined, (error) => {
        console.warn(`[ORBITAL LAB] Earth map load failed at ${url.href}`, error || '');
        tryLoad(index + 1);
      });
    };

    tryLoad(0);
  }

  handleEarthTextureFailure(textureState, message) {
    textureState.loading = false;
    textureState.loadedRealMap = false;
    textureState.texture = null;
    this.bodyMaterial.map = null;
    this.bodyMaterial.color.set(this.settings.visuals.body.color || '#286c9b');
    this.bodyMaterial.needsUpdate = true;
    this.updateEarthTextureUniforms();
    console.error(`[ORBITAL LAB] Earth surface albedo unavailable. ${message}`);
    this.canvas.dispatchEvent(new CustomEvent('earth-texture-fallback', { detail: { url: textureState.sourceUrl, message } }));
  }

  refreshBodyTexture() {
    const state = this.getTextureState('earth');
    const hasMap = !!(state.loadedRealMap && state.texture);
    const nextMap = hasMap ? state.texture : null;
    if (this.bodyMaterial.map !== nextMap) {
      this.bodyMaterial.map = nextMap;
      this.bodyMaterial.needsUpdate = true;
    }
    this.bodyMaterial.color.set(hasMap ? '#ffffff' : (this.settings.visuals.body.color || '#286c9b'));
    this.updateEarthTextureUniforms();
  }

  updateOrbitGeometry(elements) {
    const body = P.bodies[this.bodyKey];
    const metrics = P.orbitalMetrics(elements, this.bodyKey);
    const a = metrics.isElliptic
      ? metrics.a / body.radius
      : Math.min(this.visibleOrbitRadius(elements), metrics.p * 1.7) / body.radius;
    const b = metrics.isElliptic ? a * Math.sqrt(Math.max(0, 1 - elements.e * elements.e)) : a;
    this.orbitPlane.scale.set(a, b, 1);
    this.orbitPlane.position.set(metrics.isElliptic ? -a * elements.e : 0, 0, 0);
    this.orbitPlane.visible = !!this.visual('orbitalPlane').visible;

    const p = elements.h * elements.h / body.mu;
    const dashScale = clamp(this.annotationScale(elements) * this.cameraScaleFactor(), .85, 8);
    this.orbitLine.material.dashSize = .16 * dashScale;
    this.orbitLine.material.gapSize = .11 * dashScale;
    const positions = this.orbitLine.geometry.attributes.position;
    const limit = this.conicDisplayLimit(elements);
    for (let index = 0; index <= this.orbitSamples; index++) {
      const theta = metrics.isElliptic
        ? index / this.orbitSamples * Math.PI * 2
        : -limit + index / this.orbitSamples * limit * 2;
      const denominator = 1 + elements.e * Math.cos(theta);
      const radius = denominator > 1e-8 ? p / denominator / body.radius : 0;
      positions.setXYZ(index, radius * Math.cos(theta), radius * Math.sin(theta), 0);
    }
    positions.needsUpdate = true;
    this.orbitLine.geometry.computeBoundingSphere();
    this.orbitLine.computeLineDistances();

    const perigeeRadius = metrics.rp / body.radius;
    const markerScale = clamp(this.annotationScale(elements) * this.cameraScaleFactor(), .85, 8);
    this.perigeeMarker.position.set(perigeeRadius + .015 + .035 * markerScale, 0, 0);
    this.perigeeMarker.scale.setScalar(markerScale);
    const perigeeAttribute = this.perigeeLine.geometry.attributes.position;
    perigeeAttribute.setXYZ(0, EARTH_SURFACE_CLEARANCE, 0, 0);
    perigeeAttribute.setXYZ(1, perigeeRadius, 0, 0);
    perigeeAttribute.needsUpdate = true;
    this.perigeeLine.geometry.computeBoundingSphere();
    this.updateOrbitalFrame(elements);
    this.updateSunPlacement();
  }

  updateOrbitalFrame(elements) {
    const matrix = P.rotationMatrix(elements.raan, elements.i, elements.argp);
    const pAxis = eciToThree([matrix[0][0], matrix[1][0], matrix[2][0]]);
    const qAxis = eciToThree([matrix[0][1], matrix[1][1], matrix[2][1]]);
    const wAxis = eciToThree([matrix[0][2], matrix[1][2], matrix[2][2]]);
    const basis = new THREE.Matrix4().makeBasis(pAxis, qAxis, wAxis);
    this.orbitalFrame.quaternion.setFromRotationMatrix(basis);
  }


  updateNodeLine(elements) {
    const omega = THREE.MathUtils.degToRad(elements.raan);
    const direction = eciToThree([Math.cos(omega), Math.sin(omega), 0]).normalize();
    const scale = clamp(this.annotationScale(elements) * this.cameraScaleFactor(), .85, 8);
    this.nodeLine.material.dashSize = .10 * scale;
    this.nodeLine.material.gapSize = .065 * scale;
    const extent = clamp((elements.h * elements.h / P.bodies[this.bodyKey].mu) / P.bodies[this.bodyKey].radius * .95, 1.8, 8.5);
    const inner = EARTH_SURFACE_CLEARANCE;
    const points = [direction.clone().multiplyScalar(-extent), direction.clone().multiplyScalar(-inner), direction.clone().multiplyScalar(inner), direction.clone().multiplyScalar(extent)];
    const attribute = this.nodeLine.geometry.attributes.position;
    points.forEach((point, index) => attribute.setXYZ(index, point.x, point.y, point.z));
    attribute.needsUpdate = true;
    this.nodeLine.geometry.computeBoundingSphere();
    this.nodeLine.computeLineDistances();
    this.nodeLine.visible = this.visual('nodeLine').visible;
  }

  updateArrows(elements) {
    const state = P.state(elements, this.bodyKey, elements.theta);
    const radius = P.bodies[this.bodyKey].radius;
    const scale = clamp(this.annotationScale(elements) * this.cameraScaleFactor(), .85, 7.5);
    const position = eciToThree(state.r.map((value) => value / radius));
    const radialDirection = position.clone().normalize();
    const velocityDirection = eciToThree(state.v).normalize();
    const angularMomentumDirection = eciToThree(state.hVec).normalize();
    const matrix = P.rotationMatrix(elements.raan, elements.i, elements.argp);
    const eccentricityDirection = eciToThree([matrix[0][0], matrix[1][0], matrix[2][0]]).normalize();
    const vectorText = (values, unit) => values.map((value) => `${value.toExponential(2)} ${unit}`).join(', ');
    const rTip = `r · position from Earth centre to satellite · ECI components: ${vectorText(state.r, 'm')}`;
    const vTip = `v · instantaneous direction of motion, tangent to the trajectory · ECI components: ${vectorText(state.v, 'm/s')}`;
    const hTip = `h = r × v · normal to the orbital plane · ECI components: ${vectorText(state.hVec, 'm²/s')}`;
    const eTip = `e · eccentricity direction points toward perigee · ECI · e = ${elements.e.toFixed(3)}`;
    for (const [arrow, tip] of [[this.rArrow, rTip], [this.vArrow, vTip], [this.hArrow, hTip], [this.eArrow, eTip]]) {
      arrow.line.userData.tooltip = tip;
      arrow.cone.userData.tooltip = tip;
    }

    // Keep every visible vector segment outside the solid Earth. The r-vector is clipped
    // to the visible surface; v is shortened if its tangent direction would enter the globe.
    const rStart = radialDirection.clone().multiplyScalar(EARTH_SURFACE_CLEARANCE);
    const rLength = Math.max(.001, position.length() - EARTH_SURFACE_CLEARANCE);
    const vOrigin = position.clone().add(radialDirection.clone().multiplyScalar(.14));
    const vLength = clipRayLengthOutsideSphere(vOrigin, velocityDirection, .78 * scale);
    // Specific angular momentum is a geocentric vector: its mathematical origin is Earth's centre.
    // The globe depth buffer naturally occludes the portion of the vector inside the solid Earth.
    const hOrigin = new THREE.Vector3(0, 0, 0);
    const hLength = Math.max(1.58, 1.3 * scale);
    const hHead = Math.max(.18, .17 * scale);
    const eOrigin = eccentricityDirection.clone().multiplyScalar(EARTH_SURFACE_CLEARANCE);
    const eLength = Math.min(2.8, Math.max(.08, elements.e * 1.55)) * scale;

    this.setArrow(this.rArrow, rStart, radialDirection, rLength, .18 * scale);
    this.setArrow(this.vArrow, vOrigin, velocityDirection, vLength, .15 * scale);
    this.setArrow(this.hArrow, hOrigin, angularMomentumDirection, hLength, hHead);
    this.setArrow(this.eArrow, eOrigin, eccentricityDirection, eLength, .14 * scale);
    this.rArrow.visible = this.visual('rVector').visible && rLength > .015;
    this.vArrow.visible = this.visual('vVector').visible && vLength > .015;
    this.hArrow.visible = this.visual('hVector').visible;
    this.eArrow.visible = this.visual('eVector').visible && elements.e > 1e-5;

    const vLabel = keepPointOutsideSphere(vOrigin.clone().add(velocityDirection.clone().multiplyScalar(vLength + .16 * scale)), 1.42);
    const labelPositions = {
      rVector: position.clone().add(radialDirection.clone().multiplyScalar(.48 * scale)),
      vVector: vLabel,
      hVector: angularMomentumDirection.clone().multiplyScalar(hLength + .22 * scale),
      eVector: eccentricityDirection.clone().multiplyScalar(1.40 + Math.max(.22, elements.e * 1.7) * scale)
    };
    for (const [key, label] of Object.entries(this.vectorLabels)) {
      const config = this.visual(key);
      label.position.copy(labelPositions[key]);
      label.visible = !!config.visible && config.legend !== false && (key !== 'eVector' || elements.e > 1e-5);
      updateTextSprite(label, key === 'rVector' ? 'r' : key === 'vVector' ? 'v' : key === 'hVector' ? 'h' : 'e', config.color);
    }
    this.satelliteGroup.position.copy(position);
    const requestedSatelliteScale = .45 * clamp(scale, .72, 6);
    const safeSatelliteScale = Math.max(.06, (position.length() - 1.04) * 1.7);
    this.satelliteGroup.scale.setScalar(Math.min(requestedSatelliteScale, safeSatelliteScale));
    const xAxis = velocityDirection;
    const zAxis = angularMomentumDirection;
    const yAxis = zAxis.clone().cross(xAxis).normalize();
    const orientation = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    this.satelliteGroup.quaternion.setFromRotationMatrix(orientation);
    this.glowSprite.position.copy(position);
  }

  setArrow(arrow, origin, direction, length, head) {
    arrow.position.copy(origin);
    arrow.setDirection(direction.clone().normalize());
    const headLength = Math.min(head, length * .38);
    arrow.setLength(Math.max(.001, length), headLength, Math.min(.28, Math.max(.025, headLength * .55)));
  }

  updateTrail(elements, running, now = performance.now()) {
    
    let position;
    try {
      const state = P.state(elements, this.bodyKey, elements.theta);
      position = eciToThree(state.r.map((value) => value / P.bodies[this.bodyKey].radius));
    } catch { return; }
    const changed = !this.lastTrailPosition || this.lastTrailPosition.distanceToSquared(position) > 0.000006;
    if (changed) {
      this.trailPoints.push(position.clone());
      if (this.trailPoints.length > 150) this.trailPoints.shift();
      this.lastTrailPosition = position.clone();
      this.trailLastMovementTime = now;
      this.trailAlpha = 1;
      if (this.trailPoints.length > 1) {
        const curve = new THREE.CatmullRomCurve3(this.trailPoints, false, 'centripetal');
        const tubeRadius = Math.max(0.008, Math.min(0.024, position.length() * 0.009));
        const segments = Math.max(32, this.trailPoints.length * 2);
        const outerGeometry = makeTaperedTubeGeometry(curve, segments, tubeRadius * 3.4, 8, .035);
        const innerGeometry = makeTaperedTubeGeometry(curve, segments, tubeRadius, 8, .025);
        this.trailOuter.geometry.dispose(); this.trailInner.geometry.dispose();
        this.trailOuter.geometry = outerGeometry; this.trailInner.geometry = innerGeometry;
      }
    } else if (!running && this.trailPoints.length > 1) {
      this.trailAlpha = Math.exp(-Math.max(0, now - this.trailLastMovementTime - 220) / 620);
      if (this.trailAlpha < 0.012) this.resetTrail();
    } else if (running && this.trailPoints.length > 1) {
      this.trailAlpha = 1;
    }
    const visible = this.visual('trail').visible && this.trailPoints.length > 1 && this.trailAlpha > 0.012;
    this.trailOuter.visible = visible; this.trailInner.visible = visible;
    const config = this.visual('trail');
    this.trailInnerMaterial.opacity = config.opacity * 0.92 * this.trailAlpha;
    this.trailOuterMaterial.opacity = config.opacity * 0.28 * this.trailAlpha;
  }

  resetTrail() {
    this.trailPoints = [];
    this.trailAlpha = 0;
    this.trailOuter.geometry.dispose();
    this.trailInner.geometry.dispose();
    this.trailOuter.geometry = new THREE.BufferGeometry();
    this.trailInner.geometry = new THREE.BufferGeometry();
    this.trailOuter.visible = false;
    this.trailInner.visible = false;
  }

  visual(key) {
    return this.settings.visuals[key] || defaultVisuals[key] || { visible: true, opacity: 1, color: '#ffffff' };
  }

  conicDisplayLimit(elements) {
    if (elements.e > 1 + 1e-8) return Math.min(THREE.MathUtils.degToRad(120), Math.acos(-1 / elements.e) * .82);
    if (Math.abs(elements.e - 1) <= 1e-8) return THREE.MathUtils.degToRad(120);
    return Math.PI;
  }

  visibleOrbitRadius(elements) {
    const body = P.bodies[this.bodyKey];
    const p = elements.h * elements.h / body.mu;
    if (elements.e < 1 - 1e-8) return p / (1 - elements.e);
    const limit = this.conicDisplayLimit(elements);
    return p / Math.max(.05, 1 + elements.e * Math.cos(limit));
  }

  cameraFitDistance(elements) {
    const body = P.bodies[this.bodyKey];
    const visibleRadius = this.visibleOrbitRadius(elements) / body.radius;
    return Math.max(5.5, visibleRadius * 1.42 + 3.15);
  }

  annotationScale(elements = this.elements) {
    const body = P.bodies[this.bodyKey];
    const pRatio = (elements.h * elements.h / body.mu) / body.radius;
    return clamp(pRatio / 2.2, .8, 2.6);
  }

  applyVisuals() {
    for (const [key, object] of [
      ['orbit', this.orbitLine], ['orbitalPlane', this.orbitPlane], ['equatorialPlane', this.equatorialGroup],
      ['eclipticPlane', this.eclipticGroup], ['nodeLine', this.nodeLine], ['axes', this.axesGroup],
      ['sunDirection', this.sunDirectionLine]
    ]) {
      const config = this.visual(key);
      object.visible = !!config.visible;
      setObjectMaterial(object, config.color, config.opacity);
    }
    const axisConfig = this.visual('axes');
    const axisColors = ['#d8797d', '#72c99a', '#77a8ed'];
    (this.axisLabels || []).forEach((label, index) => {
      label.visible = !!axisConfig.visible && axisConfig.legend !== false;
      label.material.color.set('#ffffff');
      updateTextSprite(label, ['X', 'Y', 'Z'][index], axisColors[index]);
    });

    const satelliteConfig = this.visual('satellite');
    this.satelliteGroup.visible = !!satelliteConfig.visible;
    this.satelliteBodyMaterial.color.set(satelliteConfig.color);
    this.satelliteGroup.traverse((child) => {
      const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      for (const material of materials) {
        if ('opacity' in material) {
          material.opacity = satelliteConfig.opacity;
          material.transparent = satelliteConfig.opacity < 0.999;
        }
        material.needsUpdate = true;
      }
    });

    const trailConfig = this.visual('trail');
    this.trailInner.visible = !!trailConfig.visible && this.trailPoints.length > 1;
    this.trailOuter.visible = !!trailConfig.visible && this.trailPoints.length > 1;
    this.trailInnerMaterial.color.set(trailConfig.color);
    this.trailOuterMaterial.color.set(trailConfig.color);
    this.trailInnerMaterial.opacity = trailConfig.opacity * 0.9;
    this.trailOuterMaterial.opacity = trailConfig.opacity * 0.22;

    for (const [key, arrow] of [['rVector', this.rArrow], ['vVector', this.vArrow], ['hVector', this.hArrow], ['eVector', this.eArrow]]) {
      const config = this.visual(key);
      arrow.visible = !!config.visible;
      arrow.line.material.color.set(config.color);
      arrow.cone.material.color.set(config.color);
      arrow.line.material.opacity = config.opacity;
      arrow.cone.material.opacity = config.opacity;
    }
    for (const [key, label] of Object.entries(this.vectorLabels || {})) {
      const config = this.visual(key);
      label.visible = !!config.visible && config.legend !== false && (key !== 'eVector' || this.elements.e > 1e-5);
      updateTextSprite(label, key === 'rVector' ? 'r' : key === 'vVector' ? 'v' : key === 'hVector' ? 'h' : 'e', config.color);
    }

    const atmosphere = this.visual('atmosphere');
    this.atmosphereMesh.visible = this.settings.showAtmosphere && atmosphere.visible;
    this.atmosphereMesh.material.uniforms.glowColor.value.set(atmosphere.color);
    this.atmosphereMesh.material.uniforms.glowOpacity.value = this.settings.atmosphereOpacity * atmosphere.opacity;
    const hasEarthAlbedo = !!(this.textureCache.get('earth')?.loadedRealMap && this.bodyMaterial.map);
    this.bodyMaterial.color.set(hasEarthAlbedo ? '#ffffff' : (this.settings.visuals.body.color || '#286c9b'));
    this.updateEarthTextureUniforms();
    this.bodyMaterial.opacity = this.settings.planetOpacity;
    this.bodyMaterial.transparent = this.settings.planetOpacity < 0.999;
    this.bodyMaterial.depthWrite = this.settings.planetOpacity > 0.98;
    this.equatorialGroup.scale.setScalar(this.settings.equatorialScale || 1.2);

    this.sunCore.material.color.set('#fff0ad');
    this.sunGroup.visible = true;
    this.sunDirectionLine.visible = !!this.visual('sunDirection').visible;
    this.earthSolarOrbitLine.visible = false;
    this.updateAngleAnnotations(this.elements);
  }

  setSettings(settings, refreshTexture = false) {
    this.settings = settings;
    if (refreshTexture) this.refreshBodyTexture();
    this.applyVisuals();
  }

  setBody(key) {
    this.bodyKey = 'earth';
    this.trailPoints = [];
    this.lastTrailPosition = null;
    this.lastTheta = null;
    this.elements = P.defaultElements(this.bodyKey);
    this.timeSec = P.timeSincePerigee(this.elements.theta, this.elements, this.bodyKey);
    this.refreshBodyTexture();
    const body = P.bodies[this.bodyKey];
    this.atmosphereMesh.material.uniforms.glowColor.value.set('#5aa8f5');
    this.eclipticGroup.rotation.x = THREE.MathUtils.degToRad(body.obliquity);
    this.updateOrbitGeometry(this.elements);
    this.updateNodeLine(this.elements);
    this.updateArrows(this.elements);
    this.applyVisuals();
  }

getSimulationDate(timeSec = this.timeSec) {
  return new Date(this.solarEpochDate.getTime() + (Number(timeSec) || 0) * 1000);
}

setSimulationDate(date) {
  const selectedDate = date instanceof Date
    ? new Date(date.getTime())
    : new Date(date);

  if (Number.isNaN(selectedDate.getTime())) return;

  const timeSec = Number(this.timeSec) || 0;
  const selectedMeanAnomaly = Solar.meanAnomalyAtDate(selectedDate);

  const epochMeanAnomaly = Solar.mod(
    selectedMeanAnomaly
      - (2 * Math.PI * timeSec) / (Solar.yearDays * 86400),
    2 * Math.PI
  );

  this.solarEpochDate = new Date(selectedDate.getTime() - timeSec * 1000);
  this.solarMeanAnomaly = epochMeanAnomaly;
  this.solarEpochMeanAnomaly = epochMeanAnomaly;

  this.earthRotationAngle = greenwichSiderealAngle(selectedDate);
  this.bodyGroup.rotation.y = this.earthRotationAngle;

  const solarState = Solar.stateAtMeanAnomaly(selectedMeanAnomaly);

  this.sunDirection
    .copy(eciToThree(solarState.sunDirectionECI))
    .normalize();

  this.sunDistance = solarState.distanceAU * Solar.AU / P.bodies.earth.radius;

  this.updateSunPlacement();
  this.updateSolarOrbitPaths(selectedMeanAnomaly);
}

  setState(elements, timeSec, running, speed, pulseStart) {
    this.elements = elements;
    this.timeSec = timeSec;
    this.running = running;
    this.speed = speed;
    if (pulseStart && pulseStart !== this.lastPulseStart) {
      this.lastPulseStart = pulseStart;
      this.pulseStart = pulseStart;
    }
  }

  cameraMinDistance() {
    const halfVerticalFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * Math.max(0.1, this.camera.aspect || 1));
    const limitingHalfFov = Math.min(halfVerticalFov, halfHorizontalFov);
    return 1.095 / Math.sin(limitingHalfFov);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = this.cameraMinDistance();
    const currentDistance = this.camera.position.distanceTo(this.controls.target);
    if (currentDistance < this.controls.minDistance) {
      const direction = this.camera.position.clone().sub(this.controls.target).normalize();
      this.camera.position.copy(this.controls.target).addScaledVector(direction, this.controls.minDistance);
      this.camera.lookAt(this.controls.target);
    }
    this.renderer.setSize(width, height, false);
  }

  flushControlDamping() {
    if (!this.controls?.enabled) return;
    const wasDamping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = wasDamping;
  }

  bindCameraReset() {
    this.canvas.addEventListener('dblclick', () => {
      this.flushControlDamping();
      this.viewMode = 'earth';
      this.earthSystemGroup.position.set(0, 0, 0);
      this.cameraTransition = null;
      this.controls.enabled = true;
      this.controls.enableDamping = this.cameraDampingEnabled;
      const homePosition = new THREE.Vector3(4.8, 3.5, 7.0);
      const homeTarget = this.framedTarget('earth', homePosition.length());
      this.controls.target.copy(homeTarget);
      this.camera.position.copy(homePosition).add(homeTarget);
      this.lastFittedCameraDistance = 0;
      this.camera.up.set(0, 1, 0);
      this.controls.minDistance = this.cameraMinDistance();
      this.controls.enableRotate = true;
      this.controls.enableZoom = true;
      this.applyVisuals();
      this.controls.update();
      this.canvas.dispatchEvent(new CustomEvent('orbital-camera-home'));
    });
  }

  cameraScaleFactor() {
    const distance = this.camera.position.distanceTo(this.controls.target);
    return clamp(distance / 8, .72, 7.5);
  }

  cameraFrameOffset(distance) {
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const visibleHeight = 2 * Math.max(0.001, distance) * Math.tan(halfFov);
    return Math.max(0.18, visibleHeight * 0.075);
  }

  framedTarget(mode, distance, elements = this.elements) {
    let up = new THREE.Vector3(0, 1, 0);
    if (mode === '2d') {
      const { pAxis, qAxis } = this.orbitalCameraBasis(elements);
      up = pAxis.add(qAxis).normalize();
    }
    return up.multiplyScalar(this.cameraFrameOffset(distance));
  }

  orbitalCameraBasis(elements = this.elements) {
    const matrix = P.rotationMatrix(elements.raan, elements.i, elements.argp);
    const pAxis = eciToThree([matrix[0][0], matrix[1][0], matrix[2][0]]).normalize();
    const qAxis = eciToThree([matrix[0][1], matrix[1][1], matrix[2][1]]).normalize();
    const normal = eciToThree([matrix[0][2], matrix[1][2], matrix[2][2]]).normalize();
    return { pAxis, qAxis, normal };
  }

  update2DCameraFrame() {
    if (this.viewMode !== '2d' || this.cameraTransition?.isViewTransition) return;
    const { pAxis, qAxis, normal } = this.orbitalCameraBasis(this.elements);
    const distance = Math.max(this.cameraMinDistance(), this.camera.position.distanceTo(this.controls.target));
    const up = pAxis.add(qAxis).normalize();
    const target = up.clone().multiplyScalar(this.cameraFrameOffset(distance));
    this.controls.target.copy(target);
    this.camera.up.copy(up);
    this.camera.position.copy(target).addScaledVector(normal, distance);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }

  updateLegendScale() {
    const distanceScale = this.cameraScaleFactor();
    const orbitScale = this.annotationScale(this.elements);
    const scale = clamp(distanceScale * orbitScale, .75, 8);
    for (const label of Object.values(this.vectorLabels || {})) {
      label.scale.set(scale, scale * .36, 1);
    }
    const axisScale = clamp(orbitScale * distanceScale, .85, 7.5);
    const axisLength = 1.65 * axisScale;
    const axisDirections = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)];
    this.axisArrows?.forEach((arrow, index) => {
      arrow.position.copy(axisDirections[index].clone().multiplyScalar(EARTH_SURFACE_CLEARANCE));
      const head = .13 * axisScale;
      arrow.setLength(axisLength, head, Math.min(.8, head * .55));
    });
    const axisLabelDistance = 1.95 * axisScale;
    const axisLabelPositions = [
      new THREE.Vector3(axisLabelDistance, 0, 0),
      new THREE.Vector3(0, 0, -axisLabelDistance),
      new THREE.Vector3(0, axisLabelDistance, 0)
    ];
    this.axisLabels?.forEach((label, index) => {
      label.scale.set(scale * .78, scale * .30, 1);
      label.position.copy(axisLabelPositions[index]);
    });
    for (const annotation of Object.values(this.angleAnnotations || {})) {
      annotation.sprite.scale.set(1.05 * distanceScale, .33 * distanceScale, 1);
    }
  }

  render(now = performance.now()) {
    const body = P.bodies[this.bodyKey];
    const metrics = P.orbitalMetrics(this.elements, this.bodyKey);
    const cameraDistance = Math.max(this.cameraFitDistance(this.elements), this.cameraMinDistance());
    {
      this.controls.maxDistance = Math.max(100000, cameraDistance * 3.2);
      if (!this.userInteracting && !this.cameraTransition && Math.abs(cameraDistance - this.lastFittedCameraDistance) > Math.max(.35, this.lastFittedCameraDistance * .08)) {
        this.flushControlDamping();
        const direction = this.camera.position.clone().sub(this.controls.target).normalize();
        const targetDistance = cameraDistance;
        this.cameraTransition = {
          start: now, duration: 480,
          restoreDamping: this.cameraDampingEnabled,
          fromPosition: this.camera.position.clone(), fromTarget: this.controls.target.clone(),
          fromUp: this.camera.up.clone(), toUp: this.camera.up.clone(),
          toPosition: this.controls.target.clone().add(direction.multiplyScalar(targetDistance)),
          toTarget: this.controls.target.clone(),
          isViewTransition: false
        };
        this.controls.enabled = false;
        this.controls.enableDamping = false;
        this.lastFittedCameraDistance = targetDistance;
      }
    }

    if (this.cameraTransition) {
      const transition = this.cameraTransition;
      if (transition.isViewTransition && this.viewMode === '2d') {
        const { pAxis, qAxis, normal } = this.orbitalCameraBasis(this.elements);
        const targetDistance = Math.max(this.cameraMinDistance(), transition.toPosition.distanceTo(transition.toTarget));
        const up = pAxis.add(qAxis).normalize();
        transition.toTarget.copy(up).multiplyScalar(this.cameraFrameOffset(targetDistance));
        transition.toPosition.copy(transition.toTarget).addScaledVector(normal, targetDistance);
        transition.toUp.copy(up);
      }
      const raw = clamp((now - transition.start) / transition.duration, 0, 1);
      const eased = raw * raw * (3 - 2 * raw);
      const fromOffset = transition.fromPosition.clone().sub(transition.fromTarget);
      const toOffset = transition.toPosition.clone().sub(transition.toTarget);
      const fromDistance = Math.max(.001, fromOffset.length());
      const toDistance = Math.max(.001, toOffset.length());
      const fromDirection = fromOffset.normalize();
      const toDirection = toOffset.normalize();
      const directionRotation = new THREE.Quaternion().setFromUnitVectors(fromDirection, toDirection);
      const directionStep = new THREE.Quaternion().identity().slerp(directionRotation, eased);
      const direction = fromDirection.clone().applyQuaternion(directionStep).normalize();
      this.controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
      const distance = THREE.MathUtils.lerp(fromDistance, toDistance, eased);
      this.camera.position.copy(this.controls.target).addScaledVector(direction, distance);

      if (transition.fromUp && transition.toUp) {
        const upRotation = new THREE.Quaternion().setFromUnitVectors(transition.fromUp, transition.toUp);
        const upStep = new THREE.Quaternion().identity().slerp(upRotation, eased);
        this.camera.up.copy(transition.fromUp.clone().applyQuaternion(upStep).normalize());
      }
      this.camera.lookAt(this.controls.target);
      if (raw >= 1) {
        if (transition.toUp) this.camera.up.copy(transition.toUp).normalize();
        this.cameraTransition = null;
        this.controls.enabled = true;
        this.controls.enableDamping = transition.restoreDamping ?? this.cameraDampingEnabled;
      }
    }

    this.updateOrbitGeometry(this.elements);
    this.updateNodeLine(this.elements);
    this.updateArrows(this.elements);
    this.updateTrail(this.elements, this.running, now);
    this.updateAngleAnnotations(this.elements);

    const deltaSeconds = this.lastRenderTimestamp === null ? 0 : Math.min((now - this.lastRenderTimestamp) / 1000, 0.1);
    this.lastRenderTimestamp = now;
    const earthSpinMultiplier = this.running ? Math.max(0, this.speed || 0) : 0;
    this.earthRotationAngle = (this.earthRotationAngle + deltaSeconds * earthSpinMultiplier * (2 * Math.PI / body.rotation)) % (2 * Math.PI);
    this.bodyGroup.rotation.y = this.earthRotationAngle;

    const simulatedSolarMean = Solar.mod(this.solarEpochMeanAnomaly + (2 * Math.PI * (this.timeSec || 0)) / (Solar.yearDays * 86400), 2 * Math.PI);
    const simulatedSolarState = Solar.stateAtMeanAnomaly(simulatedSolarMean);
    this.sunDirection.copy(eciToThree(simulatedSolarState.sunDirectionECI)).normalize();
    this.updateSunPlacement();
    this.sunCore.material.opacity = .98;
    this.sunGlow.material.opacity = .82;
    this.sunLabel.visible = false;
    this.sunDistance = simulatedSolarState.distanceAU * Solar.AU / body.radius;
    this.updateSunPlacement();
    this.updateSolarOrbitPaths(simulatedSolarMean);
    this.updateLegendScale();
    const pulseAge = Math.max(0, now - this.pulseStart);
    const pulse = this.settings.glowOnChange ? Math.exp(-pulseAge / 430) : 0;
    this.glowSprite.material.opacity = this.settings.glowOnChange ? clamp(0.08 + pulse * 0.72, 0, 0.9) : 0;
    const requestedGlowScale = (0.58 + pulse * 0.48) * clamp(this.annotationScale(this.elements) * this.cameraScaleFactor(), .85, 6);
    const safeGlowScale = Math.max(.07, (this.satelliteGroup.scale.x || .1) * 2.2);
    const glowScale = Math.min(requestedGlowScale, safeGlowScale);
    this.glowSprite.scale.set(glowScale, glowScale, glowScale);

    this.controls.update();
    this.update2DCameraFrame();
    this.updateEarthNightLightUniforms();
    this.updateSolarOrbitVisibility();
    this.renderer.render(this.scene, this.camera);
  }

  updateSunPlacement() {
    this.sunGroup.position.copy(this.sunDirection.clone().multiplyScalar(this.sunDistance));
    this.keyLight.position.copy(this.sunGroup.position);
    this.keyLight.target = this.earthSystemGroup;

    const sunPosition = this.sunGroup.position;
    const positions = this.sunDirectionLine.geometry.attributes.position;
    const sunLineStart = this.sunDirection.clone().multiplyScalar(EARTH_SURFACE_CLEARANCE);
    positions.setXYZ(0, sunLineStart.x, sunLineStart.y, sunLineStart.z);
    positions.setXYZ(1, sunPosition.x, sunPosition.y, sunPosition.z);
    positions.needsUpdate = true;
    const dashScale = clamp(this.sunDistance * .014, .35, 420);
    this.sunDirectionLine.material.dashSize = dashScale;
    this.sunDirectionLine.material.gapSize = dashScale * .62;
    this.sunDirectionLine.geometry.computeBoundingSphere();
    this.sunDirectionLine.computeLineDistances();
  }

  updateSolarOrbitPaths(meanAnomaly) {
    if (!this.earthSolarOrbitLine) return;
    const samples = 360;
    const earthRadius = P.bodies[this.bodyKey].radius;
    if (!this.solarOrbitBase) {
      this.solarOrbitBase = [];
      for (let index = 0; index <= samples; index++) {
        const sample = Solar.stateAtMeanAnomaly(index / samples * Math.PI * 2);
        this.solarOrbitBase.push(sample.earthECI);
      }
    }

    const currentState = Solar.stateAtMeanAnomaly(meanAnomaly);
    const currentEarth = currentState.earthECI;
    const earthAttribute = this.earthSolarOrbitLine.geometry.attributes.position;
    for (let index = 0; index <= samples; index++) {
      const sampleEarth = this.solarOrbitBase[index];
      const relativeEarth = [
        (sampleEarth[0] - currentEarth[0]) / earthRadius,
        (sampleEarth[1] - currentEarth[1]) / earthRadius,
        (sampleEarth[2] - currentEarth[2]) / earthRadius
      ];
      const point = eciToThree(relativeEarth);
      earthAttribute.setXYZ(index, point.x, point.y, point.z);
    }

    earthAttribute.needsUpdate = true;
    this.earthSolarOrbitLine.geometry.computeBoundingSphere();
    this.earthSolarOrbitLine.computeLineDistances();
  }

  updateSolarOrbitVisibility() {
    const cameraDistance = this.camera.position.distanceTo(this.controls.target);
    const zoomedOut = cameraDistance > this.sunDistance * .32;
    this.camera.updateMatrixWorld();
    const viewProjection = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(viewProjection);
    const sunInFrame = frustum.containsPoint(this.sunGroup.position);
    this.earthSolarOrbitLine.visible = !!this.settings.showEarthSolarOrbit && zoomedOut && sunInFrame;
  }

  setViewMode(mode) {
    const nextMode = mode === '2d' ? '2d' : 'earth';
    if (nextMode === this.viewMode) return this.viewMode;
    this.flushControlDamping();

    const fromPosition = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const fromUp = this.camera.up.clone().normalize();
    if (this.viewMode === 'earth' && nextMode === '2d') {
      this.savedEarthCamera = { position: fromPosition.clone(), target: fromTarget.clone(), up: fromUp.clone() };
    }

    this.viewMode = nextMode;
    this.earthSystemGroup.position.set(0, 0, 0);
    this.sunGroup.visible = true;
    this.bodyGroup.visible = true;
    this.orbitalFrame.visible = true;
    this.controls.enableZoom = true;
    this.controls.enablePan = false;

    const distance = Math.max(this.cameraFitDistance(this.elements), this.cameraMinDistance());
    const toTarget = this.framedTarget(nextMode, distance, this.elements);
    let toPosition;
    let toUp;

    if (nextMode === '2d') {
      const { pAxis, qAxis, normal } = this.orbitalCameraBasis(this.elements);
      // Keep the periapsis direction in the upper-right quadrant of the orbital-plane view.
      toUp = pAxis.clone().add(qAxis).normalize();
      toPosition = toTarget.clone().addScaledVector(normal, distance);
      this.controls.enableRotate = false;
    } else {
      toUp = new THREE.Vector3(0, 1, 0);
      this.controls.enableRotate = true;
      const savedDirection = this.savedEarthCamera?.position.clone().sub(this.savedEarthCamera.target).normalize();
      const direction = savedDirection || new THREE.Vector3(.46, .34, .82).normalize();
      toPosition = toTarget.clone().addScaledVector(direction, distance);
    }

    this.camera.far = Math.max(1000000, distance * 16);
    this.camera.near = .08;
    this.camera.updateProjectionMatrix();
    this.controls.maxDistance = Math.max(100000, distance * 3.2);
    this.controls.minDistance = this.cameraMinDistance();
    this.cameraTransition = {
      start: performance.now(),
      duration: 950,
      restoreDamping: this.cameraDampingEnabled,
      fromPosition,
      fromTarget,
      fromUp,
      toPosition,
      toTarget,
      toUp,
      isViewTransition: true
    };
    this.controls.enabled = false;
    this.controls.enableDamping = false;
    this.lastFittedCameraDistance = distance;
    this.updateSunPlacement();
    this.applyVisuals();
    return this.viewMode;
  }

  createAngleAnnotation(label, color) {
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false }));
    line.renderOrder = 8;
    line.userData.tooltip = `Orbital angle ${label} · 3D geometric annotation`;
    const sprite = makeTextSprite(label, color);
    sprite.renderOrder = 9;
    const group = new THREE.Group();
    group.add(line, sprite);
    this.earthSystemGroup.add(group);
    return { group, line, sprite, label, color };
  }

  updateAngleArc(annotation, startDirection, axisDirection, angleDegrees, radius, visible, label, labelRadiusFactor = 1.2) {
    annotation.group.visible = !!visible;
    const start = startDirection.clone().normalize();
    const axis = axisDirection.clone().normalize();
    const signature = [visible ? 1 : 0, angleDegrees.toFixed(5), radius.toFixed(5), label, start.x.toFixed(5), start.y.toFixed(5), start.z.toFixed(5), axis.x.toFixed(5), axis.y.toFixed(5), axis.z.toFixed(5)].join('|');
    if (annotation.signature === signature) return;
    annotation.signature = signature;
    if (!visible) return;
    const angle = THREE.MathUtils.degToRad(angleDegrees);
    if (Math.abs(angle) < 0.004 || axis.lengthSq() < 1e-8) {
      annotation.line.visible = false;
      annotation.sprite.visible = false;
      return;
    }
    const points = [];
    const steps = Math.max(18, Math.ceil(Math.abs(angleDegrees) / 4));
    const quaternion = new THREE.Quaternion();
    for (let index = 0; index <= steps; index++) {
      const t = index / steps;
      quaternion.setFromAxisAngle(axis, angle * t);
      points.push(start.clone().applyQuaternion(quaternion).multiplyScalar(radius));
    }
    annotation.line.geometry.dispose();
    annotation.line.geometry = new THREE.BufferGeometry().setFromPoints(points);
    const midQuaternion = new THREE.Quaternion().setFromAxisAngle(axis, angle * 0.5);
    const safeLabelRadiusFactor = Math.max(1.35, labelRadiusFactor);
    const mid = start.clone().applyQuaternion(midQuaternion).multiplyScalar(radius * safeLabelRadiusFactor);
    annotation.sprite.position.copy(mid);
    updateTextSprite(annotation.sprite, label, annotation.color);
    annotation.line.visible = true;
    annotation.sprite.visible = true;
  }

  updateAngleAnnotations(elements) {
    if (!this.angleAnnotations || !this.settings?.angleAnnotations) return;

    const matrix = P.rotationMatrix(elements.raan, elements.i, elements.argp);
    const pAxis = eciToThree([matrix[0][0], matrix[1][0], matrix[2][0]]).normalize();
    const wAxis = eciToThree([matrix[0][2], matrix[1][2], matrix[2][2]]).normalize();
    const node = eciToThree([Math.cos(THREE.MathUtils.degToRad(elements.raan)), Math.sin(THREE.MathUtils.degToRad(elements.raan)), 0]).normalize();
    const eciX = eciToThree([1, 0, 0]).normalize();
    const eciZ = eciToThree([0, 0, 1]).normalize();
    const inclinationAxis = node.clone();
    const scale = this.annotationScale(elements);
    const zoomScale = this.cameraScaleFactor();
    const arcScale = clamp(scale * clamp(Math.sqrt(zoomScale), .85, 2.2), .85, 2.2);

    this.updateAngleArc(this.angleAnnotations.raan, eciX, eciZ, elements.raan, 1.48 * arcScale, this.settings.angleAnnotations.raan, 'Ω');
    this.updateAngleArc(this.angleAnnotations.inclination, eciZ, inclinationAxis, elements.i, 1.38 * arcScale, this.settings.angleAnnotations.inclination && elements.i > 0.15 && elements.i < 179.85, 'i');
    this.updateAngleArc(this.angleAnnotations.argp, node, wAxis, elements.argp, 1.55 * arcScale, this.settings.angleAnnotations.argp && elements.e > 1e-4, 'ω');

    const periapsisRadius = P.orbitalMetrics(elements, this.bodyKey).rp / P.bodies[this.bodyKey].radius;
    const thetaRadius = Math.max(1.06, Math.min(periapsisRadius * .94, periapsisRadius - .035));
    const thetaVisible = this.settings.angleAnnotations.theta && periapsisRadius > 1.055;
    this.updateAngleArc(this.angleAnnotations.theta, pAxis, wAxis, elements.theta, thetaRadius, thetaVisible, 'θ', 1.04);
  }

  bindSceneTooltips() {
    const findTooltip = (object) => {
      let current = object;
      while (current) {
        if (current.userData?.tooltip) return current.userData.tooltip;
        current = current.parent;
      }
      return null;
    };
    this.canvas.addEventListener('pointermove', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(pointer, this.camera);
      const intersections = this.raycaster.intersectObjects(this.scene.children, true);
      const sunHit = intersections.find((item) => {
        let current = item.object;
        while (current) {
          if (current === this.sunGroup) return true;
          current = current.parent;
        }
        return false;
      });
      const hit = sunHit || intersections.find((item) => findTooltip(item.object));
      if (!hit) {
        this.sceneTooltip.hidden = true;
        this.hoveredObject = null;
        return;
      }
      const tooltip = findTooltip(hit.object);
      if (tooltip !== this.hoveredObject) {
        this.sceneTooltip.textContent = tooltip;
        this.hoveredObject = tooltip;
      }
      const hostRect = this.canvas.parentElement.getBoundingClientRect();
      const left = clamp(event.clientX - hostRect.left + 14, 12, hostRect.width - 260);
      const top = clamp(event.clientY - hostRect.top + 14, 12, hostRect.height - 72);
      this.sceneTooltip.style.left = `${left}px`;
      this.sceneTooltip.style.top = `${top}px`;
      this.sceneTooltip.hidden = false;
    });
    this.canvas.addEventListener('pointerleave', () => { this.sceneTooltip.hidden = true; this.hoveredObject = null; });
  }

  refreshTooltipState() {
    if (this.sceneTooltip) this.sceneTooltip.hidden = true;
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.bodyGeometry?.dispose();
    this.bodyMaterial?.dispose();
    for (const state of this.textureCache.values()) state.texture?.dispose();
    this.trailInner.geometry.dispose();
    this.trailOuter.geometry.dispose();
    for (const annotation of Object.values(this.angleAnnotations || {})) {
      annotation.line.geometry.dispose();
      annotation.sprite.material.map?.dispose();
      annotation.sprite.material.dispose();
    }
    this.sunLabel.material.map?.dispose();
    this.sunGlow.material.map?.dispose();
    this.sunCore.geometry.dispose();
    this.sunCore.material.dispose();
    this.sunDirectionLine?.geometry.dispose();
    this.sunDirectionLine?.material.dispose();
    this.earthSolarOrbitLine?.geometry.dispose();
    this.earthSolarOrbitLine?.material.dispose();
    for (const label of Object.values(this.vectorLabels || {})) { label.material.map?.dispose(); label.material.dispose(); }
    this.sceneTooltip?.remove();
  }
}
