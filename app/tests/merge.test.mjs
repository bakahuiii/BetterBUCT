// Validate mergeSyncResult + normalizeSyncPayload (the merge path campus-sync uses)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { mergeSyncResult, emptyState, normalizeState } = await import('../../core/schema.mjs');
const mock = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../src/mobile/mock/mock-data.json', import.meta.url), 'utf8'));

test('mergeSyncResult merges adapter-style result into state', () => {
  const current = normalizeState(mock);
  const result = {
    profile: { name: '测试用户', studentId: '2026000001' },
    terms: [{ id: '2026-3', year: 2026, term: '3', label: '2026-2027 第一学期' }],
    schedule: [
      { id: 'live-s1', title: '高等数学 A', teacher: '李老师', room: '昌平 A-203', weekday: 1, period: '1-2', weeks: '1-16周', termId: '2026-3' },
    ],
    grades: [
      { id: 'live-g1', termId: '2026-3', courseName: '高等数学 A', courseCode: 'MATH101', nature: '必修', credits: 5, score: '95', point: 4.5, teacher: '李老师' },
    ],
    exams: [
      { id: 'live-e1', courseName: '高等数学 A', examType: '期末考试', examTime: new Date().toISOString(), location: '昌平主教 302', campus: '昌平校区', seat: '1', mode: '闭卷' },
    ],
    selectedCourses: [],
    academicProgress: null,
    notices: [{ id: 'live-n1', title: '测试通知', summary: '内容', publishedAt: new Date().toISOString(), source: 'jwglxt', sourceUrl: 'https://jwglxt.buct.edu.cn/' }],
    capturedAt: new Date().toISOString(),
    parserVersion: 'jwglxt-adapter/1',
    errors: [],
    source: { connected: true, checkedAt: new Date().toISOString(), url: 'https://jwglxt.buct.edu.cn/jwglxt/' },
  };
  const merged = mergeSyncResult(current, { ...result, runId: 'test-run', completed: true });
  assert.equal(merged.profile.studentId, '2026000001');
  assert.ok(merged.schedule.some((item) => item.id === 'live-s1'));
  assert.ok(merged.grades.some((item) => item.id === 'live-g1'));
  assert.ok(merged.exams.some((item) => item.id === 'live-e1'));
  assert.ok(merged.notices.some((item) => item.id === 'live-n1'));
  assert.equal(merged.sync.lastError, null);
  assert.ok(merged.sync.lastCompletedAt, 'completed timestamp set');
  console.log('merged domains:', Object.keys(merged.sync.domains || {}).join(',') || 'n/a');
});

test('normalizeState keeps the mobile store schema stable', () => {
  const normalized = normalizeState(mock);
  assert.equal(normalized.schema, 'theia-campus-data/v1');
  assert.ok(Array.isArray(normalized.courses) && normalized.courses.length > 0);
  assert.ok(Array.isArray(normalized.schedule) && normalized.schedule.length > 0);
});
