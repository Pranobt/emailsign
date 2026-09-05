const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../admin.html'), 'utf8');
const helpers = html.slice(html.indexOf('    function secondaryRequest_('), html.indexOf('    function applyTab('));

function setup() {
  const calls = [];
  const ctx = vm.createContext({
    adminSession: { admin: 'test', code: 'test' }, CLIENT_VERSION: 'test',
    departmentFilterEl: { value: 'All' }, employeeFilterEl: { value: 'All' },
    getDateRangeForFilters_: () => ({ fromDate: '2026-09-05', toDate: '2026-09-05' }),
    todayISO: () => '2026-09-05', secondaryLoads: new Map(),
    activeTab: 'employee', leaderboardVisible: false, isLocked: false,
    streakRows: [], leaderboardRows: [], approvalRows: [], failedCliqRows: [],
    renderTable() {}, renderLeaderboardPanel_() {}, console: { warn() {} },
    jsonp(action, payload) {
      return new Promise((resolve, reject) => calls.push({ action, payload, resolve, reject }));
    }
  });
  vm.runInContext(helpers, ctx);
  return { ctx, calls };
}

test('initial employee view does not request secondary data', () => {
  const { ctx, calls } = setup();
  ctx.loadVisibleSecondary_();
  assert.equal(calls.length, 0);
});

test('streak requests are deduplicated and reused for repeat visits', async () => {
  const { ctx, calls } = setup();
  const pending = ctx.loadSecondary_('streaks');
  await ctx.loadSecondary_('streaks');
  assert.equal(calls.length, 1);
  assert.equal(ctx.secondaryMessage_('streaks'), 'Loading...');
  calls[0].resolve({ ok: true, streaks: [{ employeeName: 'A' }] });
  await pending;
  await ctx.loadSecondary_('streaks');
  assert.equal(calls.length, 1);
  assert.equal(ctx.streakRows[0].employeeName, 'A');
  assert.equal(ctx.secondaryMessage_('streaks'), '');
  ctx.secondaryLoads.values().next().value.loadedAt = 0;
  const reload = ctx.loadSecondary_('streaks');
  assert.equal(calls.length, 2);
  calls[1].resolve({ ok: true, streaks: [] });
  await reload;
});

test('superseded requests cannot overwrite refreshed data', async () => {
  const { ctx, calls } = setup();
  const old = ctx.loadSecondary_('streaks');
  ctx.secondaryLoads.clear();
  const fresh = ctx.loadSecondary_('streaks');
  calls[1].resolve({ ok: true, streaks: [{ employeeName: 'Fresh' }] });
  await fresh;
  calls[0].resolve({ ok: true, streaks: [{ employeeName: 'Old' }] });
  await old;
  assert.equal(ctx.streakRows[0].employeeName, 'Fresh');
});

test('failed requests show an error and can be retried', async () => {
  const { ctx, calls } = setup();
  const first = ctx.loadSecondary_('streaks');
  calls[0].reject(new Error('timeout'));
  await first;
  assert.match(ctx.secondaryMessage_('streaks'), /Could not load/);
  const retry = ctx.loadSecondary_('streaks');
  calls[1].resolve({ ok: true, streaks: [] });
  await retry;
  assert.equal(ctx.secondaryMessage_('streaks'), '');
});

test('approvals retain date, department and employee filters', async () => {
  const { ctx, calls } = setup();
  ctx.departmentFilterEl.value = 'Design';
  ctx.employeeFilterEl.value = 'A';
  const pending = ctx.loadSecondary_('approvals');
  assert.equal(calls[0].payload.department, 'Design');
  assert.equal(calls[0].payload.requesterName, 'A');
  assert.equal(calls[0].payload.fromDate, '2026-09-05');
  calls[0].resolve({ ok: true, approvals: [] });
  await pending;
});
