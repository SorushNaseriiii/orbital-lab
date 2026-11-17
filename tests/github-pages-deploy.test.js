import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('GitHub Pages workflow deploys main and supports manual runs', async () => {
  const workflow = await read('.github/workflows/deploy.yml');
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});

test('GitHub Pages workflow runs tests and builds with Node 22', async () => {
  const workflow = await read('.github/workflows/deploy.yml');
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build/);
});

test('deployment checks require both NASA Earth maps in dist', async () => {
  const workflow = await read('.github/workflows/deploy.yml');
  assert.match(workflow, /dist\/assets\/earth-blue-marble\.jpg/);
  assert.match(workflow, /dist\/assets\/earth-night-lights\.jpg/);
  const verifier = await read('scripts/verify-deploy-assets.mjs');
  assert.match(verifier, /earth-blue-marble\.jpg/);
  assert.match(verifier, /earth-night-lights\.jpg/);
  assert.match(verifier, /equirectangular JPEG/);
});

test('downloaded NASA maps are excluded from source commits', async () => {
  const gitignore = await read('.gitignore');
  assert.match(gitignore, /public\/assets\/earth-blue-marble\.jpg/);
  assert.match(gitignore, /public\/assets\/earth-night-lights\.jpg/);
});

test('Vite keeps relative asset paths for project-site URLs', async () => {
  const vite = await read('vite.config.js');
  assert.match(vite, /base:\s*['"]\.\/['"]/);
});
