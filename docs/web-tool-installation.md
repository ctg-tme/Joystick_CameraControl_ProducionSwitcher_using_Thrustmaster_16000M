# Web Tool configuration and installation

The Web Tool is an optional advanced workflow for configuring the joystick solution, installing or updating both RoomOS macros, and creating a printable operator guide. Manual configuration and installation remain documented in the main [README](../README.md#configure-the-solution-macro-manually).

Open the hosted tool at:

[Joystick Camera Control Production Switcher Web Tool](https://ctg-tme.github.io/Joystick_CameraControl_ProducionSwitcher_using_Thrustmaster_16000M/)

## When to use the Web Tool

Use it when you want to:

- build a fresh configuration without editing JavaScript;
- resume from a locally saved solution macro;
- fetch the marked configuration object from an installed macro;
- assign all 16 physical buttons with guided validation;
- install or update both required macros on a verified RoomOS device;
- generate a one-page PDF guide for the room's exact configuration.

The tool reads only the configuration object between the `JOYSTICK_CONFIG_START` and `JOYSTICK_CONFIG_END` markers. It never executes imported macro code.

## Before connecting to a device

Confirm that you have:

- a supported RoomOS device with the Thrustmaster T.16000M connected;
- administrator credentials for the device;
- the expected device serial number for exact-target verification;
- one to four camera `ConnectorId` and `ControlId` pairs;
- a free matrix output if Preview will be enabled;
- a maintenance window in which restarting every active RoomOS macro is acceptable.

## Configuration workflow

The four pages can be revisited in any order after a configuration is started.

### 1. Introduction

Choose one starting point:

- **Fresh Installation** — begin with the project's defaults.
- **Start from Macro** — upload a previously generated solution macro and recover its marked configuration.
- **Fetch Macro from Device** — connect to the exact RoomOS device and read the installed configuration.

Refreshing the browser warns before discarding workflow progress and returns to Introduction.

### 2. Macro Settings

Set the project and room identity, starting handedness, default-camera behavior, Joystick Controls panel location, Preview display behavior, camera movement speeds, and one to four camera sources.

Each camera receives a readable `ButtonAction`, such as `SelectPresenter` or `SelectCamera1`, generated from its name. The action remains separate from the camera's video `ConnectorId` and PTZ `ControlId`.

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
- does not display or log the observed serial number;
- preserves the current workflow page when the connection modal closes;
- refreshes active-call status before installation confirmation;
- blocks installation while a call is active.

The browser caches only the device address and administrator username. It does not cache the password or expected serial number. The observed serial number is used only for the in-memory comparison.

## Direct installation and update behavior

After verification and confirmation, the Web Tool:

1. retrieves the current `Thrustmaster_16000M-Class.js` source from its separate repository;
2. saves that dependency with the exact macro name `Thrustmaster_16000M-Class` and leaves it inactive;
3. saves and activates the configured `Joystick_CameraControl_ProductionSwitcher` macro;
4. restarts the RoomOS macro runtime once, restarting every active macro on the device;
5. waits for the solution macro to report that joystick initialization is ready.

The complete install or update sequence remains visible until the macro reports ready, fails, or times out.

Fetching an installed configuration is read-only. It uses `Macros Macro Get` on an already verified connection and does not restart the macro runtime.

## Configuration-specific operator guide

The Review page generates a real PDF locally in the browser. The guide is exactly one US Letter landscape page and includes:

- project and room identity;
- handedness and Preview status;
- all 16 physical button assignments;
- configured camera names;
- pan/tilt, zoom, and Precision Mode settings;
- the joystick control diagram;
- the RoomOS steps for enabling joystick operation.

When Preview is off, the guide marks Preview and Swap actions unavailable and uses a Main-only operating workflow. The PDF embeds its source assets and does not depend on remote images, fonts, a print dialog, or server-side generation.

## Run the Web Tool locally

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
