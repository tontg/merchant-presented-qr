# Contributing

The deployed product is the fully static `public/` directory. Do not add a
backend, production Node dependency, mandatory bundler or remote CDN runtime.
Keep parsing/validation/serialization independent of the DOM; add payment
scheme rules through the documented API instead of changing generic TLV rules.

## Development Checks

Node 22+ is optional development tooling only. No package manifest is required:

```sh
node --test tests/*.test.mjs
node tools/audit.mjs
```

After changing application scripts or inline HTML configuration, run
`node tools/audit.mjs --write` to refresh SRI and inline CSP hashes, then rerun
the checks. This is metadata maintenance, not an application build step.

For browser checks, install the pinned test dependency outside the repository:

```sh
npm install --prefix /tmp/emvqr-tests --no-save --no-package-lock playwright@1.58.2
/tmp/emvqr-tests/node_modules/.bin/playwright install chromium
PLAYWRIGHT_MODULE=/tmp/emvqr-tests/node_modules/playwright/index.mjs node tests/browser.mjs
```

On Windows use a temporary directory and PowerShell environment assignments.
Set `BROWSER_PATH` to an installed Chromium/Chrome executable if needed.
The browser runner starts and closes its own temporary loopback static fixture
server. Nothing is required or left running for production. CI runs the same
checks. Test downloads/screenshots go to an OS temporary directory.

## Changes and Releases

- Include focused tests for fixes, especially Unicode, raw-data fidelity,
  nested templates, malformed inputs, cancellation and offline operation.
- Keep fixtures synthetic. Do not commit merchant/customer payment data,
  credentials, copyrighted specification PDFs, `node_modules`, or reports.
- Document public contracts in `docs/API.md`; update `docs/VALIDATION.md` when
  adding specification checks. Prefer stable diagnostic codes.
- Follow `public/vendor/PATCHES.md` for dependencies and generated data.
- Update README, About, NOTICE and CHANGELOG together for releases. Bump the
  scoped service-worker cache version for every deployed asset change.
- Run unit tests, integrity audit and browser tests; test HTTPS camera access
  and installed iOS PWA behavior on an actual device before release.
- Publish `public/`, its vendor notices, LICENSE and NOTICE. Never publish
  the repository root as the website document root.

Contributions to project code are under Apache-2.0. Retain third-party notices
and clearly record vendored modifications. See SECURITY.md for private reports.
