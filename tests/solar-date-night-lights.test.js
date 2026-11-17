import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const rendererSource = await readFile(new URL('../src/scene/OrbitalRenderer.js', import.meta.url), 'utf8');
const assetSource = await readFile(new URL('../scripts/download-assets.mjs', import.meta.url), 'utf8');
const attributionSource = await readFile(new URL('../public/assets/ASSET_SOURCE.txt', import.meta.url), 'utf8');

test('Persian solar ephemeris date is visible and uses the simulation solar epoch', () => {
  assert.match(htmlSource, /class="scene-solar-date"/);
  assert.match(htmlSource, /id="solarDateValue"/);
  assert.match(htmlSource, /موقعیت زمین نسبت به خورشید بر اساس این تاریخ/);
  assert.match(appSource, /fa-IR-u-ca-persian-nu-arabext/);
  assert.match(appSource, /updateSolarDateReadout\(\)/);
  assert.match(appSource, /getSimulationDate\?\.\(state\.timeSec\)/);
  assert.match(rendererSource, /this\.solarEpochDate = new Date\(\)/);
  assert.match(rendererSource, /Solar\.meanAnomalyAtDate\(this\.solarEpochDate\)/);
  assert.match(rendererSource, /getSimulationDate\(timeSec = this\.timeSec\)/);
  assert.match(rendererSource, /this\.solarEpochDate\.getTime\(\) \+ \(Number\(timeSec\) \|\| 0\) \* 1000/);
});

test('Solar date label updates alongside the same elapsed time used by heliocentric motion', () => {
  assert.match(rendererSource, /Solar\.mod\(this\.solarEpochMeanAnomaly \+ \(2 \* Math\.PI \* \(this\.timeSec \|\| 0\)\) \/ \(Solar\.yearDays \* 86400\)/);
  assert.match(appSource, /updateSolarDateReadout\(\);/);
});

test('NASA Black Marble night map is loaded as an equirectangular texture', () => {
  assert.match(rendererSource, /loadEarthNightTexture\(\)/);
  assert.match(rendererSource, /earth-night-lights\.jpg/);
  assert.match(rendererSource, /NASA Black Marble night-lights map loaded/);
  assert.match(rendererSource, /textureState\.loadedRealMap = true/);
  assert.match(rendererSource, /this\.configureEarthTexture\(loadedTexture\)/);
  assert.match(rendererSource, /Math\.abs\(width \/ Math\.max\(1, height\) - 2\) > 0\.12/);
});

test('Night lights are emissive only on the dark hemisphere with a soft terminator', () => {
  assert.match(rendererSource, /uniform sampler2D uNightMap/);
  assert.match(rendererSource, /uniform bool uHasNightMap/);
  assert.match(rendererSource, /uniform float uNightLightStrength/);
  assert.match(rendererSource, /uniform vec3 uSunDirectionView/);
  assert.match(rendererSource, /dot\(normalize\(normal\), normalize\(uSunDirectionView\)\)/);
  assert.match(rendererSource, /1\.0 - smoothstep\(-0\.12, 0\.08, sunFacing\)/);
  assert.match(rendererSource, /totalEmissiveRadiance \+= nightEmission \* uNightLightStrength \* nightFactor/);
  assert.match(rendererSource, /uNightLightStrength = \{ value: 0\.38 \}/);
  assert.match(rendererSource, /updateEarthNightLightUniforms\(\)/);
});

test('Day and night maps download independently and the existing daytime Earth map is retained', () => {
  assert.match(assetSource, /earth-blue-marble\.jpg/);
  assert.match(assetSource, /earth-night-lights\.jpg/);
  assert.match(assetSource, /BlackMarble_2016_01deg\.jpg/);
  assert.match(assetSource, /ensureMap\(/);
  assert.match(assetSource, /await ensureMap\(\{\n  name: 'NASA Blue Marble daytime Earth'/);
  assert.match(assetSource, /await ensureMap\(\{\n  name: 'NASA Black Marble night-lights'/);
  assert.match(assetSource, /Valid \$\{name\} map found/);
});

test('v1.0.6 migrates saved settings from all previous releases', () => {
  assert.match(appSource, /orbital-lab-settings-v106/);
  for (const version of ['v105', 'v104', 'v103', 'v102']) assert.match(appSource, new RegExp(`orbital-lab-settings-${version}`));
});

test('NASA daytime and nighttime map attribution is retained with the static assets', () => {
  assert.match(attributionSource, /NASA Blue Marble: Next Generation/);
  assert.match(attributionSource, /NASA Black Marble 2016/);
  assert.match(attributionSource, /Joshua Stevens/);
  assert.match(attributionSource, /Both maps are static global composites/);
});
