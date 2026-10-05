// Copyright 2026 Gilles Reant. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness() {
  const handlers = {}, stores = new Map(), network = [];
  let offline = false;
  const key = request => typeof request === 'string' ? request : request.url;
  const caches = {
    keys: async () => [...stores.keys()], delete: async name => stores.delete(name),
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return { addAll: async paths => paths.forEach(path => data.set(new URL(path, 'https://example.test/app/').href, new Response('cached'))), match: async request => data.get(key(request)), put: async (request, response) => data.set(key(request), response), keys: async () => [...data.keys()].map(url => new Request(url)), delete: async request => data.delete(key(request)) };
    },
  };
  const self = { location: { href: 'https://example.test/app/service-worker.js' }, addEventListener: (name, handler) => handlers[name] = handler, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  vm.runInNewContext(fs.readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8'), { self, caches, URL, Request, fetch: async request => { network.push(key(request)); if (offline) throw new Error('offline'); return new Response('network'); } });
  async function lifecycle(name) { let result; handlers[name]({ waitUntil: promise => result = promise }); await result; }
  async function fetchUrl(url, method = 'GET') { let result; handlers.fetch({ request: new Request(url, { method }), respondWith: promise => result = promise, waitUntil() {} }); return result; }
  return { stores, caches, network, lifecycle, fetchUrl, setOffline: value => offline = value };
}
test('only this application and scope caches are deleted', async () => {
  const h = harness();
  for (const name of ['other-app', 'emvqr:%2Felsewhere%2F:old', 'emvqr:%2Fapp%2F:old']) await h.caches.open(name);
  await h.lifecycle('install'); await h.lifecycle('activate');
  assert.ok(h.stores.has('other-app')); assert.ok(h.stores.has('emvqr:%2Felsewhere%2F:old'));
  assert.ok(!h.stores.has('emvqr:%2Fapp%2F:old'));
});
test('new QR query links work offline; unrelated requests are not intercepted', async () => {
  const h = harness(); await h.lifecycle('install'); h.setOffline(true);
  assert.ok(await h.fetchUrl('https://example.test/app/parser.html?qr=PRIVATE'));
  assert.equal(await h.fetchUrl('https://example.test/account'), undefined);
  assert.equal(await h.fetchUrl('https://other.test/app/parser.html'), undefined);
  assert.equal(await h.fetchUrl('https://example.test/app/parser.html', 'POST'), undefined);
  assert.deepEqual(h.network, []);
  assert.ok([...h.stores.values()].every(cache => [...cache.keys()].every(key => !key.includes('?'))));
});
test('OpenCV is cached only on demand without query strings', async () => {
  const h = harness(); await h.lifecycle('install');
  assert.ok([...h.stores.values()].every(cache => ![...cache.keys()].some(key => key.endsWith('/opencv.js'))));
  await h.fetchUrl('https://example.test/app/vendor/opencv.js?v=test');
  assert.deepEqual(h.network, ['https://example.test/app/vendor/opencv.js']);
});

test('editable test-set YAML is revalidated online and retained offline', async () => {
  const h = harness(); await h.lifecycle('install');
  const url = 'https://example.test/app/samples/qr-test-set.yaml';
  for (let index = 0; index < 2; index++) {
    assert.equal(await (await h.fetchUrl(url + '?ignored=true')).text(), 'network');
  }
  assert.deepEqual(h.network, [url, url]);
  h.setOffline(true);
  assert.equal(await (await h.fetchUrl(url)).text(), 'network');
  assert.ok(await h.fetchUrl('https://example.test/app/test-set.html'));
});
test('legacy payment URL cache entries are removed without touching other paths', async () => {
  const h = harness(); const old = await h.caches.open('emvqr-pwa-v56');
  await old.put('https://example.test/app/parser.html?qr=PRIVATE', new Response('old'));
  await old.put('https://example.test/other/parser.html?qr=OTHER', new Response('other'));
  await h.lifecycle('install'); await h.lifecycle('activate');
  assert.equal((await old.keys()).length, 1);
  assert.match((await old.keys())[0].url, /\/other\//);
});
