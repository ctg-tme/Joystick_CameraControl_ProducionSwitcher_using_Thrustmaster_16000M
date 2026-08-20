# Browser configurator and installer

This Vite application has three jobs:

1. configure one to four cameras and all 16 physical buttons;
2. recover, generate, or directly install a configured RoomOS macro;
3. generate a configuration-specific, single-page PDF operator guide for download.

The interface is organized as Introduction, Macro Settings, Button Assignments,
and Review and Installation. Introduction offers a fresh configuration, local
macro import, or a verified device fetch. Macro Settings includes camera sources,
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

`prepare:assets` runs automatically before development, tests, and builds. It:

- validates the macro configuration markers and JavaScript syntax;
- copies the current macro into ignored `public/assets`;
- copies the joystick diagram into ignored `public/assets`;
- records the macro hash and external dependency URL in `source-manifest.json`.

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

After the same verification, the operator may fetch the installed solution macro with a read-only `Macros Macro Get` command. Local uploads and fetched macros are parsed as data without executing their source.

The browser remembers only the device address and administrator username between
page loads. Passwords and expected serial numbers are not cached.

The install sequence is:

1. retrieve the external Thrustmaster class from its separate GitHub repository;
2. deactivate the existing solution macro if present;
3. save the dependency inactive;
4. save and activate the configured solution macro;
5. restart the macro runtime once;
6. monitor macro logs for ready, failure, or timeout.

The dependency source is fetched only when the operator starts installation. It is not copied into this repository.

## GitHub Pages

The Vite base is relative so the built app works from a repository subpath. The repository workflow builds and deploys `installer/dist` through GitHub Pages.

## Design system

The page uses a framework-free adaptation of Cisco's Magnetic Common Design
System. The generated light-theme variables are vendored unchanged under
`src/vendor/magnetic`, with their upstream MIT license and source revision.
Local component and print styling in `src/styles.css` consumes those tokens and
adds a persisted System, Light, and Dark selector.
