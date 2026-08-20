# Joystick Camera Control Production Switcher

A standalone RoomOS solution that uses a Thrustmaster T.16000M joystick to stage, control, and swap up to four camera sources between Main and Preview.

The solution includes:

- `Joystick_CameraControl_ProductionSwitcher.js` — the macro and its self-installed `Joystick Controls` UI panel.
- `installer/` — the browser configurator, device installer, and downloadable single-page PDF operator guide.
- `Guides/thrustmaster16000m-camera-guide.html` — the original extracted control reference.
- `CONTEXT.md` — canonical operator terminology.

The macro is extracted from the InfoComm 2026 demo without the demo's unrelated lighting, web, presentation, video-composition, standby, analytics, or HTTP-client behavior.

## Configure and install in the browser

The browser configurator is the recommended path. Its four-page workflow can be revisited in any order after making changes:

1. Review the requirements, then choose Fresh Installation, Start from Macro, or Fetch Macro from Device.
2. Set the macro behavior and configure up to four camera sources. A readable camera `ButtonAction`, such as `SelectCamera1`, is generated from each name.
3. Assign every physical button in a left-to-right control, selection, and result layout. Open the built-in and configured-camera action definitions in a modal when needed. Default assignments are marked and can be restored individually or as a complete set.
4. Review the Config object, then download the macro, install or update it directly, or download the configured PDF operator guide.

To resume earlier work, upload a previously generated macro or fetch the installed macro after connecting and verifying the exact device. Every connection starts in a secure modal without leaving the current workflow page. The configurator reads only the marked configuration object and never executes imported macro code.

The installer:

- opens device connection and verification in a modal while preserving the current workflow page;
- verifies the expected serial number, refreshes active-call status in a confirmation prompt, and blocks installation during an active call;
- shows the complete install or update sequence in a modal until the macro reports ready, fails, or times out;
- loads the Thrustmaster class from its separate repository and saves it inactive;
- saves and activates the configured solution macro;
- restarts the RoomOS macro runtime once, which restarts every active macro;
- waits for the solution macro to report that joystick initialization is ready.

Fetching an installed configuration uses `Macros Macro Get` on the already verified connection. It is read-only and does not restart the macro runtime.

Refreshing warns before discarding workflow progress and returns to Introduction. The browser caches the device address and administrator username only; passwords and expected serial numbers are not cached. The observed device serial is used only for comparison and is not displayed or logged.

### Operator guide PDF

The Review page generates a real, configuration-specific PDF for printing and keeping in the room. It is exactly one US Letter landscape page and includes the current project and room identity, handedness, Preview status, all 16 physical button assignments, configured camera names, motion settings, the joystick diagram, and the RoomOS enablement steps. Preview-Off guides clearly mark Preview and Swap actions unavailable and use a reduced workflow that does not instruct the operator to use them.

The PDF is generated locally in the browser with embedded source assets. It has no remote image, font, print-dialog, or server-generation dependency.

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

### Configuration reference

| Web installer field | Macro property | Definition |
|---|---|---|
| Project name (optional) | `config.documentation.ProjectName` | The project name used for documentation within the macro. It does not affect operation. |
| Room name (optional) | `config.documentation.RoomName` | The room where the macro will be installed. It is used only for documentation and can help distinguish rooms with different configurations. |
| Physical handedness switch | `config.joystick.StartingHand` | Updates the macro to match the handedness switch on the bottom of the joystick. If they do not match, the base-button references swap sides. |
| Set default camera | `config.joystick.SetDefaultCamera` | When `true`, enabling Joystick Controls sets Main to the configured default camera. When `false`, enabling leaves the current Main source unchanged. Defaults to `true`. |
| Joystick Controls location | `config.userInterface.panelLocation` | Controls where RoomOS makes the Joystick Controls UI available. Accepts `HomeScreen`, `CallControls`, `HomeScreenAndCallControls`, or `ControlPanel`. |
| Preview display mode | `config.previewDisplay.mode` | Uses the Video Matrix xAPI to reserve a screen output as a local camera Preview display before a source is sent into the call. Enable it only with a free HDMI output; it is not recommended when three displays are actively in use. |
| Preview display output | `config.previewDisplay.output` | The HDMI output reserved for the local camera Preview display. Choose only a free output; Preview mode is not recommended when three displays are actively in use. |
| PAN/TILT Ramp Speed | `config.joystick.Camera.PanTiltRampSpeed` | The base speed for camera pan and tilt movement. Not all Cisco cameras respect this setting. |
| ZOOM Ramp Speed | `config.joystick.Camera.ZoomRampSpeed` | The base speed for camera zoom movement. Not all Cisco cameras respect this setting. |
| Precision divisor | `config.joystick.Camera.SlowModeDivisor` | Divides the PAN/TILT and ZOOM speeds by this value while the Precision mode button is held. |
| Camera name | `config.cameras[].Name` | A readable name used in the macro, installer, status display, and generated PDF operator guide. |
| Video ConnectorId | `config.cameras[].ConnectorId` | The RoomOS video input connector used to put this camera on Main or Preview. |
| Camera ControlId | `config.cameras[].ControlId` | The RoomOS camera identifier that receives this camera's PAN/TILT and ZOOM commands. |
| Default camera | `config.joystick.DefaultCameraAction` | The camera used for the macro's default Main, Preview, and joystick-control assignments. `SetDefaultCamera` determines whether enabling Joystick Controls applies it to Main. |

`ButtonAction` is the common vocabulary for anything assignable to a button. It may be:

- a built-in action from the manifest below;
- a generated camera-selection action from `config.cameras`;

`config.documentation.ProjectName` and `RoomName` preserve the printable identity when the macro is uploaded or fetched back into the configurator. `InstallerUrl` links to the hosted configurator and provides the base URL used to download the Joystick Controls panel icon; `RepositoryUrl` links to this project's source. The panel retains its default Sliders icon if the custom icon cannot be downloaded.

`config.userInterface.panelLocation` accepts `HomeScreen`, `CallControls`, `HomeScreenAndCallControls`, or `ControlPanel`. It defaults to `HomeScreenAndCallControls`. The panel XML does not set `Order`, so RoomOS places it in the next available position.

`config.previewDisplay` defines the local Preview capability:

```js
previewDisplay: {
  mode: 'On',
  output: 2
}
```

`mode` accepts `'On'` or `'Off'`. When it is `'Off'`, Preview source selection, Preview camera control, Main/Preview swapping, matrix assignment, and matrix reset do not run. `output` is the video matrix output where the local Preview is shown when the mode is `'On'`.

### Runtime control panel

The self-installed `Joystick Controls` panel has a controls page with two full-width group buttons:

- **Joystick controls** — `Disabled` or `Enabled`. The macro starts disabled. Enabling sets SpeakerTrack behavior to `Manual`, deactivates top-level SpeakerTrack, Closeup, and Frames, and sets PresenterTrack to `Off` before manual joystick control begins. It also sets Main to `DefaultCameraAction` unless `SetDefaultCamera` is `false`; when that option is `false`, the operator's current Main source is left unchanged. It intentionally does not deactivate SpeakerTrack BackgroundMode or ViewLimits. Every tracking command is attempted, but commands that are unavailable or fail on a particular product produce a warning and do not block joystick activation. These commands do not change the device configuration. Disabling joystick control always leaves Main unchanged and does not restore any tracking feature; the user may re-enable tracking from the Camera Control UI. Closing the panel does not change the selection, so panel visibility and joystick operation are independent.
- **Handedness** — `Left-handed` or `Right-handed`. Changing it immediately remaps the physical guide buttons and the Thrustmaster hardware-code lookup. Match this selection to the physical switch on the bottom of the joystick.

Its **Status** page has separate full-width text rows showing whether Joystick Controls is `Enabled` or `Disabled`, the current control method (`Live` or `Preview`), and the cameras currently assigned to Main and Preview. Selecting Main or Preview updates the control method; selecting a camera updates the corresponding source. Swapping exchanges the Main and Preview camera names and changes the control method to the controlled camera's new role while joystick control stays on that physical camera. When Preview is disabled, its status reads `Disabled`.

While Joystick Controls is enabled, the macro monitors `xStatus Cameras SpeakerTrack Status`. If SpeakerTrack becomes `Active`, the macro deactivates automatic tracking again, reasserts the last Main source selected with the joystick, preserves the current joystick control method, Preview source, handedness, and button assignments, and shows a ten-second warning telling the operator to disable Joystick Controls before enabling SpeakerTrack.

`config.joystick.StartingHand` sets the handedness selected after a macro runtime restart. A panel change is runtime state and does not rewrite the macro configuration.

`config.controls` is keyed by the named Thrustmaster button IDs for `config.joystick.StartingHand`. The entries remain in printed guide-button order so the configuration is readable alongside the operator guide. All 16 buttons must appear, including unused buttons:

```js
controls: {
  STICK_TRIGGER: 'PrecisionMode',
  STICK_SOUTH: '',
  STICK_EAST: 'SwapMainPreview',
  STICK_WEST: 'SwapMainPreview',
  BASE_LEFT_1: 'ControlMain',
  BASE_LEFT_2: 'SelfviewWindowed',
  BASE_LEFT_3: 'SelfviewFullscreen',
  BASE_LEFT_6: '',
  BASE_LEFT_5: 'SelfviewOff',
  BASE_LEFT_4: 'ControlPreview',
  BASE_RIGHT_3: 'SelectCamera2',
  BASE_RIGHT_2: 'SelectCamera1',
  BASE_RIGHT_1: '',
  BASE_RIGHT_4: '',
  BASE_RIGHT_5: 'SelectCamera3',
  BASE_RIGHT_6: 'SelectCamera4'
}
```

Use `''`, `null`, or `undefined` when a listed button should perform no action. The configurator consistently generates `''`. Built-in actions may be unused or assigned to multiple buttons. Each configured camera action must be assigned to exactly one button. When handedness is changed from the runtime control panel, the macro remaps these startup IDs so the documented physical assignments stay in place.

### Control manifest

| `ButtonAction` | What it does |
|---|---|
| `''`, `null`, or `undefined` | Leaves the listed button without an operator action |
| `PrecisionMode` | Reduces camera movement speed while the assigned button is held |
| `SwapMainPreview` | Swaps the Main and Preview sources while joystick control follows the same physical camera into its new role |
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
  RoomName: 'Room 1',
  InstallerUrl: 'https://ctg-tme.github.io/Joystick_CameraControl_ProducionSwitcher_using_Thrustmaster_16000M/',
  RepositoryUrl: 'https://github.com/ctg-tme/Joystick_CameraControl_ProducionSwitcher_using_Thrustmaster_16000M'
},
userInterface: {
  panelLocation: 'HomeScreenAndCallControls'
},
joystick: {
  StartingHand: 'right',
  SetDefaultCamera: true,
  DefaultCameraAction: 'SelectCamera1',
  Camera: {
    PanTiltRampSpeed: 12,
    ZoomRampSpeed: 12,
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

`PanTiltRampSpeed` accepts `1`–`24`, while `ZoomRampSpeed` accepts `1`–`15`. Precision Mode divides both configured speeds by the same `SlowModeDivisor`, rounds them to a whole number, and keeps the result at or above `1`.

Every camera `ButtonAction` must be non-empty, unique, different from every built-in action, and assigned exactly once in `config.controls`. `SetDefaultCamera` must be `true` or `false`, and `DefaultCameraAction` must reference one configured camera action.

The browser page generates these identifiers from camera names and keeps camera assignments unique automatically.

### Default physical button map

The guide button number remains the stable visual reference. The named configuration key is the Thrustmaster ID resolved for `StartingHand`.

| Button | Physical control | Right-handed config key | Default `ButtonAction` |
|---:|---|---|---|
| 1 | Trigger | `STICK_TRIGGER` | `PrecisionMode` |
| 2 | Lower center stick button | `STICK_SOUTH` | `''` |
| 3 | Left stick-side button | `STICK_EAST` | `SwapMainPreview` |
| 4 | Right stick-side button | `STICK_WEST` | `SwapMainPreview` |
| 5 | Left base top button | `BASE_LEFT_1` | `ControlMain` |
| 6 | Left base upper middle button | `BASE_LEFT_2` | `SelfviewWindowed` |
| 7 | Left base middle button | `BASE_LEFT_3` | `SelfviewFullscreen` |
| 8 | Left base lower button | `BASE_LEFT_6` | `''` |
| 9 | Left base lower middle button | `BASE_LEFT_5` | `SelfviewOff` |
| 10 | Left base inner button | `BASE_LEFT_4` | `ControlPreview` |
| 11 | Right base top button | `BASE_RIGHT_3` | `SelectCamera2` |
| 12 | Right base upper middle button | `BASE_RIGHT_2` | `SelectCamera1` |
| 13 | Right base inner top button | `BASE_RIGHT_1` | `''` |
| 14 | Right base inner lower button | `BASE_RIGHT_4` | `''` |
| 15 | Right base lower middle button | `BASE_RIGHT_5` | `SelectCamera3` |
| 16 | Right base lower button | `BASE_RIGHT_6` | `SelectCamera4` |

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
6. Open the self-installed `Joystick Controls` panel, confirm the handedness, and select `Enabled`. Select `Disabled` to stop joystick handling; opening or closing the panel alone has no effect.

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
