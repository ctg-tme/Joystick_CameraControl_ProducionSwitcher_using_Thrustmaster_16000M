# Joystick Camera Control Production Switcher

A standalone RoomOS solution that uses a Thrustmaster T.16000M joystick to stage, control, and swap up to four camera sources between Main and Preview.

The solution includes:

- `Joystick_CameraControl_ProductionSwitcher.js` — the macro and its self-installed `Joystick Demo` UI panel.
- `installer/` — the browser configurator, device installer, and printable operator guide.
- `Guides/thrustmaster16000m-camera-guide.html` — the original extracted control reference.
- `CONTEXT.md` — canonical operator terminology.

The macro is extracted from the InfoComm 2026 demo without the demo's unrelated lighting, web, presentation, video-composition, standby, analytics, or HTTP-client behavior.

## Configure and install in the browser

The browser configurator is the recommended path:

1. Add one to four cameras. A readable camera `ButtonAction`, such as `SelectQuadCamera`, is generated from each name.
2. Assign every physical button with a dropdown. Use `Unassigned` for buttons that intentionally do nothing.
3. Review or download the generated macro.
4. Enter the exact RoomOS device address, administrator credentials, and expected serial number.
5. Connect and verify the device, acknowledge the macro runtime restart, then install.
6. Print the same mapping as an operator guide.

The installer:

- verifies the expected serial number and blocks installation during an active call;
- loads the Thrustmaster class from its separate repository and saves it inactive;
- saves and activates the configured solution macro;
- restarts the RoomOS macro runtime once, which restarts every active macro;
- waits for the solution macro to report that joystick initialization is ready.

Credentials remain in the browser session. The observed device serial is used only for comparison and is not displayed or logged.

To run locally:

```sh
cd installer
npm install
npm run dev
```

Open `http://127.0.0.1:5177/`.

For GitHub Pages, enable Pages with **GitHub Actions** as the source. `.github/workflows/deploy-installer.yml` tests and builds the installer on changes to `main`, then publishes `installer/dist`.

## External class dependency

The Thrustmaster input-device class remains a separate project and is not copied or committed here:

- [Thrustmaster_16000M-InputDevice-Class](https://github.com/ctg-tme/Thrustmaster_16000M-InputDevice-Class)

The macro expects the exact module name `Thrustmaster_16000M-Class`:

```js
import { ThrustMaster16000M_JoyStick } from './Thrustmaster_16000M-Class';
```

The browser installer retrieves that source at install time. For a manual installation, first install `Thrustmaster_16000M-Class.js` with the exact macro name `Thrustmaster_16000M-Class`, then import the solution macro.

## Configuration model

The editable `config` block is near the top of the macro and is bounded by `JOYSTICK_CONFIG_START` and `JOYSTICK_CONFIG_END` markers.

`ButtonAction` is the common vocabulary for anything assignable to a button. It may be:

- a built-in action from the manifest below;
- a generated camera-selection action from `config.cameras`;
- `Unassigned`, the explicit no-op.

All 16 logical button IDs must appear in `config.controls`, including unused buttons:

```js
controls: {
  STICK_TRIGGER: 'PrecisionMode',
  STICK_SOUTH: 'Unassigned',
  STICK_EAST: 'SwapMainPreview',
  STICK_WEST: 'SwapMainPreview',
  BASE_LEFT_1: 'ControlMain',
  BASE_LEFT_2: 'SelfviewWindowed',
  BASE_LEFT_3: 'SelfviewFullscreen',
  BASE_LEFT_6: 'Unassigned',
  BASE_LEFT_5: 'SelfviewOff',
  BASE_LEFT_4: 'ControlPreview',
  BASE_RIGHT_3: 'SelectRvptzLeft',
  BASE_RIGHT_2: 'SelectQuadCamera',
  BASE_RIGHT_1: 'Unassigned',
  BASE_RIGHT_4: 'Unassigned',
  BASE_RIGHT_5: 'SelectRvptzRight',
  BASE_RIGHT_6: 'SelectUsbCamera'
}
```

Built-in actions may be unused or assigned to multiple buttons. Each configured camera action must be assigned to exactly one button.

### Control manifest

| `ButtonAction` | What it does |
|---|---|
| `Unassigned` | Explicitly leaves the button without an operator action |
| `PrecisionMode` | Reduces camera movement speed while the assigned button is held |
| `SwapMainPreview` | Swaps the Main and Preview camera sources |
| `ControlMain` | Assigns joystick movement to the camera currently on Main |
| `ControlPreview` | Assigns joystick movement to the camera currently on Preview |
| `SelfviewWindowed` | Shows selfview as an inset on the first monitor |
| `SelfviewFullscreen` | Shows fullscreen selfview on the first monitor |
| `SelfviewOff` | Hides selfview |

### Camera actions

`config.cameras` is an array of one to four definitions:

```js
joystick: {
  StartingHand: 'right',
  DefaultCameraAction: 'SelectQuadCamera',
  Camera: {
    BaseRampSpeed: 12,
    SlowModeDivisor: 2
  }
},
cameras: [
  {
    ButtonAction: 'SelectQuadCamera',
    Name: 'Quad Camera',
    ConnectorId: '1',
    ControlId: '1'
  },
  {
    ButtonAction: 'SelectRvptzLeft',
    Name: 'RVPTZ Left',
    ConnectorId: '8',
    ControlId: '8'
  }
]
```

Every camera `ButtonAction` must be non-empty, unique, different from every built-in action, and assigned exactly once in `config.controls`. `DefaultCameraAction` must reference one configured camera action.

The browser page generates these identifiers from camera names and keeps camera assignments unique automatically.

### Default physical button map

The guide button number is stable. The logical class ID changes for the base buttons when the physical handedness switch changes; the browser configurator resolves that mapping automatically.

| Guide button | Physical control | Right-handed logical ID | Default `ButtonAction` |
|---:|---|---|---|
| 1 | Trigger | `STICK_TRIGGER` | `PrecisionMode` |
| 2 | Lower center stick button | `STICK_SOUTH` | `Unassigned` |
| 3 | Left stick-side button | `STICK_EAST` | `SwapMainPreview` |
| 4 | Right stick-side button | `STICK_WEST` | `SwapMainPreview` |
| 5 | Left base top button | `BASE_LEFT_1` | `ControlMain` |
| 6 | Left base upper middle button | `BASE_LEFT_2` | `SelfviewWindowed` |
| 7 | Left base middle button | `BASE_LEFT_3` | `SelfviewFullscreen` |
| 8 | Left base lower button | `BASE_LEFT_6` | `Unassigned` |
| 9 | Left base lower middle button | `BASE_LEFT_5` | `SelfviewOff` |
| 10 | Left base inner button | `BASE_LEFT_4` | `ControlPreview` |
| 11 | Right base top button | `BASE_RIGHT_3` | `SelectRvptzLeft` |
| 12 | Right base upper middle button | `BASE_RIGHT_2` | `SelectQuadCamera` |
| 13 | Right base inner top button | `BASE_RIGHT_1` | `Unassigned` |
| 14 | Right base inner lower button | `BASE_RIGHT_4` | `Unassigned` |
| 15 | Right base lower middle button | `BASE_RIGHT_5` | `SelectRvptzRight` |
| 16 | Right base lower button | `BASE_RIGHT_6` | `SelectUsbCamera` |

The three analog axes are intentionally fixed and are not button actions:

- main stick pitch: tilt;
- main stick twist: pan;
- mini-stick pitch: zoom.

## Manual install

1. Connect the Thrustmaster T.16000M to a supported USB port and set its physical handedness switch to match `config.joystick.StartingHand`.
2. Install the external class with macro name `Thrustmaster_16000M-Class`.
3. Import `Joystick_CameraControl_ProductionSwitcher.js`.
4. Save and activate the solution macro.
5. Restart the macro runtime. This restarts every active macro on the device.
6. Open the self-installed `Joystick Demo` panel to enable joystick handling. Closing the page disables joystick handling and clears the overlays.

## Development

```sh
cd installer
npm ci
npm test
npm run build
```

The RoomOS fake-runtime fixtures are kept under the ignored `.roomos-local/` directory because they bundle the separate Thrustmaster class only for local validation.

## Source extraction

The initial implementation was isolated from [infocomm-2026-AVoIP-RoomCustomization-Demo](https://github.com/ctg-tme/infocomm-2026-AVoIP-RoomCustomization-Demo).

## License

This repository's sample code and documentation are provided under the [Cisco Sample Code License, Version 1.1](LICENSE). The external Thrustmaster class and browser dependencies remain subject to their own licenses.
