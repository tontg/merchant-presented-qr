// Copyright 2026 Gilles Reant. SPDX-License-Identifier: Apache-2.0
// Optional development-only dependency: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { buildPayload } from '../public/emv.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = path.resolve('public');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('Outside public');
    res.setHeader('Content-Type', types[path.extname(file)] || 'text/plain');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (pathname.endsWith('/qr-worker.js')) res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' blob: 'unsafe-eval'; connect-src 'self'");
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emvqr-tests-'));
try {
  browser = await chromium.launch({ ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
  const context = await browser.newContext({ acceptDownloads: true });
  const errors = [], requests = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  context.on('request', request => requests.push(request.url()));
  const page = await context.newPage();
  await page.goto(base + '/render.html');
  await page.locator('#renderSampleQr svg').waitFor();
  const sample = await page.evaluate(() => {
    const api = window.MerchantPresentedQrCode;
    const target = document.createElement('div');
    const result = api.render(target, [
      { '26': [{ '00': 'COM.EXAMPLE.PAY' }, { '01': 'MERCHANT123' }] },
      { '52': '5812' }, { '53': '840' }, { '54': '12.34' }, { '58': 'US' },
      { '59': 'EXAMPLE MERCHANT' }, { '60': 'NEW YORK' }, { '62': [{ '05': 'INV-1001' }] },
    ]);
    return {
      identical: target.innerHTML === document.querySelector('#renderSampleQr').innerHTML,
      payload: result.payload,
      svg: target.innerHTML,
      frozen: ['Fields', 'AdditionalDataFields', 'LanguageFields', 'TemplateFields'].every(name => Object.isFrozen(api[name])),
      source: document.querySelector('pre code').textContent,
    };
  });
  assert.equal(sample.identical, true, 'Named constants in the live sample must produce the same QR as numeric IDs');
  assert.equal(sample.frozen, true);
  assert.ok(sample.payload.startsWith('000201010211'));
  assert.ok(sample.source.includes('[F.MERCHANT_NAME]'));
  assert.ok(sample.source.includes('[ExamplePay.MERCHANT_ACCOUNT_INFORMATION]'));
  assert.ok(sample.source.includes('[ExamplePay.MERCHANT_ID]'));
  assert.ok(sample.source.includes('<script src="emv-codec.js"></script>'));
  // Execute the displayed code in isolation, including its documented dependencies.
  const sampleContext = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const samplePage = await sampleContext.newPage();
    samplePage.on('pageerror', error => errors.push(error.message));
    samplePage.on('request', request => requests.push(request.url()));
    await samplePage.route('**/render-snippet-check.html', route => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><meta charset="utf-8"></head><body>' + sample.source + '</body></html>',
    }));
    await samplePage.goto(base + '/render-snippet-check.html');
    await samplePage.locator('#qr svg').waitFor();
    assert.equal(await samplePage.locator('#qr').innerHTML(), sample.svg, 'Displayed code must reproduce the live QR exactly');
  } finally {
    await sampleContext.close();
  }
  await page.goto(base + '/generator.html');
  await page.waitForFunction(() => document.querySelector('#generatedText').textContent.endsWith(document.querySelector('#generatedCrc').textContent) && document.querySelector('#generatedChars').textContent !== '0');
  const payload = await page.locator('#generatedText').textContent();
  assert.ok(payload.startsWith('000201'));
  assert.ok(!requests.some(url => url.includes('opencv.js')), 'OpenCV should not load during startup/precache');
  const pngDownload = page.waitForEvent('download');
  await page.locator('#downloadQrPngButton').click();
  const imagePath = path.join(directory, 'payment.png');
  await (await pngDownload).saveAs(imagePath);
  const png = await fs.readFile(imagePath);
  await page.locator('#parseGeneratedTextButton').click();
  await page.waitForURL('**/parser.html#qr=*');
  assert.equal(await page.locator('#validState').textContent(), 'true');
  assert.equal(await page.locator('#payloadInput').inputValue(), payload);
  await page.locator('#generateQrButton').click();
  await page.waitForURL('**/generator.html#qr=*');
  assert.ok(!(await page.locator('#yamlInput').inputValue()).includes('"63":'));
  await page.locator('#yamlInput').fill('fields: &loop\n - "26": *loop');
  await page.waitForFunction(() => document.querySelector('#generatorStatus').classList.contains('error'));
  assert.ok(await page.locator('#downloadQrPngButton').isDisabled());
  await page.goto(base + '/checkout.html?a=12.34&l=ABC');
  await page.waitForFunction(() => document.querySelector('#checkoutChars').textContent !== '0');
  await page.locator('#amountInput').fill('15,30');
  await page.locator('#referenceInput').fill('INVOICE');
  await page.waitForURL('**/checkout.html#a=15.30&l=INVOICE');
  assert.ok((await page.locator('#checkoutText').textContent()).includes('540515.30'));
  await page.goto(base + '/parser.html?qr=' + encodeURIComponent(payload));
  await page.waitForFunction(() => document.querySelector('#validState').textContent === 'true');
  await page.locator('#fileInput').setInputFiles(imagePath);
  await page.waitForFunction(() => document.querySelector('#exportYamlButton').disabled === false && document.querySelector('#status').textContent.startsWith('Parsed.'));
  assert.equal(await page.locator('#payloadInput').inputValue(), payload);
  assert.equal(await page.locator('#videoWrap').isVisible(), false);
  assert.ok(!requests.some(url => url.includes('opencv.js')), 'A clean QR should not require OpenCV');
  // Deterministic camera frame, without accessing a real camera or granting OS permissions.
  await page.evaluate(async encoded => {
    const image = new Image(); image.src = 'data:image/png;base64,' + encoded;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 640;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 640, 640);
    ctx.drawImage(image, (640 - image.width) / 2, (640 - image.height) / 2);
    const stream = canvas.captureStream(5);
    window.testCameraTracks = stream.getTracks();
    navigator.mediaDevices.getUserMedia = async () => stream;
  }, png.toString('base64'));
  await page.locator('#startCamera').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Camera stopped after QR code parsing.');
  assert.equal(await page.locator('#videoWrap').isVisible(), false);
  assert.ok(await page.evaluate(() => window.testCameraTracks.every(track => track.readyState === 'ended')));
  // A blank raster exercises lazy WASM loading and the worker preprocessing path.
  const fallback = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 64, 64);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const scanner = emvScanner.createScanner();
    try { return await scanner.scanFile(new File([blob], 'blank.png', { type: 'image/png' }), { useOpenCv: true }); }
    finally { scanner.dispose(); }
  });
  assert.equal(fallback.code, null);
  assert.deepEqual(fallback.warnings, []);
  await page.goto(base + '/validator.html');
  const zipDownload = page.waitForEvent('download');
  await page.locator('#validatorFiles').setInputFiles([{ name: '=1+1.png', mimeType: 'image/png', buffer: png }]);
  const download = await zipDownload;
  assert.match(download.suggestedFilename(), /^emvqr-validation-report_/);
  const zipPath = path.join(directory, 'report.zip'); await download.saveAs(zipPath);
  const zip = await fs.readFile(zipPath);
  assert.ok(zip.includes(Buffer.from('report.csv')));
  assert.ok(zip.includes(Buffer.from('"\'=1+1.png"')), 'CSV formula filename must be escaped');
  assert.ok(zip.includes(Buffer.from('# qrcode: version')));
  assert.equal(await page.locator('#validatorTotal').textContent(), '1');
  assert.equal(await page.locator('#validatorValid').textContent(), '1 (100%)');
  await page.locator('#validatorDisplayFilter').selectOption('invalid');
  assert.ok((await page.locator('#validatorRows').textContent()).includes('No files match'));
  await page.locator('#validatorDisplayFilter').selectOption('all');
  // Start a slow decode, then replace it. Only the latest batch may download.
  const downloads = []; page.on('download', item => downloads.push(item));
  await page.locator('#validatorFiles').setInputFiles({ name: 'old.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><rect width="1000" height="1000" fill="white"/></svg>') });
  await page.locator('#validatorFiles').setInputFiles({ name: 'latest.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('#validatorStatus').textContent.startsWith('Done.') && document.querySelector('#validatorRows').textContent.includes('latest.png'));
  await page.waitForTimeout(1200);
  assert.equal(downloads.length, 1);
  assert.ok(!(await page.locator('#validatorRows').textContent()).includes('old.svg'));
  await page.goto(base + '/test-set.html');
  await page.locator('#testQr svg').waitFor();
  const cases = await page.evaluate(async () => emvYaml.parseTestSet(await (await fetch('samples/qr-test-set.yaml')).text()).codes);
  assert.equal(cases.length, 6);
  assert.equal(await page.locator('#testCodeSelect option').count(), 6);
  assert.ok(await page.locator('#previousTestCode').isDisabled());
  assert.equal(await page.locator('#testProgressLabel').textContent(), '0 of 6 tested');
  await page.locator('#testQr .qr-resize-handle').scrollIntoViewIfNeeded();
  const originalSize = await page.locator('#testQr').boundingBox();
  await page.mouse.move(originalSize.x + originalSize.width - 8, originalSize.y + originalSize.height - 8);
  await page.mouse.down();
  await page.mouse.move(originalSize.x + originalSize.width - 48, originalSize.y + originalSize.height - 48);
  await page.mouse.up();
  const resized = await page.locator('#testQr').boundingBox();
  assert.ok(resized.width < originalSize.width);
  assert.ok(Math.abs(resized.width - resized.height) < 1);
  const scannerTestPage = await context.newPage();
  await scannerTestPage.goto(base + '/parser.html');
  for (let index = 0; index < cases.length; index++) {
    const code = cases[index];
    assert.equal(await page.locator('#testCodePosition').textContent(), `${index + 1} / 6`);
    assert.equal(await page.locator('#testCodeTitle').textContent(), code.title);
    assert.equal(await page.locator('#testPayload').textContent(), buildPayload(code.fields).payload);
    assert.equal(await page.locator('#testValidation').textContent(), 'EMV checks passed.');
    assert.ok((await page.locator('#testYaml').textContent()).includes('"63":'));
    assert.equal(await page.locator('#testQr .qr-resize-handle').count(), 1);
    assert.equal((await page.locator('#testQr').boundingBox()).width, resized.width);
    const screenQr = await page.locator('#testQr').screenshot();
    await scannerTestPage.locator('#fileInput').setInputFiles({ name: code.id + '.png', mimeType: 'image/png', buffer: screenQr });
    await scannerTestPage.waitForFunction(expected => document.querySelector('#payloadInput').value === expected && document.querySelector('#status').textContent.startsWith('Parsed.'), buildPayload(code.fields).payload);
    assert.equal(await scannerTestPage.locator('#validState').textContent(), 'true');
    await page.locator('#testCodeTested').check();
    if (index < cases.length - 1) await page.locator('#nextTestCode').click();
  }
  await scannerTestPage.close();
  assert.ok(await page.locator('#nextTestCode').isDisabled());
  assert.equal(await page.locator('#testProgressLabel').textContent(), '6 of 6 tested - complete');
  await page.locator('#previousTestCode').click();
  assert.ok(await page.locator('#testCodeTested').isChecked());
  await page.locator('#testCodeTested').uncheck();
  assert.equal(await page.locator('#testProgressLabel').textContent(), '5 of 6 tested');
  await page.locator('#testCodeSelect').selectOption('0');
  assert.ok(await page.locator('#testCodeTested').isChecked());
  await page.locator('#resetTestProgress').click();
  assert.equal(await page.locator('#testProgressLabel').textContent(), '0 of 6 tested');
  assert.ok(!(await page.locator('#testCodeTested').isChecked()));
  await page.locator('#testCodeTested').check();
  await page.locator('#reloadTestSet').click();
  await page.waitForFunction(() => !document.querySelector('#testSetDeck').hidden && !document.querySelector('#reloadTestSet').disabled);
  assert.equal(await page.locator('#testProgressLabel').textContent(), '0 of 6 tested');
  // Malformed or edited static YAML must not leave stale codes on screen.
  const configContext = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const configPage = await configContext.newPage();
    configPage.on('pageerror', error => errors.push(error.message));
    let configuration = 'codes: []';
    await configPage.route('**/samples/qr-test-set.yaml', route => route.fulfill({ contentType: 'text/yaml', body: configuration }));
    await configPage.goto(base + '/test-set.html');
    await configPage.waitForFunction(() => document.querySelector('#testSetStatus').classList.contains('error'));
    assert.equal(await configPage.locator('#testSetDeck').isVisible(), false);
    configuration = JSON.stringify({ codes: [{ ...cases[0], title: '<img src=x onerror=alert(1)>' }] });
    await configPage.locator('#reloadTestSet').click();
    await configPage.locator('#testQr svg').waitFor();
    assert.equal(await configPage.locator('#testCodeTitle').textContent(), '<img src=x onerror=alert(1)>');
    assert.equal(await configPage.locator('#testCodeTitle img').count(), 0);
    assert.ok(await configPage.locator('#previousTestCode').isDisabled());
    assert.ok(await configPage.locator('#nextTestCode').isDisabled());
    configuration = JSON.stringify({ codes: [
      { id: 'too-large', title: 'Too large for QR', fields: Array.from({ length: 40 }, () => ({ '02': 'x'.repeat(99) })) },
      cases[0],
    ] });
    await configPage.locator('#reloadTestSet').click();
    await configPage.waitForFunction(() => document.querySelector('#testValidation').textContent.startsWith('Cannot generate'));
    assert.equal(await configPage.locator('#testQr svg').count(), 0);
    assert.ok(await configPage.locator('#testCodeTested').isDisabled());
    await configPage.locator('#nextTestCode').click();
    await configPage.locator('#testQr svg').waitFor();
    assert.equal(await configPage.locator('#testValidation').textContent(), 'EMV checks passed.');
    configuration = 'codes: [broken';
    await configPage.locator('#reloadTestSet').click();
    await configPage.waitForFunction(() => document.querySelector('#testSetStatus').classList.contains('error'));
    assert.equal(await configPage.locator('#testSetDeck').isVisible(), false);
  } finally { await configContext.close(); }
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['generator', 'checkout', 'parser', 'validator', 'render', 'test-set', 'about', 'index']) {
      await page.goto(`${base}/${name}.html`);
      if (name === 'test-set') {
        await page.locator('#testQr svg').waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      }
      await page.screenshot({ path: path.join(directory, `${name}-${width}.png`), fullPage: true });
      if (['generator', 'checkout', 'render', 'test-set'].includes(name)) assert.ok(await page.locator('.qr-output svg').count());
    }
  }
  await page.goto(base + '/parser.html');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  const newPayload = buildPayload([{ '02': 'TEST' }, { '52': '5812' }, { '53': '840' }, { '58': 'US' }, { '59': 'OFFLINE' }, { '60': 'CITY' }]).payload;
  await page.goto(base + '/parser.html?qr=' + encodeURIComponent(newPayload));
  await page.waitForFunction(() => document.querySelector('#validState').textContent === 'true');
  await page.goto(base + '/test-set.html');
  await page.locator('#testQr svg').waitFor();
  assert.equal(await page.locator('#testCodeSelect option').count(), 6);
  await page.locator('#nextTestCode').click();
  assert.equal(await page.locator('#testCodePosition').textContent(), '2 / 6');
  await context.setOffline(false);
  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => url.startsWith(base) || url.startsWith('blob:') || url.startsWith('data:')));
  console.log(`Browser regression checks passed. Screenshots and reports: ${directory}`);
} finally {
  await browser?.close(); server.close(); await once(server, 'close');
}
