import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_NAME, APP_VERSION, APP_VERSION_LABEL } from '../src/mobile/app-identity.mjs';
import { toIcs, toTheiaFeed } from '../src/mobile/feed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8');
}

test('BetterBUCT public identity is release-aligned', async () => {
  const appPkg = JSON.parse(await read('package.json'));
  const pkg = JSON.parse(await read('../package.json'));
  const capacitor = await read('capacitor.config.ts');
  const strings = await read('android/app/src/main/res/values/strings.xml');
  const gradle = await read('android/app/build.gradle');

  assert.equal(APP_NAME, 'BetterBUCT');
  assert.equal(APP_VERSION, '0.2.27');
  assert.equal(APP_VERSION_LABEL, '0.2.27-mobile');
  assert.equal(pkg.name, 'betterbuct-mobile-root');
  assert.equal(appPkg.name, 'betterbuct-mobile');
  assert.equal(appPkg.version, APP_VERSION);
  assert.match(capacitor, /appName:\s*['"]BetterBUCT['"]/);
  assert.match(strings, /<string name="app_name">BetterBUCT<\/string>/);
  assert.match(strings, /<string name="title_activity_main">BetterBUCT<\/string>/);
  assert.match(gradle, /versionCode\s+27/);
  assert.match(gradle, /versionName\s+"0\.2\.27"/);
});

test('BetterBUCT icon branding survives exported calendar/feed payloads', () => {
  const state = {
    appVersion: APP_VERSION_LABEL,
    profile: { studentId: '2026000000' },
    schedule: [],
    exams: [{ id: 'exam-1', courseName: '测试课程', examTime: '2026-10-03T09:00:00+08:00' }],
    assignments: [],
  };
  const ics = toIcs(state);
  const feed = toTheiaFeed(state);

  assert.match(ics, /PRODID:-\/\/BetterBUCT\/\/Campus Client\/\/CN/);
  assert.match(ics, /X-WR-CALNAME:BetterBUCT 校园日历/);
  assert.equal(feed.producer.name, APP_NAME);
  assert.equal(feed.producer.version, APP_VERSION_LABEL);
  // The schema/IDs intentionally remain legacy-compatible for old imports.
  assert.equal(feed.schema, 'theia-campus-feed/v1');
});

test('About page uses the real BetterBUCT and Windows THEIA repositories', async () => {
  const about = await read('src/views/settings/AboutSettings.tsx');
  const sidebar = await read('src/layout/AppSidebar.tsx');
  const updates = await read('src/mobile/update-checker.ts');
  const privacy = await read('src/assets/privacy.html');

  assert.match(about, /https:\/\/github\.com\/bakahuiii\/BetterBUCT/);
  assert.match(about, /https:\/\/github\.com\/bakahuiii\/THEIA/);
  assert.match(about, /<strong id="about-theia-title">THEIA<\/strong>/);
  assert.match(updates, /https:\/\/api\.github\.com\/repos\/bakahuiii\/BetterBUCT\/releases\/latest/);
  assert.match(privacy, /https:\/\/github\.com\/bakahuiii\/BetterBUCT\/issues/);
  assert.doesNotMatch(about, /Θεία|THEIA-Android|COS \/ GitHub/);
  assert.doesNotMatch(sidebar, /Θεία/);
});
