# Security Policy

Security fixes target the current release. Older snapshots are not maintained.
Report sensitive issues using **Report a vulnerability** in the repository's
GitHub Security tab (maintainers must enable private vulnerability reporting).
Do not include real payment/customer data in public issues. If private reporting
is unavailable, ask for a private contact in an issue without exploit details.

## Trust and Privacy

Images, YAML and QR contents are untrusted. Parsing runs entirely in the browser;
there is no upload endpoint, telemetry, third-party runtime script or payment
execution. Opening a QR is not proof that a merchant or payment is trustworthy.
Keep the dependency versions and security advisories under review.

Internal handoffs and checkout links use URL **fragments**, not query strings.
Fragments are not sent in HTTP requests, but remain visible in browser history,
copied links and browser extensions. Legacy `?qr=`, `?a=` and `?l=` imports still
work; the first request can reach hosting logs before a service worker controls
the page. HTTPS and Referrer-Policy do not hide that first query from the host.
Never put secrets in shared links. Exported images/reports are local downloads
and inherit the user's device/file-sharing security.

CSV is spreadsheet-facing: potentially formula-like values get a leading
apostrophe and all cells are quoted. No CSV protection is universal across
spreadsheet re-export/import workflows. YAML and hex preserve original values;
use those for machine processing rather than stripping CSV protections.

## Deployment

Use HTTPS. Publish only `public/` as the document root, with LICENSE/NOTICE
available alongside the distribution. Serve `.js` and `.mjs` as JavaScript and
`.webmanifest` as `application/manifest+json`. Do not cache `service-worker.js`
immutably; bump its cache version when deploying changes. Updated workers wait
until existing application tabs close, so old HTML cannot load new scripts
with mismatched integrity hashes. Reopen the app to activate an update.

`public/.htaccess` supplies an Apache configuration for `mod_headers`,
`mod_mime`, and `AllowOverride FileInfo Options`. Adapt it to your virtual host
if overrides are disabled. It sets CSP, `nosniff`, `no-referrer`, camera-only
permissions and directory-listing protection. Enable HSTS only at the hosting
level after verifying HTTPS for every applicable hostname/subdomain.

HTML includes a strict script CSP with hashes for its existing inline static
configuration. Refresh it with `node tools/audit.mjs --write` after edits.
No `unsafe-inline` script allowance is used. Inline CSS remains allowed because
progress indicators, camera states and QR resizing modify element styles.

OpenCV's legacy Embind glue needs JavaScript dynamic function construction.
Only **qr-worker.js** receives `script-src 'self' blob: 'unsafe-eval'` in the
Apache header configuration. The page policy stays strict. The worker imports
the locally vendored OpenCV bundle only after checking its SHA-256 integrity.
Hosts with their own global CSP must apply the same worker-specific exception
or OpenCV will be unavailable. Never allow arbitrary URLs in the decoder loader.

Without Worker/OffscreenCanvas support, the decoder adapter uses
JavaScript fallbacks on the main thread and OpenCV is unavailable. Processing
yields between attempts; an individual synchronous decode cannot be preempted
in this fallback. The 45-second hard termination applies to worker decoding.
Serve the app over HTTP(S); browser SRI rules block its scripts when the HTML
is opened directly as `file:`. This still requires only a static HTTP server.

## Resource Limits

- YAML: 64 KiB, restricted strings/maps/sequences schema, bounded depth/nodes;
  cycles and unsupported value shapes are rejected.
- EMV core: 16,384 code points, 1,024 fields, depth 8.
- Images: 20 MiB per file, 32 megapixels after image decoding.
- Batches: 100 files, 100 MiB total. ZIP exports: 128 MiB.
- A decompression allocation can occur before browser image dimensions are
  available; these limits do not constitute a sandbox against browser bugs.

The service worker uses a deployment-path-specific cache namespace, handles
only known static assets and strips payment parameters from cache keys and
controlled fetches. OpenCV is cached only after first use; first offline use
without that asset falls back to JavaScript preprocessing. Legacy cache entries
for this deployment are migrated without deleting other apps' caches.
