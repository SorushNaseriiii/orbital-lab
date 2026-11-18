import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const rendererSource = await readFile(new URL('../src/scene/OrbitalRenderer.js', import.meta.url), 'utf8');
const assetSource = await readFile(new URL('../scripts/download-assets.mjs', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('solar date picker markup is unique, bounded, closable, and excludes the unwanted 86400x rate', () => {
  for (const id of ['solarDatePicker', 'solarDatePickerClose', 'solarDateSlider', 'solarTimeSlider']) {
    assert.equal((htmlSource.match(new RegExp(`\\bid="${id}"`, 'g')) || []).length, 1);
  }
  const dateSlider = htmlSource.match(/<input\b(?=[^>]*\bid="solarDateSlider")[^>]*>/)?.[0] || '';
  const timeSlider = htmlSource.match(/<input\b(?=[^>]*\bid="solarTimeSlider")[^>]*>/)?.[0] || '';
  assert.match(dateSlider, /min="0"/);
  assert.match(dateSlider, /max="364"/);
  assert.match(dateSlider, /step="1"/);
  assert.match(timeSlider, /min="0"/);
  assert.match(timeSlider, /max="1439"/);
  assert.match(timeSlider, /step="1"/);
  assert.match(htmlSource, /id="solarDatePickerClose"[\s\S]*?type="button"/);
  assert.doesNotMatch(htmlSource, /86400\s*x/i);
});

test('the existing camera selector cycles Earth, 2D and satellite-follow views', () => {
  assert.match(appSource, /\['earth', '2d', 'satellite'\]\.includes\(mode\)/);
  assert.match(appSource, /state\.viewMode === '2d' \? 'satellite' : 'earth'/);
  assert.match(rendererSource, /satelliteCameraPose\(elements = this\.elements\)/);
  assert.match(rendererSource, /updateSatelliteCameraFrame\(\)/);
  assert.match(rendererSource, /addScaledVector\(velocity, sideOffset\)/);
  assert.match(rendererSource, /this\.camera\.aspect < 1 \? \.25 : 0/);
  assert.match(rendererSource, /this\.camera\.lookAt\(pose\.target\)/);
  assert.match(rendererSource, /this\.controls\.enableZoom = true/);
  assert.match(rendererSource, /const zoomFactor = clamp\(currentDistance \/ previousBaseDistance, \.65, 3\.2\)/);
  assert.doesNotMatch(appSource, /solarAnimateToggle|sunModePanel|updateSolarReadouts/);
  assert.doesNotMatch(htmlSource, /sunModePanel|solarAnimateToggle/);
});

test('plot supports draggable dock and moving current-time marker', () => {
  assert.match(appSource, /function initPlotDragging\(\)/);
  assert.match(appSource, /currentX:/);
  assert.match(appSource, /Perigee/);
  assert.match(appSource, /Apogee/);
});

test('2D camera follows the current orbital-plane normal and keeps periapsis upper-right', () => {
  assert.match(rendererSource, /orbitalCameraBasis\(elements = this\.elements\)/);
  assert.match(rendererSource, /update2DCameraFrame\(\)/);
  assert.match(rendererSource, /addScaledVector\(normal, distance\)/);
  assert.match(rendererSource, /const up = pAxis\.add\(qAxis\)\.normalize\(\)/);
  assert.match(rendererSource, /this\.camera\.up\.copy\(up\)/);
  assert.match(rendererSource, /this\.update2DCameraFrame\(\);/);
});

test('orbital plane is hidden by default, including v1.0.2 settings migration', () => {
  assert.match(rendererSource, /orbitalPlane: \{[^}]*visible: false/);
  assert.match(appSource, /orbital-lab-settings-v105/);
  assert.match(appSource, /orbital-lab-settings-v104/);
  assert.match(appSource, /orbital-lab-settings-v103/);
  assert.match(appSource, /orbital-lab-settings-v102/);
  assert.match(appSource, /merged\.visuals\.orbitalPlane\.visible = false/);
});

test('non-Earth body objects and controls are absent from the application', () => {
  assert.doesNotMatch(rendererSource, /moon/i);
  assert.doesNotMatch(appSource, /moon/i);
  assert.doesNotMatch(htmlSource, /moon/i);
});

test('Sun glow is stronger, hover label is concise, and Sun direction reaches the Sun', () => {
  assert.match(rendererSource, /sunGroup\.userData\.tooltip = 'Sun'/);
  assert.match(rendererSource, /sunGlow\.material\.opacity = \.82/);
  assert.match(rendererSource, /positions\.setXYZ\(1, sunPosition\.x, sunPosition\.y, sunPosition\.z\)/);
});

test('circular and elliptical orbits both label true anomaly with theta', () => {
  assert.match(rendererSource, /thetaVisible, 'θ', 1\.04/);
  assert.doesNotMatch(rendererSource, /elements\.e < 1e-4 \? 'u'/);
});

test('satellite trail uses tapered geometry with a narrow old end', () => {
  assert.match(rendererSource, /function makeTaperedTubeGeometry/);
  assert.match(rendererSource, /Math\.pow\(t, 1\.28\)/);
  assert.match(rendererSource, /makeTaperedTubeGeometry\(curve, segments, tubeRadius/);
});

test('Earth map uses a validated equirectangular UV texture and GitHub Pages base path', () => {
  assert.match(rendererSource, /import\.meta\.env\.BASE_URL/);
  assert.match(rendererSource, /texture\.mapping = THREE\.UVMapping/);
  assert.match(rendererSource, /texture\.wrapS = THREE\.RepeatWrapping/);
  assert.match(rendererSource, /texture\.wrapT = THREE\.ClampToEdgeWrapping/);
  assert.match(rendererSource, /Math\.abs\(aspect - 2\) > 0\.12/);
  assert.match(rendererSource, /new THREE\.TextureLoader\(\)/);
  assert.match(rendererSource, /this\.bodyMaterial\.map = earthTexture/);
  assert.match(rendererSource, /this\.configureEarthTexture\(earthTexture\)/);
  assert.match(rendererSource, /this\.bodyGeometry\.getAttribute\('uv'\)/);
  assert.match(assetSource, /function isEquirectangularJpeg/);
  assert.match(assetSource, /localCandidates: \[path\.join\(root, 'earth-blue-marble\.jpg'\)/);
  assert.doesNotMatch(assetSource, /access\(failedMarker\)/);
  assert.match(assetSource, /Math\.abs\(width \/ height - 2\) <= 0\.12/);
  assert.match(htmlSource, /id="textureWarning"/);
  assert.match(appSource, /earth-texture-fallback/);
});

test('solar path remains opt-in and the mobile layout has no landscape lock', () => {
  assert.match(appSource, /showEarthSolarOrbit: false/);
  assert.match(htmlSource, /id="showEarthSolarOrbit"/);
  assert.doesNotMatch(htmlSource, /Rotate your device|optimized for landscape/i);
  assert.doesNotMatch(htmlSource, /Blue Marble texture/i);
  assert.doesNotMatch(appSource, /Blue Marble texture/i);
});


test('v1.0.5 roots h at Earth centre while depth testing hides its internal segment', () => {
  assert.match(rendererSource, /const hOrigin = new THREE\.Vector3\(0, 0, 0\)/);
  assert.match(rendererSource, /const hLength = Math\.max\(1\.58, 1\.3 \* scale\)/);
  assert.match(rendererSource, /this\.setArrow\(this\.hArrow, hOrigin, angularMomentumDirection, hLength, hHead\)/);
  assert.match(rendererSource, /arrow\.line\.material\.depthTest = true/);
  assert.match(rendererSource, /arrow\.cone\.material\.depthTest = true/);
});

test('v1.0.4 keeps visible vector annotations outside the solid Earth', () => {
  assert.match(rendererSource, /EARTH_SURFACE_CLEARANCE = 1\.035/);
  assert.match(rendererSource, /clipRayLengthOutsideSphere/);
  assert.match(rendererSource, /const vOrigin = position\.clone\(\)\.add\(radialDirection\.clone\(\)\.multiplyScalar\(\.14\)\)/);
  assert.match(rendererSource, /safeLabelRadiusFactor = Math\.max\(1\.35, labelRadiusFactor\)/);
  assert.match(rendererSource, /keepPointOutsideSphere/);
  assert.match(rendererSource, /safeGlowScale = Math\.max\(\.07, \(this\.satelliteGroup\.scale\.x \|\| \.1\) \* 2\.2\)/);
  assert.match(rendererSource, /new THREE\.LineSegments\(nodeGeometry/);
  assert.match(rendererSource, /arrow\.position\.copy\(axisDirections\[index\]\.clone\(\)\.multiplyScalar\(EARTH_SURFACE_CLEARANCE\)\)/);
  assert.match(rendererSource, /perigeeAttribute\.setXYZ\(0, EARTH_SURFACE_CLEARANCE/);
});

test('v1.0.5 scene framing shifts the rendered Earth down without moving the ECI origin', () => {
  assert.match(rendererSource, /cameraFrameOffset\(distance\)/);
  assert.match(rendererSource, /visibleHeight \* 0\.075/);
  assert.match(rendererSource, /framedTarget\(mode, distance/);
  assert.match(rendererSource, /const target = up\.clone\(\)\.multiplyScalar\(this\.cameraFrameOffset\(distance\)\)/);
  assert.match(rendererSource, /this\.earthSystemGroup\.position\.set\(0, 0, 0\)/);
  assert.match(rendererSource, /toPosition = toTarget\.clone\(\)\.addScaledVector\(normal, distance\)/);
  assert.match(rendererSource, /toPosition = toTarget\.clone\(\)\.addScaledVector\(direction, distance\)/);
});

test('v1.0.4 camera minimum keeps the full Earth atmosphere in frame', () => {
  assert.match(rendererSource, /cameraMinDistance\(\)/);
  assert.match(rendererSource, /return 1\.095 \/ Math\.sin\(limitingHalfFov\)/);
  assert.match(rendererSource, /this\.controls\.minDistance = this\.cameraMinDistance\(\)/);
});

test('v1.0.5 displays position magnitude beside position components', () => {
  assert.match(htmlSource, /id=\"positionMagnitudeValue\"/);
  assert.match(htmlSource, /POSITION MAGNITUDE/);
  assert.match(appSource, /orbitalState\.radius\.toFixed\(1\)/);
  assert.match(htmlSource, /SPEED MAGNITUDE/);
});

test('v1.0.5 maps the Earth albedo directly to the sphere UVs using the Three.js material pipeline', () => {
  assert.match(rendererSource, /this\.bodyMaterial\.map = earthTexture/);
  assert.match(rendererSource, /texture\.mapping = THREE\.UVMapping/);
  assert.match(rendererSource, /texture\.colorSpace = THREE\.SRGBColorSpace/);
  assert.match(rendererSource, /texture\.wrapS = THREE\.RepeatWrapping/);
  assert.match(rendererSource, /texture\.wrapT = THREE\.ClampToEdgeWrapping/);
  assert.match(rendererSource, /uTextureStrength/);
  assert.match(rendererSource, /customProgramCacheKey/);
  assert.doesNotMatch(rendererSource, /state\.ctx\.drawImage\(state\.source/);
});

test('v1.0.4 uses 10% Sun-direction opacity and dark native simulation options', () => {
  assert.match(rendererSource, /sunDirection: \{[^}]*opacity: \.10/);
  assert.match(appSource, /merged\.visuals\.sunDirection\.opacity = 0\.10/);
  assert.match(stylesSource, /speed-control select option[^{]*\{[^}]*background-color: #0d1727/s);
});


test('scene panel and WebGL canvas are clipped to the same rounded corners', () => {
  assert.match(stylesSource, /--scene-radius:\s*var\(--radius\)/);
  assert.match(stylesSource, /clip-path:\s*inset\(0 round var\(--scene-radius\)\)/);
  assert.match(stylesSource, /-webkit-clip-path:\s*inset\(0 round var\(--scene-radius\)\)/);
  assert.match(stylesSource, /\.scene-panel \{ --scene-radius: 13px;/);
});

test('date selection changes solar ephemeris without resetting Earth spin', () => {
  const setter = rendererSource.match(/setSimulationDate\(date\) \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(setter, /this\.solarEpochDate = new Date/);
  assert.match(setter, /this\.updateSunPlacement\(\)/);
  assert.doesNotMatch(setter, /earthRotationAngle|bodyGroup\.rotation/);
  assert.match(rendererSource, /const earthSpinMultiplier = this\.running && !this\.dateScrubbing \?/);
});

test('Earth axial rotation pauses only while the solar-date slider is being scrubbed', () => {
  assert.match(rendererSource, /this\.dateScrubbing = false/);
  assert.match(rendererSource, /beginSimulationDateScrub\(\) \{\s*this\.dateScrubbing = true/);
  assert.match(rendererSource, /endSimulationDateScrub\(\) \{\s*this\.dateScrubbing = false/);
  assert.match(appSource, /solarDateSlider\?\.addEventListener\('pointerdown',[\s\S]*?beginSimulationDateScrub/);
  assert.match(appSource, /solarDateSlider\?\.addEventListener\('change', endSolarDateScrub\)/);
});

test('V vector length and label scale use speed magnitude rather than camera distance', () => {
  assert.match(rendererSource, /velocityVectorLength\(elements = this\.elements\)/);
  assert.match(rendererSource, /speed \/ 7800/);
  assert.match(rendererSource, /const vMagnitudeScale = this\.velocityVectorLength\(elements\);[\s\S]*?clipRayLengthOutsideSphere\(vOrigin, velocityDirection, vMagnitudeScale\)/);
  assert.match(rendererSource, /vVector\?\.scale\.set\(vLabelScale/);
});

test('r, v and satellite hover labels are concise', () => {
  assert.match(rendererSource, /const rTip = 'Position Vector'/);
  assert.match(rendererSource, /const vTip = 'Velocity Vector'/);
  assert.match(rendererSource, /this\.satelliteGroup\.userData\.tooltip = 'Satellite'/);
  assert.doesNotMatch(rendererSource, /Satellite · body and solar panels/);
});

test('Animate toggle shares the simulation-rate panel and slider units are not duplicated', () => {
  assert.match(htmlSource, /class="simulation-controls"[\s\S]*?id="animateToggle"[\s\S]*?id="timeScale"/);
  assert.doesNotMatch(htmlSource, /<div class="element-limits"><span>[^<]*<\/span><span>[^<]*<\/span><span>/);
  assert.match(appSource, /formatHWithUnit/);
  assert.match(htmlSource, /id="value-h"/);
});

test('inclination annotation remains visible at exactly 180 degrees', () => {
  assert.match(rendererSource, /const inclinationDegrees = clamp\(Number\(elements\.i\) \|\| 0, 0, 180\)/);
  assert.match(rendererSource, /const inclinationArcDegrees = inclinationDegrees >= 180 \? 179\.999 : inclinationDegrees/);
  assert.match(rendererSource, /inclinationDegrees > 0\.15[\s\S]*?inclinationDegrees <= 180/);
});

test('browser tab title omits the release version while the app identifies release 1.0.0', () => {
  assert.match(htmlSource, /<title>ORBITAL LAB<\/title>/);
  assert.doesNotMatch(htmlSource.match(/<title>[\s\S]*?<\/title>/)?.[0] || '', /version|1\.1\.0/i);
  assert.match(htmlSource, /footer-version[^>]*>VERSION 1\.0\.0/);
});


test('satellite camera sits below the orbital plane while remaining on the velocity-right side', () => {
  assert.match(rendererSource, /const planeDropOffset = clamp\(\.34 \+ satelliteScale \* \.10 \+ portraitOffset \* \.06, \.34, \.44\)/);
  assert.match(rendererSource, /addScaledVector\(velocity, sideOffset\)[\s\S]*?addScaledVector\(normal, -planeDropOffset\)/);
  assert.match(rendererSource, /return \{ position, target, up: normal \}/);
});

test('heliocentric date changes rotate the distant starfield without rotating the Earth body', () => {
  assert.match(rendererSource, /this\.starField = makeStars\(\)/);
  assert.match(rendererSource, /updateStarFieldRotation\(meanAnomaly = this\.solarEpochMeanAnomaly\)/);
  assert.match(rendererSource, /this\.starField\.quaternion\.setFromAxisAngle\(eclipticNorth, -longitudeDelta\)/);
  assert.match(rendererSource, /this\.updateStarFieldRotation\(selectedMeanAnomaly\)/);
  assert.match(rendererSource, /this\.updateStarFieldRotation\(simulatedSolarMean\)/);
  assert.match(rendererSource, /this\.bodyGroup\.rotation\.y = this\.earthRotationAngle/);
});

test('release 1.0.0 removes redundant unit and settings helper labels', () => {
  assert.doesNotMatch(htmlSource, /SI UNITS|<b>Earth rotation<\/b>|<b>Visual layers<\/b>|<b>3D angle annotations<\/b>/);
  assert.match(htmlSource, /footer-version[^>]*>VERSION 1\.0\.0/);
});

test('settings gear is centered and simulation controls share a consistent vertical rhythm', () => {
  assert.match(htmlSource, /<circle cx="12" cy="12" r="2\.65"\/>/);
  assert.match(stylesSource, /\.settings-trigger svg \{[^}]*transform: none/s);
  assert.match(stylesSource, /\.simulation-strip \{[\s\S]*?min-height: 44px/);
  assert.match(stylesSource, /\.simulation-state \{[\s\S]*?min-height: 28px/);
  assert.match(stylesSource, /\.simulation-strip \.reset-button \{[\s\S]*?min-height: 28px/);
});
