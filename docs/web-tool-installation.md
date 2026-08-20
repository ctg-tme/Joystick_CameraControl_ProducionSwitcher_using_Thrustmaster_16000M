# Web Installer configuration and installation

The Web Installer is the guided workflow for configuring the joystick solution, installing or updating both RoomOS macros, and creating a printable operator guide. This document covers its advanced device and deployment details. Manual configuration and installation remain documented in the main [README](../README.md#configure-the-solution-macro-manually).

Open the hosted tool at:

[Joystick Camera Control Production Switcher Web Installer](https://ctg-tme.github.io/Joystick_CameraControl_ProductionSwitcher_using_Thrustmaster_16000M/)

## When to use the Web Installer

Use it when you want to:

- build a fresh configuration without editing JavaScript;
- resume from a locally saved solution macro;
- fetch the marked configuration object from an installed macro;
- discover configured camera inputs and their connection status;
- assign all 16 physical buttons with guided validation;
- install or update both required macros on a verified RoomOS device;
- generate a one-page PDF guide for the room's exact configuration.

The tool reads only the configuration object between the `JOYSTICK_CONFIG_START` and `JOYSTICK_CONFIG_END` markers. It never executes imported macro code.

## Before connecting to a device

Confirm that you have:

- a supported RoomOS device with the Thrustmaster T.16000M connected;
- administrator credentials for the device;
- the expected device serial number for exact-target verification;
- one to four camera `ConnectorId` values and optional Camera ControlIds;
- a free matrix output if Preview will be enabled;
- a maintenance window in which restarting every active RoomOS macro is acceptable.

## Configuration workflow

The four pages can be revisited in any order after a configuration is started.

### 1. Introduction

Choose one starting point:

- **Fresh Installation** — begin with the project's defaults.
- **Start from Macro** — upload a previously generated solution macro and recover its marked configuration.
- **Fetch Macro from Device** — connect to the exact RoomOS device and read the installed configuration.

Choose the **Base macro release** beside the heading. A fresh page always starts
with the latest compatible published stable Release; the choice is kept only in
the current workflow session. The selected base Release's manifest supplies its
exact dependency, so there is no separate dependency selector.

Uploads and device fetches both detect the macro's aligned `Version:` header:

- Current sources select the latest Release and are ready to review.
- Older packaged sources select their matching verified Release pair and offer
  **Migrate to latest release** while remaining usable before migration.
- Unknown or unavailable sources retain every valid recovered setting and can
  still generate the operator guide. Macro download and direct installation are
  disabled until a supported Release is selected explicitly or migration is
  confirmed.

Migration preserves the complete configuration, switches only the verified base
template and dependency pair, and makes no device write or macro-runtime restart.
An installed source remains in update mode after migration.

Refreshing the browser warns before discarding workflow progress and returns to Introduction.

### 2. Macro Settings

Set the project and room identity, starting handedness, default-camera behavior, Joystick Controls panel location, Preview display behavior, camera movement speeds, and one to four camera sources.

Configured cameras remain editable in a two-by-two card grid on the left, with the narrower **Discovered Cameras** pane on the right; the layout stacks at smaller widths. Discovery reads every video input connector whose `InputSourceType` is `camera`, then joins its CameraId to `xStatus Cameras` for connection and model information. When connector configuration omits a CameraId, discovery reserves camera-status entries already claimed by configured CameraIds and uses the `id` of the next unmatched `xStatus Cameras` entry as the backup ControlId. If no camera-status entry remains, discovery leaves ControlId Disabled and reports camera status as unavailable. Only `xStatus Cameras` determines whether a discovered camera is connected: an explicit `True` is connected, an explicit `False` is disconnected, and missing or `Unknown` status is unavailable. Connected sources are listed first. A verified connection is reused; otherwise **Discover Cameras** opens the same exact-device connection prompt without fetching the macro. Results are refreshed once per connection, can be refreshed manually, and are cleared when that connection closes.

Discovery never changes the RoomOS video-input name or any other input configuration. Disconnected cameras and sources whose device CameraControl Mode is Off remain addable with warnings. ConnectorIds are unique: adding a matching connector updates its discovered name and ControlId while preserving its default-camera and joystick-button relationships. Multiple sources may share a ControlId.

Each camera receives a readable `ButtonAction`, such as `SelectPresenter` or `SelectCamera1`, generated from its name. The action remains separate from the camera's video `ConnectorId` and optional PTZ `ControlId`. Camera ControlId offers `1` through `15` plus **Disabled (USB/ThirdParty)**; Disabled generates `ControlId: null` so switching continues while joystick camera movement becomes a safe no-op.

### 3. Button Assignments

Assign every physical button using the left-to-right control, selection, and result layout. The page:

- exposes built-in and configured-camera action definitions;
- marks default assignments;
- prevents duplicate camera assignments;
- allows individual defaults or the entire default layout to be restored;
- keeps No Action explicit for unused buttons;
- accounts for the configured left/right handedness.

### 4. Review and Installation

Review the generated configuration object and choose one of these outcomes:

- download the configured solution macro;
- install or update the macros directly on a verified RoomOS device;
- download the configuration-specific PDF operator guide.

## Connecting and verifying the device

Every connection starts in a secure modal without leaving the current workflow page. Enter the device address, administrator username and password, and expected serial number.

The tool:

- connects to the device and compares its serial number with the expected value;
- uses the same verified connection for camera discovery without fetching the macro;
- does not display or log the observed serial number;
- preserves the current workflow page when the connection modal closes;
- refreshes active-call status before installation confirmation;
- blocks installation while a call is active.

The browser caches only the device address and administrator username. It does not cache the password or expected serial number. The observed serial number is used only for the in-memory comparison.

## Direct installation and update behavior

After verification and confirmation, the Web Installer:

1. loads the selected base Release's verified, packaged `Thrustmaster_16000M-Class.js` dependency;
2. saves that dependency with the exact macro name `Thrustmaster_16000M-Class` and leaves it inactive;
3. saves and activates the configured `Joystick_CameraControl_ProductionSwitcher` macro;
4. restarts the RoomOS macro runtime once, restarting every active macro on the device;
5. waits for the solution macro to report that joystick initialization is ready.

The complete install or update sequence remains visible until the macro reports ready, fails, or times out.

Fetching an installed configuration is read-only. It uses `Macros Macro Get` on an already verified connection and does not restart the macro runtime. Camera discovery is also read-only: it reads video-input configuration and camera status without writing the input name, CameraId, CameraControl Mode, or any other device setting.

## Configuration-specific operator guide

The Review page generates a real PDF locally in the browser. The guide is exactly one US Letter landscape page and includes:

- project and room identity;
- handedness and Preview status;
- all 16 physical button assignments;
- configured camera names;
- video-only labels for sources whose Camera ControlId is Disabled;
- pan/tilt, zoom, and Precision Mode settings;
- the joystick control diagram;
- the RoomOS steps for enabling joystick operation.

When Preview is off, the guide marks Preview and Swap actions unavailable and uses a Main-only operating workflow. The PDF embeds its source assets and does not depend on remote images, fonts, a print dialog, or server-side generation.

## Run the Web Installer locally

The tool is a Vite application under `installer/`.

```sh
cd installer
npm ci
npm test
npm run dev
```

Open `http://127.0.0.1:5177/`.

Create a production build with:

```sh
npm run build
```

See the [installer development README](../installer/README.md) for asset preparation, test fixtures, and the device-installation contract.

## GitHub Pages deployment

Enable GitHub Pages with **GitHub Actions** as the source. [`.github/workflows/deploy-installer.yml`](../.github/workflows/deploy-installer.yml) tests and builds the installer when `main` changes, then publishes `installer/dist`.

The generated `installer/public/assets` and `installer/dist` directories are not committed.

Each Production Switcher Release must include the repository-root
`release-manifest.json`. Its intentionally small contract contains only manifest
`version`, base macro asset name, and dependency `repo`, exact `release`, and
`asset` name. GitHub metadata supplies publication state, dates, URLs, and
SHA-256 digests during the static build.

Before publishing every base Release, update the existing aligned `Version:`
header in `Joystick_CameraControl_ProductionSwitcher.js`. After publishing or
updating Release assets, manually rerun the Pages workflow so it rebuilds the
verified same-origin Release catalog. Released PDF guides are not packaged; the
browser continues generating the room-specific guide.
