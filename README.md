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

1. Name the project and room for the printable operator guide.
2. Add one to four cameras. A readable camera `ButtonAction`, such as `SelectCamera1`, is generated from each name.
3. Assign every physical button with a dropdown. Default assignments are marked and can be restored individually or as a complete set.
4. Review or download the generated macro.
5. Enter the exact RoomOS device address, administrator credentials, and expected serial number.
6. Connect and verify the device, acknowledge the macro runtime restart, then install.
7. Print the current mapping as a color, single-page operator guide.

To resume earlier work, upload a previously generated macro or fetch the installed macro after connecting and verifying the exact device. The configurator reads only the marked configuration object and never executes imported macro code.

The installer:

- verifies the expected serial number and blocks installation during an active call;
- loads the Thrustmaster class from its separate repository and saves it inactive;
- saves and activates the configured solution macro;
- restarts the RoomOS macro runtime once, which restarts every active macro;
- waits for the solution macro to report that joystick initialization is ready.

Fetching an installed configuration uses `Macros Macro Get` on the already verified connection. It is read-only and does not restart the macro runtime.

Credentials remain in the browser session. The observed device serial is used only for comparison and is not displayed or logged.

### Hardware prerequisites

- a Cisco codec or collaboration device whose RoomOS release supports the InputDevice Joystick APIs;
- a Thrustmaster T.16000M USB joystick;
- Cisco certified cameras for joystick pan, tilt, and zoom control.

USB and uncertified cameras may still be visible and switched as video sources, but this solution does not provide joystick PTZ for them. Additional integration or macro development is required.

Resources:

- [Thrustmaster T.16000M documentation](https://support.thrustmaster.com/en/product/t16000mfcs-en/)
- [T.16000M InputDevice class](https://github.com/ctg-tme/Thrustmaster_16000M-InputDevice-Class)

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

`config.documentation.ProjectName` and `RoomName` preserve the printable identity when the macro is uploaded or fetched back into the configurator. They do not affect RoomOS runtime behavior.

`config.controls` is keyed by the physical guide button number, so its public interface stays ordered from `1` through `16`. All 16 buttons must appear, including unused buttons:

```js
controls: {
  1: 'PrecisionMode',
  2: '',
  3: 'SwapMainPreview',
  4: 'SwapMainPreview',
  5: 'ControlMain',
  6: 'SelfviewWindowed',
  7: 'SelfviewFullscreen',
  8: '',
  9: 'SelfviewOff',
  10: 'ControlPreview',
  11: 'SelectCamera2',
  12: 'SelectCamera1',
  13: '',
  14: '',
  15: 'SelectCamera3',
  16: 'SelectCamera4'
}
```

Use `''`, `null`, or `undefined` when a listed button should perform no action. The configurator consistently generates `''`. Built-in actions may be unused or assigned to multiple buttons. Each configured camera action must be assigned to exactly one button.

### Control manifest

| `ButtonAction` | What it does |
|---|---|
| `''`, `null`, or `undefined` | Leaves the listed button without an operator action |
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
documentation: {
  ProjectName: 'Joystick Camera Control',
  RoomName: 'Room 1'
},
joystick: {
  StartingHand: 'right',
  DefaultCameraAction: 'SelectCamera1',
  Camera: {
    BaseRampSpeed: 12,
    SlowModeDivisor: 2
  }
},
cameras: [
  {
    ButtonAction: 'SelectCamera1',
    Name: 'Camera 1',
    ConnectorId: '1',
    ControlId: '1'
  },
  {
    ButtonAction: 'SelectCamera2',
    Name: 'Camera 2',
    ConnectorId: '2',
    ControlId: '2'
  }
]
```

Every camera `ButtonAction` must be non-empty, unique, different from every built-in action, and assigned exactly once in `config.controls`. `DefaultCameraAction` must reference one configured camera action.

The browser page generates these identifiers from camera names and keeps camera assignments unique automatically.

### Default physical button map

The guide button number is the configuration key and remains stable. The macro resolves the Thrustmaster class ID internally from `StartingHand`.

| Button | Physical control | Default `ButtonAction` |
|---:|---|---|
| 1 | Trigger | `PrecisionMode` |
| 2 | Lower center stick button | `''` |
| 3 | Left stick-side button | `SwapMainPreview` |
| 4 | Right stick-side button | `SwapMainPreview` |
| 5 | Left base top button | `ControlMain` |
| 6 | Left base upper middle button | `SelfviewWindowed` |
| 7 | Left base middle button | `SelfviewFullscreen` |
| 8 | Left base lower button | `''` |
| 9 | Left base lower middle button | `SelfviewOff` |
| 10 | Left base inner button | `ControlPreview` |
| 11 | Right base top button | `SelectCamera2` |
| 12 | Right base upper middle button | `SelectCamera1` |
| 13 | Right base inner top button | `''` |
| 14 | Right base inner lower button | `''` |
| 15 | Right base lower middle button | `SelectCamera3` |
| 16 | Right base lower button | `SelectCamera4` |

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

This repository's sample code and documentation are provided under the [Cisco Sample Code License, Version 1.1](LICENSE). The vendored [Magnetic Common Design System light-theme tokens](installer/src/vendor/magnetic/README.md) are provided under their included MIT license. The external Thrustmaster class and other browser dependencies remain subject to their own licenses.
