# Changelog

## 0.10.0

- Add a configurable YAML scanner test set with six labeled examples, resizing,
  expected content, manual coverage tracking and offline fallback.
- Fix UTF-8 QR generation and Unicode TLV character counting.
- Propagate nested TLV errors and use context-aware template rules.
- Add pure module API, typed contracts and isolated validation extensions.
- Add immutable named field constants to the render and module APIs.
- Upgrade js-yaml to 4.3.2; restrict YAML schema and resource usage.
- Share decoding, YAML/metadata formatting and checkout rendering.
- Add cancellable worker decoding, lazy OpenCV and bounded batch/report work.
- Prevent stale scan/report updates, CSV formulas and YAML comment injection.
- Scope offline caches, preserve unrelated caches and support new offline links.
- Use private fragment handoffs; document legacy query privacy limitations.
- Add pinned vendor records, notices, reproducible lookup generation, SRI/CSP
  checks, unit/browser regressions and CI. Static deployment remains unchanged.

## 0.9.1

Previous static parser, generator, checkout, validator and PWA baseline.
