import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JwglxtAdapter } from '../../core/adapters/jwglxt.mjs';

const BASE = 'https://jwglxt.buct.edu.cn/jwglxt/';

test('grade-details single-domain sync loads term context and returns component records', async () => {
  const pageCalls = [];
  const formCalls = [];
  const client = {
    setDiagnostic() {},
    async page(url) {
      pageCalls.push(url);
      if (url.includes('index_initMenu.html')) {
        return {
          url,
          text: '<nav><a href="/jwglxt/cjcx/cjcx_cxDgXsxmcj.html?gnmkdm=N305007">成绩明细</a></nav>',
        };
      }
      if (url.includes('xskbcx_cxXskbcxIndex.html')) {
        return {
          url,
          text: '<form id="ajaxForm"><select id="xnm" name="xnm"><option value="2025" selected>2025-2026</option></select><select id="xqm" name="xqm"><option value="3" selected>第一学期</option></select></form>',
        };
      }
      if (url.includes('cjcx_cxDgXsxmcj.html')) {
        return {
          url,
          text: '<form id="searchForm"><select name="xnm"><option value="2025" selected>2025-2026</option></select><select name="xqm"><option value="3" selected>第一学期</option></select></form>',
        };
      }
      throw new Error(`Unexpected page request: ${url}`);
    },
    async form(url, values) {
      formCalls.push({ url, values });
      if (url.endsWith('cjcx_cxXsKcList.html')) {
        return JSON.stringify({ items: [{ kcmc: '工程数学', kch: 'MATH101', jxb_id: 'class-1' }] });
      }
      if (url.endsWith('cjcx_cxXsKccjList.html')) {
        return JSON.stringify({ items: [{
          kcmc: '工程数学',
          kch: 'MATH101',
          xnm: '2025',
          xqm: '3',
          xmblmc: '期中',
          xmcj: '88',
          zpcj: '90',
          xf: '3',
        }] });
      }
      throw new Error(`Unexpected form request: ${url}`);
    },
  };

  const adapter = new JwglxtAdapter(client);
  const result = await adapter.sync({ domains: ['grade-details'] });

  assert.ok(pageCalls.some((url) => url.includes('xskbcx_cxXskbcxIndex.html')),
    'single-domain grade detail reads load the school term context');
  assert.equal(formCalls.length, 2, 'course list and aggregate component grid are queried');
  assert.ok(formCalls.every(({ values }) => values.xnm === '2025' && values.xqm === '3'));
  assert.deepEqual(Object.keys(result.domainOutcomes), ['grade-details']);
  const records = result.academicExtras.domains['grade-details'].records;
  assert.equal(records.length, 2, 'the requested course row and its component row are both retained');
  const component = records.find((record) => record.recordType === 'grade-component');
  assert.ok(component);
  assert.equal(component.courseName, '工程数学');
  assert.equal(component.assessmentItem, '期中');
  assert.equal(component.componentScore, 88);
});
