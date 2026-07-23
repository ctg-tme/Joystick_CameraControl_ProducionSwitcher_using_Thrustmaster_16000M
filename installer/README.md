# Browser configurator and installer

This Vite application has three jobs:

1. configure one to four cameras and all 16 physical buttons;
2. generate or directly install a configured RoomOS macro;
3. print the same configuration as operator documentation.

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
```

`prepare:assets` runs automatically before development, tests, and builds. It:

- validates the macro configuration markers and JavaScript syntax;
- copies the current macro into ignored `public/assets`;
- extracts the joystick diagram from the existing guide;
- records the macro hash and external dependency URL in `source-manifest.json`.

Generated `public/assets` and `dist` files are not committed.

## Device installation contract

The page connects directly from the browser to the RoomOS device over `wss://` using JSXAPI. The operator must first trust the device certificate in that browser.

Before installation, the page:

- requires an expected device serial number and compares it without displaying the observed serial;
- blocks installation when the device reports an active call;
- requires acknowledgement that the macro runtime restart affects every active macro.

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
Local component and print styling in `src/styles.css` consumes those tokens.
