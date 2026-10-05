# Core API (0.10.0)

The pure EMV core has no DOM, camera, OpenCV, QR encoder, YAML or network
dependency. It is usable from browser native modules and development tools:

```js
import { buildPayload, analyzePayload, computeCRC, serialize } from './emv.mjs';
const fields = [
  { '26': [{ '00': 'COM.EXAMPLE.PAY' }, { '01': 'MERCHANT123' }] },
  { '52': '5812' }, { '53': '840' }, { '58': 'US' },
  { '59': 'EXAMPLE MERCHANT' }, { '60': 'NEW YORK' }
];
const { payload } = buildPayload(fields);
const result = analyzePayload(payload);
console.log(result.validation.valid, result.validation.diagnostics);
```

`emv.mjs` loads the same small classic-script implementations used by the
pages. They expose `globalThis.CRC16`, `emvCodec` and `emvAnalyzer` for backwards
compatibility. The core has no other side effects and never mutates supplied
field arrays. Native TypeScript declarations are in `public/emv.d.mts`.

## Contracts

- `serialize(fields)` returns TLV text in the supplied order, without defaults
  or CRC changes. Values are strings/numbers or nested field sequences. Prefer
  strings to preserve leading zeroes. Each field object has exactly one ID key.
- `buildPayload(fields, options)` inserts missing 00=01 and 01=11, removes all
  root CRC fields, and appends a computed CRC. Its returned `fields` omit the
  appended CRC, as in the previous browser helper. With `preserveExistingCrc`
  it instead requires one final correctly formatted **and matching** CRC,
  and returns that field too. Serialization is not a claim of EMV validity.
- `parseTlv(text)` returns the tree, structural diagnostics, consumed character
  count and completeness. It does not apply EMV semantic checks.
- `analyzePayload(text, {rules})` returns exact input text, UTF-8 hex/byte count,
  Unicode code-point character count, tree, and validation. Inputs are **not
  trimmed**. Offsets and TLV lengths use code points, not UTF-16 code units.
- Malformed payloads return `valid: false`. Invalid API argument types,
  oversized inputs, cycles, and malformed extension-rule results throw
  `TypeError`/`RangeError`. Limits: 16,384 code points, 1,024 nodes, depth 8.
- Diagnostics have `code`, `severity`, `message`, `path` and optional `offset`.
  Match `code`/`path`, not English messages. Warnings alone do not make an EMV
  payload invalid. The UI's 1.5-second warning is not a conformance rule.
- A malformed template retains its raw scalar `value` and any partial
  `children`; YAML exports prefer `value` so the original content is not lost.

## Scheme-Specific Rules

Rules are per call, not a mutable global registry. Each receives its own cloned
snapshot; mutations cannot change another rule or the core result. Only trusted
application code may supply rules. Example:

```js
const result = analyzePayload(payload, {
  rules: [({ tree }) => tree.some(node => node.id === '54') ? [] : [{
    code: 'example.amount.required', path: ['54'], severity: 'error',
    message: 'This integration requires an amount.'
  }]]
});
```

## Browser Rendering

`window.MerchantPresentedQrCode.render(elementOrSelector, fields, options)`
retains its synchronous signature. Load `vendor/qrcode-generator.js`,
`CRC16.js`, **`emv-codec.js` (new in 0.10.0)** and `qr-output.js`, in that order.
`qr-resizer.js` is optional. No YAML/OpenCV/decoder dependency is required.

Options: `errorCorrection` L/M/Q/H (default L), `cellSize` 1-32 (default 8),
`quietZoneModules` 0-16 (default 2, retained for compatibility), `altText`, and
`preserveExistingCrc`. A 4-module quiet zone is preferable for standard scanner
interoperability. The helper returns payload, CRC, UTF-8 hex/bytes, code-point
characters, normalized fields, SVG and QR version. It writes only into the
selected target. Input is encoded as UTF-8; no global encoder setting is left
changed after a call. `public/render.html` is a complete example.

## Field Constants

`Fields`, `AdditionalDataFields`, `LanguageFields` and `TemplateFields` are
frozen maps of stable names to two-digit string IDs. They are available on
`window.MerchantPresentedQrCode` (using the rendering dependencies above) and
as named exports from `emv.mjs` (no DOM or rendering dependencies).

```js
import { Fields as F, AdditionalDataFields as A, serialize } from './emv.mjs';
serialize([
  { [F.MERCHANT_NAME]: 'EXAMPLE MERCHANT' },
  { [F.ADDITIONAL_DATA_FIELD_TEMPLATE]: [{ [A.REFERENCE_LABEL]: 'INV-1001' }] }
]);
```

### Root: `Fields`

| Constant | ID |
| --- | --- |
| `PAYLOAD_FORMAT_INDICATOR` | `00` |
| `POINT_OF_INITIATION_METHOD` | `01` |
| `MERCHANT_CATEGORY_CODE` | `52` |
| `TRANSACTION_CURRENCY` | `53` |
| `TRANSACTION_AMOUNT` | `54` |
| `TIP_OR_CONVENIENCE_INDICATOR` | `55` |
| `VALUE_OF_CONVENIENCE_FEE_FIXED` | `56` |
| `VALUE_OF_CONVENIENCE_FEE_PERCENTAGE` | `57` |
| `COUNTRY_CODE` | `58` |
| `MERCHANT_NAME` | `59` |
| `MERCHANT_CITY` | `60` |
| `POSTAL_CODE` | `61` |
| `ADDITIONAL_DATA_FIELD_TEMPLATE` | `62` |
| `CRC` | `63` |
| `MERCHANT_INFORMATION_LANGUAGE_TEMPLATE` | `64` |

### Field 62: `AdditionalDataFields`

| Constant | ID |
| --- | --- |
| `BILL_NUMBER` | `01` |
| `MOBILE_NUMBER` | `02` |
| `STORE_LABEL` | `03` |
| `LOYALTY_NUMBER` | `04` |
| `REFERENCE_LABEL` | `05` |
| `CUSTOMER_LABEL` | `06` |
| `TERMINAL_LABEL` | `07` |
| `PURPOSE_OF_TRANSACTION` | `08` |
| `ADDITIONAL_CONSUMER_DATA_REQUEST` | `09` |

### Field 64: `LanguageFields`

| Constant | ID |
| --- | --- |
| `LANGUAGE_PREFERENCE` | `00` |
| `MERCHANT_NAME_ALTERNATE_LANGUAGE` | `01` |
| `MERCHANT_CITY_ALTERNATE_LANGUAGE` | `02` |

`TemplateFields.GLOBALLY_UNIQUE_IDENTIFIER` is `"00"` inside root merchant
account templates `26`-`51`, unreserved templates `80`-`99`, and payment system
templates `62-50`-`62-99`.

### Scheme-Specific Constants

Define your own frozen map to name a payment scheme's account slot and child
fields. No registration or alias resolver is needed:

```js
const ExamplePay = Object.freeze({
  MERCHANT_ACCOUNT_INFORMATION: '26',
  MERCHANT_ID: '01'
});
const account = {
  [ExamplePay.MERCHANT_ACCOUNT_INFORMATION]: [
    { [TemplateFields.GLOBALLY_UNIQUE_IDENTIFIER]: 'COM.EXAMPLE.PAY' },
    { [ExamplePay.MERCHANT_ID]: 'MERCHANT123' }
  ]
};
```

`ExamplePay` is a sample-local definition, not a library export or a universal
EMV mapping. It selects root slot `26` and names child `01` for this example
scheme only. Other schemes can use different slots or assign a different
meaning to child `01`. Standard and scheme-specific constants can be combined
in the same field array without modifying the library's maps.

Use `[F.MERCHANT_NAME]`, not a literal `"Merchant Name"` key. These are JavaScript
constants, not JSON/YAML aliases. They do not add context validation or change
serialization, ordering, defaults or CRC handling. Numeric keys can be mixed
with constants; normalized fields and exports keep numeric keys.

## Decoder Adapter

`emvScanner.createScanner()` returns `scanFile(file, {signal, useOpenCv})`,
`scan(imageBitmap, {signal, useOpenCv, camera})`, and `dispose()`.
One scan at a time is supported per instance. An ImageBitmap is consumed and
closed, including on failure. Abort with an `AbortController`; workers are
terminated on cancellation or a 45-second deadline. Do not pass QR text as a
URL for decoding: the adapter consumes local File/ImageBitmap objects only.

The adapter returns `{code, width, height, warnings, thumbnail}`; `thumbnail`
is a small PNG Blob for file scans (null for camera frames). `code` is null when no
QR is readable. Decoding and EMV validity are intentionally separate.

## Compatibility

0.x minor releases may tighten previously permissive validation. Existing
string error arrays and browser globals remain available. Machine consumers
should prefer the module API and diagnostics. `cbor-base64url.js` is a retained,
bounded legacy helper for a CBOR subset; it is not loaded by any app page and
is not used for URL handoffs.
