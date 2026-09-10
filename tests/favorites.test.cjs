const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../favorites.js'), 'utf8');
const KEY = 'comparatupala:saved';

function setup(initial = [], blocked = false) {
  const storage = new Map([[KEY, JSON.stringify(initial)]]);
  const events = new EventTarget();
  const context = vm.createContext({
    window: events, console,
    CustomEvent: class extends Event { constructor(type, options) { super(type); this.detail = options.detail; } },
    localStorage: {
      getItem: key => storage.get(key),
      setItem: (key, value) => { if (blocked) throw Error('denied'); storage.set(key, value); }
    }
  });
  vm.runInContext(source, context);
  const rows = new Map(), calls = [];
  const control = { fail: false, failUpload: false, pause: null };
  const client = { from(table) {
    assert.equal(table, 'favorites');
    let action = 'select', uid, product, values, start = 0, end = 999;
    const query = {
      select() { return query; },
      eq(key, value) { if (key === 'user_id') uid = value; else product = value; return query; },
      order() { return query; },
      range(a, b) { start = a; end = b; return query; },
      upsert(data) { action = 'upsert'; values = Array.isArray(data) ? data : [data]; return query; },
      delete() { action = 'delete'; return query; },
      async then(resolve, reject) {
        try {
          calls.push({ action, uid, values });
          if (control.pause) await control.pause;
          if (control.fail || (control.failUpload && action === 'upsert')) return resolve({ error: Error('network'), data: null });
          if (action === 'upsert') values.forEach(row => {
            if (!rows.has(row.user_id)) rows.set(row.user_id, new Set());
            rows.get(row.user_id).add(row.product_id);
          });
          if (action === 'delete') rows.get(uid)?.delete(product);
          return resolve({ error: null, data: action === 'select' ?
            [...(rows.get(uid) || [])].sort().slice(start, end + 1).map(product_id => ({ product_id })) : null });
        } catch (error) { return reject(error); }
      }
    };
    return query;
  } };
  return { api: events.CTPFavorites, storage, rows, calls, client, control };
}
const values = api => [...api.get()].sort();
const settle = () => new Promise(resolve => setImmediate(resolve));

test('existing guest favorites retain the original storage key and work without Supabase', async () => {
  const s = setup(['offer-1', 'offer-2']);
  assert.deepEqual(values(s.api), ['offer-1', 'offer-2']);
  await s.api.toggle('offer-1');
  await s.api.toggle('offer-3');
  assert.deepEqual(JSON.parse(s.storage.get(KEY)), ['offer-2', 'offer-3']);
  assert.equal(s.calls.length, 0);
});
test('blocked storage still permits favorites during this page session', async () => {
  const s = setup([], true);
  const result = await s.api.toggle('offer-1');
  assert.match(result.message, /solo durante esta sesión/);
  assert.deepEqual(values(s.api), ['offer-1']);
});
test('malformed guest data does not break initialization', () => {
  const s = setup({ unexpected: true });
  assert.deepEqual(values(s.api), []);
});
test('login unions local and remote favorites, consumes guest data, and does not resurrect removals', async () => {
  const s = setup(['offer-1', 'offer-2']);
  s.rows.set('A', new Set(['offer-2', 'offer-3']));
  s.api.setSession(s.client, { id: 'A' });
  await settle();
  assert.deepEqual(values(s.api), ['offer-1', 'offer-2', 'offer-3']);
  assert.deepEqual(JSON.parse(s.storage.get(KEY)), []);
  await s.api.toggle('offer-1');
  s.api.setSession(s.client, null);
  assert.deepEqual(values(s.api), []);
  s.api.setSession(s.client, { id: 'A' });
  await settle();
  assert.deepEqual(values(s.api), ['offer-2', 'offer-3']);
});
test('failed import preserves local data and retry completes it', async () => {
  const s = setup(['offer-1']);
  s.control.fail = true;
  s.api.setSession(s.client, { id: 'A' });
  await settle();
  assert.deepEqual(JSON.parse(s.storage.get(KEY)), ['offer-1']);
  assert.equal((await s.api.toggle('offer-2')).ok, false);
  s.control.fail = false;
  await s.api.retry();
  assert.deepEqual(values(s.api), ['offer-1']);
});
test('failed authenticated mutation leaves confirmed state unchanged', async () => {
  const s = setup(['offer-1']);
  s.api.setSession(s.client, { id: 'A' });
  await settle();
  s.control.fail = true;
  assert.equal((await s.api.toggle('offer-1')).ok, false);
  assert.deepEqual(values(s.api), ['offer-1']);
  s.control.fail = false;
  assert.equal((await s.api.toggle('offer-1')).ok, true);
  assert.deepEqual(values(s.api), []);
});
test('an upload failure after reading remote favorites preserves all guest IDs for retry', async () => {
  const s = setup(['guest']);
  s.rows.set('A', new Set(['remote']));
  s.control.failUpload = true;
  s.api.setSession(s.client, { id: 'A' });
  await settle();
  assert.deepEqual(JSON.parse(s.storage.get(KEY)), ['guest']);
  assert.equal(s.calls.some(call => call.action === 'upsert'), true);
  s.control.failUpload = false;
  await s.api.retry();
  assert.deepEqual(values(s.api), ['guest', 'remote']);
});
test('rapid toggles are serialized and produce the intended final state', async () => {
  const s = setup();
  s.api.setSession(s.client, { id: 'A' });
  await settle();
  await Promise.all([s.api.toggle('offer-1'), s.api.toggle('offer-1'), s.api.toggle('offer-2')]);
  assert.deepEqual(values(s.api), ['offer-2']);
  assert.deepEqual([...s.rows.get('A')], ['offer-2']);
});
test('switching accounts never exposes favorites from the previous user', async () => {
  const s = setup();
  s.rows.set('A', new Set(['private-A']));
  s.rows.set('B', new Set(['private-B']));
  s.api.setSession(s.client, { id: 'A' });
  await settle();
  s.api.setSession(s.client, { id: 'B' });
  assert.deepEqual(values(s.api), []);
  await settle();
  assert.deepEqual(values(s.api), ['private-B']);
});
test('late network responses cannot restore a signed-out account or consume guest favorites', async () => {
  const s = setup(['guest']);
  let release;
  s.control.pause = new Promise(resolve => { release = resolve; });
  s.api.setSession(s.client, { id: 'A' });
  await settle();
  s.api.setSession(s.client, null);
  release();
  await settle();
  assert.deepEqual(values(s.api), ['guest']);
  assert.deepEqual(JSON.parse(s.storage.get(KEY)), ['guest']);
});
test('remote favorites beyond the API default page size are loaded', async () => {
  const s = setup();
  s.rows.set('A', new Set(Array.from({ length: 1100 }, (_, i) => `offer-${i}`)));
  s.api.setSession(s.client, { id: 'A' });
  await settle();
  assert.equal(s.api.get().size, 1100);
  assert.equal(s.calls.filter(call => call.action === 'select').length, 2);
});
