# Browser configurator and installer

This Vite application has three jobs:

1. configure one to four cameras manually or from read-only RoomOS camera discovery, and assign all 16 physical buttons;
2. recover, generate, or directly install a configured RoomOS macro;
3. generate a configuration-specific, single-page PDF operator guide for download.

The interface is organized as Introduction, Macro Settings, Button Assignments,
and Review and Installation. Introduction offers a fresh configuration, local
macro import, or a verified device fetch. It also selects the base macro Release;
the latest compatible published stable Release is selected on every fresh page
load, and that Release's manifest determines the exact dependency Release. The
selection lasts only for the current in-memory workflow. Macro Settings includes configured and discovered camera sources,
independent PAN/TILT and zoom ramp speeds, and their shared Precision Mode divisor.
The Button Assignments page reads left to right while its complete action key
opens in a modal. The workflow rail and browser history allow any visited page to
be revisited without losing the in-session configuration. Refreshing warns the
operator and starts again at Introduction. Device connection and verification
always open in a modal, preserving whichever workflow page the operator is
currently using.

## Local development

```sh
npm ci
npm run dev
```

The local server uses `http://127.0.0.1:5177/`.

Other commands:

```sh
npm test
npm run build
npm run fixtures:operator-guide
```

`fixtures:operator-guide` writes the three visual-regression PDFs under
`../tmp/pdfs/operator-guide-fixtures` and updates the representative PDF under
`../output/pdf`. Use Poppler `pdfinfo` and `pdftoppm` to verify and render them.

`prepare:assets` runs automatically before development and builds. Unit tests use
mocked GitHub metadata and asset responses instead of live network calls. Asset preparation:

- queries published stable Production Switcher Releases through the GitHub API;
- validates each simple `release-manifest.json`, Release asset SHA-256 digest,
  macro configuration markers, and JavaScript syntax;
- resolves each dependency from its exact repository, Release tag, and asset name;
- packages verified base/dependency pairs under ignored, versioned
  `public/assets/releases` paths and writes `release-catalog.json`;
- packages the repository-root macro as a local-development source during
  non-production preparation, paired with the exact dependency declared in the
  repository-root `release-manifest.json`;
- reuses a packaged download only while its digest still matches the GitHub digest;
- copies the joystick diagram into ignored `public/assets`;
- reuses the README's InfoComm live-demo image in ignored `public/assets`;

Asset preparation fails instead of falling back to checkout bytes, a branch URL,
an unverified download, or an external CORS proxy. A production build also
requires the repository-root macro's `Version:` header to match the latest
compatible published Release, while packaging the verified Release asset rather
than the checkout copy. Production preparation removes the local-development
asset and catalog entry from the generated `dist`; after a successful build, the
`postbuild` lifecycle restores development assets under `public` so a running
localhost server does not remain in production mode. The browser continues
generating its configuration-specific PDF guide; released PDF assets are not
downloaded or packaged.

When the installer is served from `localhost` or `127.0.0.1`, **Choose Release**
also includes **Local Development · Macro Version vX.Y.Z**. Selecting it uses the
working-tree `Joystick_CameraControl_ProductionSwitcher.js` and shows the Version
detected from its header while keeping the manifest-pinned dependency Release.
Run `npm run prepare:assets` after editing the root macro if the Vite server is
already running; starting `npm run dev` performs that preparation automatically.

## Release manifest and publication

Each Production Switcher Release includes a deliberately small
`release-manifest.json`:

```json
{
  "version": 1,
  "macro": "Joystick_CameraControl_ProductionSwitcher.js",
  "dependencies": [
    {
      "repo": "ctg-tme/Thrustmaster_16000M-InputDevice-Class",
      "release": "v1.0.0",
      "asset": "Thrustmaster_16000M-Class.js"
    }
  ]
}
```

Before every Production Switcher Release, update the aligned `Version:` line in
the repository-root macro. Publish the base macro and manifest as Release assets,
ensure each dependency Release contains its named asset, and then manually rerun
the GitHub Pages workflow. Rerun that workflow whenever an existing Release asset
is updated so the verified static catalog is rebuilt.

## Imported and fetched macro versions

Local uploads and read-only device fetches use the same safe ingestion path. The
installer detects the aligned macro `Version:` header independently from parsing
the marked configuration object; imported code is never executed.

- A current source selects the latest Release and needs no migration.
- An older packaged source selects its older verified base/dependency pair and
  remains fully usable until the operator chooses **Migrate to latest release**.
- An unknown or unavailable source still loads every recoverable configuration
  value and can generate the PDF operator guide. Macro download and direct device
  installation remain disabled until the operator explicitly selects a supported
  Release or migrates to latest.

Migration preserves the complete configuration and device update mode, changes
only the target base/dependency pair, revalidates locally, and performs no device
write or macro-runtime restart.

The operator guide is generated on demand with `pdf-lib`; it is not a browser
printout or an HTML file renamed as PDF. The bundled joystick diagram and the
preserved RoomOS enablement screenshot under `src/assets` are embedded directly
in the PDF, so generation has no runtime network dependency.

Generated `public/assets` and `dist` files are not committed.

## Device installation contract

The page connects directly from the browser to the RoomOS device over `wss://` using JSXAPI. The operator must first trust the device certificate in that browser.

Before installation, the page:

- opens the connection form in a modal without redirecting or changing the current workflow page;
- requires an expected device serial number and compares it without displaying the observed serial;
- opens a confirmation prompt and refreshes device call status immediately before any write;
- blocks confirmation when the device reports an active call;
- keeps every install or update step visible in a progress modal through readiness, timeout, or failure;
- warns that the macro runtime restart affects every active macro.

After the same verification, the operator may fetch the installed solution macro with a read-only `Macros Macro Get` command. Macro Settings can instead read `Video Input Connector` configuration, `Cameras` status, and video-input connector status to discover camera sources without fetching a macro or writing any RoomOS input configuration. Camera status is joined by CameraId first; connector status provides the connection fallback for Ethernet and video-only inputs that have no matching CameraId. Local uploads and fetched macros are parsed as data without executing their source.

The browser remembers only the device address and administrator username between
page loads. Passwords and expected serial numbers are not cached.

The install sequence is:

1. retrieve the external Thrustmaster class from its separate GitHub repository;
2. deactivate the existing solution macro if present;
3. save the dependency inactive;
4. save and activate the configured solution macro;
5. restart the macro runtime once;
6. monitor macro logs for ready, failure, or timeout.

The dependency source comes from the selected Release's verified, same-origin
build artifact. It is loaded before device changes begin and saved inactive using
the existing installation sequence.

## GitHub Pages

The Vite base is relative so the built app works from a repository subpath. The repository workflow builds and deploys `installer/dist` through GitHub Pages.

## Design system

The page uses a framework-free adaptation of Cisco's Magnetic Common Design
System. The generated light-theme variables are vendored unchanged under
`src/vendor/magnetic`, with their upstream MIT license and source revision.
Local component and print styling in `src/styles.css` consumes those tokens and
adds a persisted System, Light, and Dark selector.
