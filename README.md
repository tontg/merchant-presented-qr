# EMV Merchant-Presented QR Parser and Generator

Static browser/PWA tools for **EMV Merchant-Presented QR Codes only**.

Current application version: **0.9.0**.

Live test version: <https://tontg.github.io/mpqr>

This project supports:

- parsing EMV Merchant-Presented QR payloads from image files
- parsing EMV Merchant-Presented QR payloads from a live camera stream
- validating EMV Merchant-Presented QR payload structure and CRC
- exporting parsed EMV Merchant-Presented QR content as YAML and Markdown
- generating EMV Merchant-Presented QR payloads and QR images from YAML
- generating fixed checkout QR codes from configured merchant fields
- batch validation of multiple QR images with ZIP, TXT, CSV, YAML, and Markdown reports
- offline-friendly usage as a static PWA

Scope clarification:

- supported: **EMV Merchant-Presented QR Codes**
- not supported as a primary target: EMV Consumer-Presented QR, non-EMV QR payment formats, or proprietary QR formats that are only loosely inspired by EMV

[Official EMV QR-Code overview](https://www.emvco.com/emv-technologies/qr-codes/)

[Quick introduction to EMV QR-Codes (21 slides)](https://www.w3.org/2020/Talks/emvco-qr-20201021.pdf)

Examples of payment schemes and implementations related to EMV Merchant-Presented QR:

| Scheme           | Country/Region |
| ---------------- | -------------- |
| SGQR             | Singapore      |
| PromptPay        | Thailand       |
| QR Ph            | Philippines    |
| DuitNow QR       | Malaysia       |
| VietQR           | Vietnam        |
| KHQR             | Cambodia       |
| Bharat QR        | India          |
| QRIS             | Indonesia      |
| UnionPay QR Code | China          |
| [MarocPay](https://www.bkam.ma/content/download/612251/6778239/version/1/file/LC-BKAM-2018-70.pdf)         | Morocco        |

## License

Project source code version 0.9.0 is licensed under the Apache License, Version 2.0.

Copyright 2026 Gilles Reant.

Vendored third-party dependencies retain their own licenses.

EMV® is a registered trademark exclusively owned by EMVCo, LLC.

## Features

- Parse QR codes from an image file.
- Parse QR codes from a live camera stream.
- Optional OpenCV preprocessing for camera and image decoding.
- Paste and parse raw EMV QR payload text.
- Display:
  - raw hexadecimal data
  - character count
  - byte count
  - parsed TLV arborescence
  - validation result and findings
  - YAML representation of the QR content as parsed
- Export parsed QR content as YAML.
- Generate an EMV QR code from YAML.
- Automatically compute and append `63 04` CRC-16/CCITT-FALSE when missing.
- Download generated QR code as SVG or PNG.
- Resize generated QR codes directly in the browser.
- Navigate between pages with a shared top-right hamburger menu.

## Pages

- Home: `public/index.html`
- Parser: `public/parser.html`
- About: `public/about.html`
- Generator: `public/generator.html`
- Checkout: `public/checkout.html`
- Validator: `public/validator.html`

The `About` content is centralized in `public/about.html` and is reachable from every page through the shared hamburger menu.

The app is designed to work as static files. There is no Node server, backend API, or XHR dependency for parsing or generation.

Privacy note: QR decoding, EMV TLV parsing, validation, YAML export, QR generation, and batch validation run locally in the browser. The application does not send payloads or images to a backend service.

All browser dependencies used by the application are vendored under `public/`. No `node_modules/`, `package.json`, or `package-lock.json` are required for deployment or runtime.

## Run Locally

You can open the HTML files directly in a browser:

```text
public/index.html
public/parser.html
public/generator.html
```

For camera access and PWA service-worker support, browsers require a secure context. Use HTTPS in production. `localhost` is also treated as secure by modern browsers during development.

`public/parser.html` automatically redirects from HTTP to HTTPS on non-localhost hosts.

Serve `public/` with any simple static HTTP server, such as Apache HTTPD, nginx, Caddy, or a development-only static file server.

Example Apache document root:

```text
/var/www/html/emvqr/public
```

Then open the hosted `index.html` home page, or jump directly to `parser.html` and `generator.html`.

This repository is intended to be usable as a fully static artifact. A plain HTTP server such as Apache HTTPD is enough.

## PWA

The app includes:

- `public/manifest.webmanifest`
- `public/service-worker.js`
- `public/pwa.js`
- `public/icons/app-icon.svg`

When served over HTTPS or `localhost`, the service worker caches the static application files for offline use. It only handles same-origin `GET` requests.

## Deployment

For deployment, publish the static project files only:

- `public/`
- `samples/`
- `LICENSE`
- `NOTICE`
- `README.md` if you want to include project documentation

No build step is required.

The `specifications/` directory is optional local documentation and is excluded from Git by `.gitignore`. It is not required for runtime.

Navigation between pages is provided by a shared top-right hamburger menu from `public/site-menu.js`.

## OpenCV Preprocessing

On the parser page, the **OpenCV preprocessing** checkbox affects QR-Code detection from image files and live camera frames only. It does not modify the decoded EMV payload.

When enabled, the browser first tries QR decoding on the original canvas image. It then also tries a preprocessed version using OpenCV.js:

1. Read the current canvas frame with `cv.imread(...)`.
2. Convert RGBA image data to grayscale with `cv.cvtColor(..., cv.COLOR_RGBA2GRAY, ...)`.
3. Apply a small Gaussian blur with a `3 x 3` kernel.
4. Apply adaptive Gaussian thresholding with:
   - maximum value: `255`
   - method: `cv.ADAPTIVE_THRESH_GAUSSIAN_C`
   - threshold type: `cv.THRESH_BINARY`
   - block size: `31`
   - constant: `5`
5. Run QR detection again on that thresholded image with `jsQR`.

For static image uploads, if the initial decode attempts fail, the parser redraws the image to an oversampled canvas up to `2x`, capped at `2800 px` on the longest side, and repeats the same decode path. This helps when QR modules are too small in the uploaded raster. Camera frames do not use this oversampling step for performance reasons.

This is intended to help with uneven lighting, low contrast, glare, and camera noise. If OpenCV is not loaded yet, or if preprocessing fails, the parser falls back to normal `jsQR` decoding.

## YAML Format

The generator and parser export use a shorthand TLV format:

```yaml
fields:
  - "00": "01"
  - "01": "11"
  - "26":
      - "00": "COM.EXAMPLE.PAY"
      - "01": "MERCHANT123"
  - "52": "5812"
  - "53": "840"
  - "58": "US"
  - "59": "EXAMPLE MERCHANT"
  - "60": "NEW YORK"
```

Nested arrays represent EMV template fields.

If field `63` (CRC) is omitted, the generator appends:

```text
6304 + CRC-16/CCITT-FALSE
```

If field `63` is present, it must be the final field and must contain a four-character CRC value:

```yaml
  - "63": "9EE7"
```

The default Generator page sample is configured in `public/generator.html` with the `EMVQR_GENERATOR_STATIC_FIELDS` JavaScript constant. Edit that object when the default static merchant fields need to change without touching `generator.js`.

The Checkout page fixed merchant fields are configured in `public/checkout.html` with the `EMVQR_CHECKOUT_STATIC_FIELDS` JavaScript constant. Use `{{amount}}` for the dynamic field `54` value and `{{reference}}` for the dynamic field `62-05` value; empty dynamic values are omitted from the generated QR payload.

Generated QR images on the Generator and Checkout pages can be resized in the browser by dragging the lower-right corner. The QR display remains square while resizing.

## Sample YAML

A valid sample without field `63` is available at:

- `samples/valid-emvqr-without-crc.yaml`
- `public/samples/valid-emvqr-without-crc.yaml`

## Libraries

The browser pages use local vendored copies of these libraries:

| Library | Version | License | Purpose |
| --- | --- | --- | --- |
| Local EMV TLV parser | Project source | Apache-2.0, Copyright Gilles Reant | TLV parsing, validation, and CRC-16/CCITT-FALSE |
| `jsQR` | 1.4.0 | Apache-2.0 | QR decoding from image/canvas data |
| `OpenCV.js` | 4.x | Apache-2.0 | Optional image preprocessing |
| `js-yaml` | 4.1.1 | MIT | YAML parsing |
| `qrcode-generator` | 2.0.4 | MIT | QR image generation |
| `mcc-codes` | Vendored static lookup from greggles/mcc-codes | Unlicense / public domain dedication | Merchant Category Code descriptions |

OpenCV.js is vendored locally at `public/vendor/opencv.js` to avoid cross-origin loading and allow Subresource Integrity.

The MCC lookup is vendored locally at `public/vendor/mcc-codes.js` from `greggles/mcc-codes`:

- Website: <https://github.com/greggles/mcc-codes>
- Local license text: `public/vendor/mcc-codes.LICENSE.txt`

## Specification Reference

Local PDF:

```text
specifications/EMVCo-Merchant-Presented-QR-Specification-v1.1-1.pdf
```

This local PDF is optional reference material. The application runtime does not depend on it.

Referenced as:

- Name: EMVCo Merchant-Presented QR Specification
- Version: v1.1

## Validation Scope

The parser validates practical EMV Merchant-Presented QR rules, including:

- TLV structure and declared lengths
- duplicate IDs inside each template
- mandatory merchant-presented fields
- Payload Format Indicator value
- Point of Initiation Method values
- basic format checks for MCC, currency, amount, country, merchant name, and merchant city
- CRC-16/CCITT-FALSE as final ID `63` length `04`

## Validator ZIP Report

The Validator page ZIP export includes:

- `report.txt`
- `report.csv`
- Markdown exports under `markdown/`
- YAML exports under `yaml/`
- original images under `pictures/`

`report.csv` includes the HTML table data plus additional per-file metadata such as image dimensions, QR metadata when available, CRC details, payload text and hexadecimal data, root field IDs, and the corresponding ZIP paths for the YAML and picture files.

## Project Layout

```text
public/
  index.html                 Home page with links to all tools
  parser.html                Parser page
  about.html                 Shared About page
  generator.html             Generator page
  checkout.html              Fixed-merchant checkout QR page
  validator.html             Batch image validation page
  app.js                     Parser UI logic
  emv-analyzer.js            Browser-side EMV analysis and validation
  generator.js               Generator UI logic
  checkout.js                Checkout QR logic
  validator.js               Batch validator logic
  qr-output.js               Shared QR rendering and download helpers
  qr-resizer.js              Shared QR resize helper
  site-menu.js               Shared hamburger menu
  styles.css                 Shared styles
  vendor/                    Local browser libraries and vendored MCC lookup
  samples/                   Browser-accessible sample YAML
  manifest.webmanifest       PWA manifest
  service-worker.js          PWA cache service worker
  pwa.js                     Service worker registration
  icons/                     PWA icon
samples/
  valid-emvqr-without-crc.yaml
specifications/
  EMVCo-Merchant-Presented-QR-Specification-v1.1-1.pdf
```
