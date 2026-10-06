import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MotionVenueAdapter } from '../../core/adapters/motion.mjs';

function response(body, url) {
  return {
    ok: true,
    status: 200,
    url,
    headers: { get() { return 'text/html; charset=utf-8'; } },
    async text() { return body; },
  };
}

function motionPage({ selectedDate, dates = ['2026-10-03', '2026-10-04'] }) {
  return `<!doctype html><html><head><title>MOTION</title></head><body>
    <select name="d">${dates.map((date) => `<option value="${date}"${date === selectedDate ? ' selected' : ''}>${date}</option>`).join('')}</select>
    <select name="c"><option value="1" selected>1</option></select>
    <table><thead><tr><th>时间/场地</th><th>1号场</th></tr></thead><tbody>
      <tr><td>08:00-09:00</td><td>可预约</td></tr>
    </tbody></table>
  </body></html>`;
}

test('MOTION falls back to the newest public date when a cached previous date expires', async () => {
  const calls = [];
  const detailUrl = 'https://motion.buct.edu.cn/changguanyuyue1/detail.php?xm=%E7%BE%BD%E6%AF%9B%E7%90%83&xq=0';
  const adapter = new MotionVenueAdapter({
    fetchImpl: async (url) => {
      calls.push(String(url));
      const selectedDate = String(url).includes('d=2026-10-04') ? '2026-10-04' : '2026-10-03';
      return response(motionPage({ selectedDate }), String(url));
    },
  });

  const result = await adapter.queryStatus({ detailUrl, date: '2026-10-02', venue: '1' });

  assert.equal(result.query.date, '2026-10-04');
  assert.equal(result.query.availableDates.at(-1), '2026-10-04');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /[?&]d=2026-10-04(?:&|$)/);
  assert.match(calls[1], /[?&]c=1(?:&|$)/);
});
