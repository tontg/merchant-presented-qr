// Copyright 2026 Gilles Reant. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { analyzePayload, buildPayload, serialize, computeCRC, Fields, AdditionalDataFields, LanguageFields, TemplateFields } from '../public/emv.mjs';
import '../public/emv-format.js';
const require = createRequire(import.meta.url);
globalThis.jsyaml = require('../public/vendor/js-yaml.min.js');
await import('../public/emv-yaml.js');
const base = [{ '26': [{ '00': 'COM.EXAMPLE.PAY' }, { '01': 'MERCHANT123' }] }, { '52': '5812' }, { '53': '840' }, { '58': 'US' }, { '59': 'EXAMPLE MERCHANT' }, { '60': 'NEW YORK' }];

function rendererContext() {
  class Element {}
  const context = { window: null, Element, qrcode: require('../public/vendor/qrcode-generator.js'), TextEncoder, emvCodec, emvCore: globalThis.CRC16 };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(new URL('../public/qr-output.js', import.meta.url), 'utf8'), context);
  return context;
}

function decodeRenderedSvg(svg) {
  const size = Number(svg.match(/viewBox="0 0 (\d+)/)[1]);
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (const match of svg.matchAll(/M(\d+),(\d+)l(\d+),0 0,(\d+) -(\d+),0 0,-(\d+)z/g)) {
    const [, x, y, w, h] = match.map(Number);
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) pixels.fill(0, (row * size + col) * 4, (row * size + col) * 4 + 3);
  }
  return require('../public/vendor/jsQR.js')(pixels, size, size);
}

test('all six scanner samples generate valid deterministic payloads and decodable QR images', () => {
  const set = emvYaml.parseTestSet(fs.readFileSync(new URL('../public/samples/qr-test-set.yaml', import.meta.url), 'utf8'));
  const context = rendererContext();
  const levels = new Set(), payloads = new Set();
  assert.equal(set.codes.length, 6);
  for (const code of set.codes) {
    const result = context.MerchantPresentedQrCode.render(new context.Element(), code.fields, { errorCorrection: code.errorCorrection });
    const decoded = decodeRenderedSvg(result.svg);
    assert.ok(decoded, code.id);
    assert.equal(decoded.data, result.payload, code.id);
    assert.equal(emvFormat.metadata(decoded).errorCorrectionLevel, code.errorCorrection);
    assert.equal(buildPayload(code.fields).payload, result.payload);
    const analysis = analyzePayload(decoded.data);
    assert.equal(analysis.validation.valid, true, code.id + ': ' + analysis.validation.errors.join('; '));
    assert.deepEqual(analysis.validation.warnings, []);
    if (code.id.endsWith('-language')) assert.ok(result.bytes > result.characters);
    levels.add(code.errorCorrection); payloads.add(result.payload);
  }
  assert.equal(payloads.size, 6);
  assert.deepEqual([...levels].sort(), ['H', 'L', 'M', 'Q']);
});

test('test-set YAML rejects invalid configuration and retains bounded field parsing', () => {
  const code = { id: 'sample', title: 'Example', fields: base };
  const parse = value => emvYaml.parseTestSet(JSON.stringify(value));
  assert.equal(parse({ codes: [code] }).codes[0].errorCorrection, 'L');
  for (const value of [null, [], {}, { codes: [] }, { codes: Array(51).fill(code) },
    { codes: [code, code] }, { codes: [code], unknown: 'x' },
    { codes: [{ ...code, errorCorrection: 'invalid' }] },
    { codes: [{ ...code, id: '../unsafe' }] },
    { codes: [{ ...code, title: '' }] },
    { codes: [{ ...code, title: 'x'.repeat(121) }] },
    { codes: [{ ...code, description: 'x'.repeat(501) }] },
    { codes: [{ ...code, unknown: 'x' }] },
    { codes: [{ ...code, fields: [{ '59': 'x'.repeat(100) }] }] }]) assert.throws(() => parse(value));
  assert.throws(() => emvYaml.parseTestSet('x'.repeat(65537)));
  assert.throws(() => emvYaml.parseTestSet('codes:\n - id: loop\n   title: Loop\n   fields: &a [{"26": *a}]'));
  assert.throws(() => emvYaml.parseTestSet('codes: !!omap []'));
  assert.throws(() => emvYaml.parseTestSet('codes: []\ncodes: []'));
});

test('field constants are frozen, correctly mapped and shared with the render API', () => {
  const api = rendererContext().MerchantPresentedQrCode;
  const groups = { Fields, AdditionalDataFields, LanguageFields, TemplateFields };
  assert.deepEqual(Fields, {
    PAYLOAD_FORMAT_INDICATOR: '00', POINT_OF_INITIATION_METHOD: '01',
    MERCHANT_CATEGORY_CODE: '52', TRANSACTION_CURRENCY: '53', TRANSACTION_AMOUNT: '54',
    TIP_OR_CONVENIENCE_INDICATOR: '55', VALUE_OF_CONVENIENCE_FEE_FIXED: '56',
    VALUE_OF_CONVENIENCE_FEE_PERCENTAGE: '57', COUNTRY_CODE: '58', MERCHANT_NAME: '59',
    MERCHANT_CITY: '60', POSTAL_CODE: '61', ADDITIONAL_DATA_FIELD_TEMPLATE: '62',
    CRC: '63', MERCHANT_INFORMATION_LANGUAGE_TEMPLATE: '64',
  });
  assert.deepEqual(AdditionalDataFields, {
    BILL_NUMBER: '01', MOBILE_NUMBER: '02', STORE_LABEL: '03', LOYALTY_NUMBER: '04',
    REFERENCE_LABEL: '05', CUSTOMER_LABEL: '06', TERMINAL_LABEL: '07',
    PURPOSE_OF_TRANSACTION: '08', ADDITIONAL_CONSUMER_DATA_REQUEST: '09',
  });
  assert.deepEqual(LanguageFields, { LANGUAGE_PREFERENCE: '00', MERCHANT_NAME_ALTERNATE_LANGUAGE: '01', MERCHANT_CITY_ALTERNATE_LANGUAGE: '02' });
  assert.deepEqual(TemplateFields, { GLOBALLY_UNIQUE_IDENTIFIER: '00' });
  for (const [name, group] of Object.entries(groups)) {
    assert.equal(api[name], group);
    assert.ok(Object.isFrozen(group));
    const key = Object.keys(group)[0];
    assert.throws(() => { group[key] = '99'; }, TypeError);
    assert.throws(() => { group.UNKNOWN = '99'; }, TypeError);
  }
});

test('named and numeric fields produce identical QR payloads, SVGs and ordered exports', () => {
  const F = Fields, A = AdditionalDataFields, L = LanguageFields, T = TemplateFields;
  const named = [
    { '26': [{ [T.GLOBALLY_UNIQUE_IDENTIFIER]: 'COM.EXAMPLE.PAY' }, { '01': 'MERCHANT123' }] },
    { [F.MERCHANT_CATEGORY_CODE]: '5812' }, { [F.TRANSACTION_CURRENCY]: '840' },
    { [F.COUNTRY_CODE]: 'US' }, { [F.MERCHANT_NAME]: 'EXAMPLE MERCHANT' }, { [F.MERCHANT_CITY]: 'NEW YORK' },
    { [F.ADDITIONAL_DATA_FIELD_TEMPLATE]: [{ [A.REFERENCE_LABEL]: 'INV-1001' }] },
    { [F.MERCHANT_INFORMATION_LANGUAGE_TEMPLATE]: [{ [L.LANGUAGE_PREFERENCE]: 'en' }, { [L.MERCHANT_NAME_ALTERNATE_LANGUAGE]: 'EXAMPLE' }] },
  ];
  const numeric = [...base, { '62': [{ '05': 'INV-1001' }] }, { '64': [{ '00': 'en' }, { '01': 'EXAMPLE' }] }];
  const snapshot = JSON.stringify(named);
  assert.deepEqual(named, numeric);
  assert.equal(serialize(named), serialize(numeric));
  const context = rendererContext();
  const first = context.MerchantPresentedQrCode.render(new context.Element(), named);
  const second = context.MerchantPresentedQrCode.render(new context.Element(), numeric);
  assert.equal(first.payload, second.payload);
  assert.equal(first.crc, second.crc);
  assert.equal(first.svg, second.svg);
  assert.deepEqual(first.fields, [{ '00': '01' }, { '01': '11' }, ...numeric]);
  const parsed = analyzePayload(first.payload);
  assert.equal(parsed.validation.valid, true);
  const exported = emvYaml.parse(emvFormat.yamlExport(parsed));
  assert.deepEqual(exported, [...first.fields, { '63': first.crc }]);
  const explicit = [{ [F.PAYLOAD_FORMAT_INDICATOR]: '01' }, { [F.POINT_OF_INITIATION_METHOD]: '12' }, ...named, { [F.CRC]: '0000' }];
  const rebuilt = buildPayload(explicit);
  assert.ok(rebuilt.payload.startsWith('000201010212'));
  assert.equal(analyzePayload(rebuilt.payload).validation.valid, true);
  assert.equal(buildPayload(exported, { preserveExistingCrc: true }).payload, first.payload);
  assert.equal(JSON.stringify(named), snapshot);
  assert.throws(() => buildPayload([{ 'Merchant Name': 'EXAMPLE' }]), /Field IDs/);
  assert.throws(() => buildPayload([{ [F.MERCHANT_NAM]: 'EXAMPLE' }]), /Field IDs/);
});

test('CRC check vector, defaults and nonmutating serialization', () => {
  assert.equal(computeCRC('123456789'), '29B1');
  const saved = JSON.stringify(base), result = buildPayload(base);
  assert.ok(result.payload.startsWith('000201010211'));
  assert.equal(analyzePayload(result.payload).validation.valid, true);
  assert.equal(JSON.stringify(base), saved);
});
test('nested duplicate, malformed templates and missing GUI are invalid', () => {
  for (const value of [[{ '05': 'A' }, { '05': 'B' }], '0199X']) {
    const result = analyzePayload(buildPayload([...base, { '62': value }]).payload);
    assert.equal(result.validation.valid, false);
    assert.ok(result.validation.diagnostics.some(item => item.code.startsWith('tlv.') && item.path[0] === '62'));
    assert.equal(emvFormat.treeFields(result.tree).at(-2)['62'], typeof value === 'string' ? value : serialize(value));
  }
  assert.equal(analyzePayload(buildPayload([{ '26': [{ '01': 'MISSING GUI' }] }, ...base.slice(1)]).payload).validation.valid, false);
});
test('context-specific values and legacy merchant IDs stay opaque', () => {
  const result = analyzePayload(buildPayload([...base, { '62': [{ '05': '000201' }] }, { '02': '000201' }]).payload);
  assert.equal(result.validation.valid, true);
  assert.equal(result.tree.find(node => node.id === '62').children[0].value, '000201');
  assert.equal(result.tree.find(node => node.id === '02').value, '000201');
  const nested = analyzePayload(buildPayload([...base, { '62': [{ '62': [{ '00': 'EXAMPLE' }, { '01': '000201' }] }] }]).payload);
  assert.equal(nested.tree.find(node => node.id === '62').children[0].children[1].name, 'Context Specific Data');
});
test('raw text is not trimmed, lengths count Unicode code points', () => {
  const payload = buildPayload([...base, { '64': [{ '00': 'zh' }, { '01': '\u4e2d\u6587\ud83d\ude00' }] }]).payload;
  const result = analyzePayload(payload);
  assert.equal(result.validation.valid, true);
  assert.equal(result.tree.find(node => node.id === '64').children[1].length, 3);
  assert.equal(analyzePayload(payload + '\r').rawText, payload + '\r');
  assert.equal(analyzePayload(payload + '\r').validation.valid, false);
});
test('QR images round-trip ASCII, Chinese, Arabic and supplementary Unicode', () => {
  const context = rendererContext();
  for (const value of ['ASCII', '\u4e2d\u6587', '\u0645\u062a\u062c\u0631', '\ud83d\ude00']) {
    const rendered = context.MerchantPresentedQrCode.render(new context.Element(), [...base, { '64': [{ '00': 'zh' }, { '01': value }] }]);
    // Read the actual SVG generated by render(), not a separately encoded QR.
    const decoded = decodeRenderedSvg(rendered.svg);
    assert.ok(decoded, 'SVG raster should decode');
    assert.equal(decoded.data, rendered.payload);
    assert.equal(analyzePayload(decoded.data).validation.valid, true);
  }
});
test('custom validation rules receive isolated data and return structured diagnostics', () => {
  const result = analyzePayload(buildPayload(base).payload, { rules: [data => {
    data.tree.length = 0;
    return [{ code: 'sample.rule', path: ['26'], severity: 'warning', message: 'Example warning.' }];
  }] });
  assert.ok(result.tree.length);
  assert.equal(result.validation.warnings.at(-1), 'Example warning.');
});
test('YAML limits, restricted schema, cycles and aliases', () => {
  assert.deepEqual(emvYaml.parse('fields:\n - 00: 01\n'), [{ '00': '01' }]);
  assert.throws(() => emvYaml.parse('fields: &a\n - "26": *a'));
  assert.throws(() => emvYaml.parse('fields: !!omap []'));
  assert.throws(() => emvYaml.parse('x'.repeat(65537)));
  assert.throws(() => emvYaml.parse('['.repeat(100) + ']'.repeat(100)));
  assert.throws(() => emvYaml.parse('fields: [{"00": {<<: {a: b}}}]'));
  const aliasBomb = 'fields: &a\n - "26": &b [' + '*a,'.repeat(100) + ']';
  assert.throws(() => emvYaml.parse(aliasBomb));
});
test('CSV formulas are text, headers cannot break out of YAML comments', () => {
  for (const value of ['=1+1', '+CMD', '-1+2', '@SUM(A1)', '\t=1', '  =1', '\uff1d1']) assert.ok(emvFormat.csvValue(value).startsWith('"\''));
  assert.equal(emvFormat.comment('x\ry\nz\u2028end'), 'x y z end');
  const result = analyzePayload(buildPayload(base).payload);
  result.validation.warnings.push('WARNING\rfields: malicious\u0000');
  assert.deepEqual(emvYaml.parse(emvFormat.yamlExport(result)), emvFormat.treeFields(result.tree));
});
test('CRC preservation verifies the checksum; export retains explicit CRC', () => {
  const fields = emvFormat.treeFields(analyzePayload(buildPayload(base).payload).tree);
  assert.equal(buildPayload(fields, { preserveExistingCrc: true }).payload, serialize(fields));
  fields.at(-1)['63'] = '0000';
  assert.throws(() => buildPayload(fields, { preserveExistingCrc: true }));
});
test('QR metadata preserves L=0 and fragments take precedence over query imports', () => {
  assert.equal(emvFormat.metadata({ version: 4, errorCorrectionLevel: 0 }).errorCorrectionLevel, 'L');
  assert.equal(emvFormat.qrParameter({ hash: '#qr=A%2BB', search: '?qr=wrong' }), 'A+B');
  assert.equal(emvFormat.qrParameter({ hash: '', search: '?qr=A%2BB' }), 'A+B');
});
test('empty fields warn and empty template arrays export as arrays', () => {
  const result = analyzePayload(buildPayload([...base, { '62': [{ '01': '' }] }]).payload);
  assert.ok(result.validation.warnings.some(text => text.includes('62-01')));
  assert.deepEqual(emvYaml.parse(emvFormat.fieldsYaml([{ '62': [] }], 0).join('\n')), [{ '62': [] }]);
});
test('core resource limits and unsupported object values fail explicitly', () => {
  assert.throws(() => analyzePayload('x'.repeat(40000)), RangeError);
  assert.throws(() => buildPayload([{ '26': { bad: true } }]), TypeError);
  const cyclic = []; cyclic.push({ '26': cyclic });
  assert.throws(() => buildPayload(cyclic), RangeError);
  assert.throws(() => buildPayload([{ '59': '\ud800' }]), TypeError);
});
test('legacy CBOR helper rejects malformed input and preserves __proto__ as data', async () => {
  await import('../public/cbor-base64url.js');
  const input = JSON.parse('{"__proto__":{"polluted":true},"value":"ok"}');
  const output = cborBase64Url.decode(cborBase64Url.encode(input));
  assert.equal(Object.getPrototypeOf(output), Object.prototype);
  assert.equal(output.polluted, undefined);
  assert.equal(output.__proto__.polluted, true);
  assert.throws(() => cborBase64Url.decodeFromCborBytes(Uint8Array.of(0x78)));
  assert.throws(() => cborBase64Url.decodeFromCborBytes(Uint8Array.of(0x63, 65)));
  assert.throws(() => cborBase64Url.decodeFromCborBytes(Uint8Array.of(0x61, 255)));
  const cyclic = []; cyclic.push(cyclic); assert.throws(() => cborBase64Url.encode(cyclic));
});
