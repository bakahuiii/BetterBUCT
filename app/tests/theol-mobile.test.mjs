import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTheolMobileHomeworkDetail,
  parseTheolMobileTaskList,
  sanitizeTheolHtml,
} from '../../core/parsers/theol-mobile.mjs';
import { TheolAdapter } from '../../core/adapters/theol.mjs';

const course = {
  id: '1001',
  title: '高等数学 A',
  source: 'theol',
  sourceUrl: 'https://course.buct.edu.cn/meol/homepage/course/course_index.jsp?courseId=1001',
};

test('THEOL mobile task parser keeps Courser-compatible tasks when the roster is partial', () => {
  const result = parseTheolMobileTaskList({
    status: 1,
    sessionid: 'must-not-escape',
    datas: [{
      courseId: 1001,
      courseName: '高等数学 A',
      reminderList1: [{
        id: 42,
        title: '第一次作业',
        pubTime: '2026-09-20 10:00',
        deadline: '2026-10-10 23:59',
        publishStatus: true,
      }],
    }, {
      courseId: 9999,
      courseName: '课程列表暂未解析到',
      reminderList1: [{ id: 99, title: '第二次作业', deadline: '2026-10-11', publishStatus: false }],
    }],
  }, { courses: [course], capturedAt: '2026-10-02T00:00:00.000Z' });

  assert.equal(result.authenticated, true);
  assert.equal(result.assignments.length, 2);
  assert.equal(result.assignments[0].courseId, '1001');
  assert.equal(result.assignments[0].title, '第一次作业');
  assert.equal(result.assignments[0].status, 'pending');
  assert.match(result.assignments[0].sourceUrl, /hwtid=42/);
  assert.equal(result.assignments[1].courseId, '9999');
  assert.equal(result.assignments[1].courseName, '课程列表暂未解析到');
  assert.equal(result.assignments[1].title, '第二次作业');
  assert.match(result.assignments[1].sourceUrl, /hwtid=99/);
  assert.ok(result.assignments[0].dueAt);
  assert.equal(JSON.stringify(result).includes('must-not-escape'), false);
});

test('THEOL homework detail sanitizer removes executable/off-campus markup', () => {
  const html = sanitizeTheolHtml(
    '<p>请完成下列题目</p><script>alert(1)</script><img src="/meol/common/picture.png" onerror="alert(2)"><a href="https://evil.example/">外链</a><a href="/meol/file.doc">附件</a>',
    { baseUrl: 'https://course.buct.edu.cn/meol/common/hw/student/hwtask.view.jsp?hwtid=42' },
  );
  assert.match(html, /请完成下列题目/);
  assert.doesNotMatch(html, /<script|onerror/iu);
  assert.doesNotMatch(html, /evil\.example/iu);
  assert.match(html, /course\.buct\.edu\.cn\/meol\/file\.doc/iu);

  const detail = parseTheolMobileHomeworkDetail({
    status: 1,
    datas: {
      taskTitle: '第一次作业',
      taskContent: '<p>请完成下列题目</p><a href="/meol/common/download.jsp?fileid=42">作业附件.pdf</a><script>bad()</script>',
      hasSubmit: false,
      maySubmit: true,
      mayModify: 1,
      hwTaskId: 42,
    },
  }, { assignment: { id: 'a1', title: '旧标题', courseId: '1001', status: 'pending' } });
  assert.equal(detail.authenticated, true);
  assert.equal(detail.title, '第一次作业');
  assert.equal(detail.hasSubmit, false);
  assert.equal(detail.maySubmit, true);
  assert.match(detail.contentHtml, /请完成下列题目/);
  assert.doesNotMatch(detail.contentHtml, /script/iu);
  assert.equal(detail.attachments.length, 1);
  assert.equal(detail.attachments[0].title, '作业附件.pdf');
  assert.match(detail.attachments[0].url, /fileid=42/);
});

test('TheolAdapter mobile list and detail reuse one authenticated client contract', async () => {
  const calls = [];
  const client = {
    async json(url) {
      calls.push(['json', url]);
      return {
        status: 1,
        datas: [{ courseId: 1001, courseName: course.title, reminderList1: [{ id: 42, title: '第一次作业', deadline: '2026-10-10', publishStatus: true }] }],
      };
    },
    async form(url, values) {
      calls.push(['form', url, values]);
      if (url.endsWith('enterCourse.do')) return JSON.stringify({ status: 1 });
      return JSON.stringify({ status: 1, datas: {
        taskTitle: '第一次作业', taskContent: '<p>题目正文</p><a href="/meol/common/download.jsp?fileid=42">作业附件.pdf</a>', hasSubmit: true, maySubmit: false, mayModify: 0, hwTaskId: 42,
      } });
    },
    async assignmentBinary(url) {
      calls.push(['binary', url]);
      return { buffer: Uint8Array.from([37, 80, 68, 70]), contentType: 'application/pdf', headers: { get(name) { return name === 'content-disposition' ? 'attachment; filename="作业附件.pdf"' : null; } } };
    },
    async page() { throw new Error('not used'); },
  };
  const adapter = new TheolAdapter(client);
  const list = await adapter.syncMobileAssignments([course]);
  assert.equal(list.assignments.length, 1);
  assert.equal(list.domainOutcomes.assignments.completeness, 'complete');
  const detail = await adapter.getMobileAssignmentDetail(list.assignments[0]);
  assert.equal(detail.hasSubmit, false);
  assert.equal(detail.maySubmit, true);
  assert.equal(detail.status, 'pending');
  assert.equal(detail.attachments.length, 1);
  assert.match(detail.contentHtml, /题目正文/);
  const attachment = await adapter.getMobileAssignmentAttachment(list.assignments[0], detail.attachments[0]);
  assert.equal(attachment.buffer.length, 4);
  assert.equal(attachment.contentType, 'application/pdf');
  assert.deepEqual(calls.map(([kind]) => kind), ['json', 'form', 'form', 'binary']);
});
