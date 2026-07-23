/********************************************************
Copyright (c) 2026 Cisco and/or its affiliates.
This software is licensed to you under the terms of the Cisco Sample
Code License, Version 1.1 (the "License"). You may obtain a copy of the
License at
              https://developer.cisco.com/docs/licenses
All use of the material herein must be in accordance with the terms of
the License. All rights not expressly granted by the License are
reserved. Unless required by applicable law or agreed to separately in
writing, software distributed under the License is distributed on an "AS
IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
or implied.
*********************************************************/

/**
 * Author(s):               Robert (Bobby) McGonigle Jr
 *                          Technical Marketing Engineer
 *                          Cisco Systems Inc
 *
 * Date Created:            July 22, 2026
 * Revised:                 July 23, 2026
 * Version:                 1.4.0
 *
 * Description:             Standalone Thrustmaster T.16000M camera controller
 *                          and Main/Preview production switcher for RoomOS.
 *
 * Documentation:           ./README.md
 *
 * Software Platforms:      RoomOS
 *
 * Code Dependencies:       ./Thrustmaster_16000M-Class
 */

import xapi from 'xapi';
import { ThrustMaster16000M_JoyStick } from './Thrustmaster_16000M-Class';

/********************************************

              Configuration

********************************************/

/* JOYSTICK_CONFIG_START */
const config = {
  displays: {
    right: 2
  },
  joystick: {
    StartingHand: 'right',
    DefaultCameraAction: 'SelectQuadCamera',
    Camera: {
      BaseRampSpeed: 12,
      SlowModeDivisor: 2
    }
  },
  // Map every logical button ID to either a built-in action or a camera
  // ButtonAction. Keep unused buttons explicit with Unassigned.
  // Multiple buttons may invoke the same built-in action.
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
  },
  // Configure one to four cameras. Each ButtonAction must appear exactly once in
  // controls so every camera has one button binding.
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
    },
    {
      ButtonAction: 'SelectRvptzRight',
      Name: 'RVPTZ Right',
      ConnectorId: '9',
      ControlId: '9'
    },
    {
      ButtonAction: 'SelectUsbCamera',
      Name: 'USB Camera',
      ConnectorId: '7',
      ControlId: '7'
    }
  ]
};
/* JOYSTICK_CONFIG_END */

const joystickDemoPanelId = 'ic26_avDemo~joy';

const joystickDemoPanelXml = `<Extensions>
  <Version>1.11</Version>
  <Panel>
    <Order>2</Order>
    <Location>HomeScreen</Location>
    <Icon>Hvac</Icon>
    <Color>#262626</Color>
    <Name>Joystick Demo</Name>
    <ActivityType>Custom</ActivityType>
    <Page>
      <Name>Joystick Demo</Name>
      <Row>
        <Name>Row</Name>
        <Widget>
          <WidgetId>widget_1</WidgetId>
          <Name>While this page is open, interact with the USB joystick</Name>
          <Type>Text</Type>
          <Options>size=4;fontSize=normal;align=center</Options>
        </Widget>
      </Row>
      <Row>
        <Name>Row</Name>
        <Widget>
          <WidgetId>widget_2</WidgetId>
          <Name>The Joystick will cease to operate when this page closes</Name>
          <Type>Text</Type>
          <Options>size=4;fontSize=normal;align=center</Options>
        </Widget>
      </Row>
      <PageId>${joystickDemoPanelId}</PageId>
      <Options>hideRowNames=1</Options>
    </Page>
  </Panel>
</Extensions>
`;

/********************************************

              Joystick Logic

********************************************/

let joystickDemoDefaultCamera;
let joystickDemoCamerasByButtonAction = Object.create(null);
let joystickDemoCurrentCamControlId;

let joystickDemoCurrentMainVideo;
let joystickDemoCurrentMainControl;

let joystickDemoCurrentPreviewVideo;
let joystickDemoCurrentPreviewControl;

let joystickDemoControlling = 'main';
let joystickDemoTriggerState = false;
let joystickDemoAxisState = { Y: 0, RZ: 0, HAT0Y: 0 };

// Master switch to enable/disable all joystick features
let joystickDemoEnabled = false;

// Trackers to prevent command spamming
let joystickDemoLastPanTiltSent = { Tilt: 'Stop', Pan: 'Stop', Speed: 0 };
let joystickDemoLastZoomSent = { Zoom: 'Stop', Speed: 0 };

const joystickDemoController = new ThrustMaster16000M_JoyStick({ handednessHardwareToggle: config.joystick.StartingHand });

/**
 * Logs a message to the console, prefixed for the Joystick Demo for clarity in device logs.
 * @param {...*} args - The values to log.
 */
function joystickDemoLog(...args) {
  console.log('[Joystick_Demo]:', ...args);
}

/**
 * Logs an error to the console, prefixed for the Joystick Demo for clarity in device logs.
 * @param {...*} args - The values to log.
 */
function joystickDemoError(...args) {
  console.error('[Joystick_Demo]:', ...args);
}

/**
 * Validates the camera array, builds the ButtonAction lookup, and resolves the default camera.
 */
function joystickDemoValidateCameraConfig() {
  const cameras = config.cameras;

  if (!Array.isArray(cameras)) {
    throw new Error('config.cameras must be an array');
  }

  if (cameras.length < 1 || cameras.length > 4) {
    throw new Error(`config.cameras must contain between 1 and 4 cameras; received ${cameras.length}`);
  }

  joystickDemoCamerasByButtonAction = Object.create(null);

  for (const [index, camera] of cameras.entries()) {
    const location = `config.cameras[${index}]`;

    if (!camera || typeof camera !== 'object' || Array.isArray(camera)) {
      throw new Error(`${location} must be an object`);
    }
    if (typeof camera.ButtonAction !== 'string' || camera.ButtonAction.trim() === '') {
      throw new Error(`${location} requires a non-empty ButtonAction`);
    }
    if (Object.prototype.hasOwnProperty.call(joystickDemoControlManifest, camera.ButtonAction)) {
      throw new Error(`Camera ButtonAction "${camera.ButtonAction}" conflicts with a built-in control action`);
    }
    if (Object.prototype.hasOwnProperty.call(joystickDemoCamerasByButtonAction, camera.ButtonAction)) {
      throw new Error(`Camera ButtonAction "${camera.ButtonAction}" must be unique`);
    }
    if (typeof camera.Name !== 'string' || camera.Name.trim() === '') {
      throw new Error(`${location} requires a non-empty Name`);
    }

    for (const field of ['ConnectorId', 'ControlId']) {
      const value = camera[field];
      if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') {
        throw new Error(`${location} requires a valid ${field}`);
      }
    }

    joystickDemoCamerasByButtonAction[camera.ButtonAction] = camera;
  }

  const defaultCameraAction = config.joystick.DefaultCameraAction;
  if (!Object.prototype.hasOwnProperty.call(joystickDemoCamerasByButtonAction, defaultCameraAction)) {
    throw new Error(`DefaultCameraAction "${defaultCameraAction}" does not match a configured camera ButtonAction`);
  }

  joystickDemoDefaultCamera = joystickDemoCamerasByButtonAction[defaultCameraAction];
}

/**
 * Validates the unified button map against built-in actions and configured cameras.
 */
function joystickDemoValidateControlConfig() {
  const controls = config.controls;

  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) {
    throw new Error('config.controls must be an object keyed by joystick button ID');
  }

  const buttonActions = Object.values(controls);

  for (const buttonId of joystickDemoController.buttons) {
    if (!Object.prototype.hasOwnProperty.call(controls, buttonId)) {
      throw new Error(`config.controls must explicitly include ButtonId "${buttonId}"`);
    }
  }

  for (const [buttonId, buttonAction] of Object.entries(controls)) {
    if (!joystickDemoController.buttons.includes(buttonId)) {
      throw new Error(`Unknown control ButtonId "${buttonId}"`);
    }
    if (typeof buttonAction !== 'string' || buttonAction.trim() === '') {
      throw new Error(`ButtonId "${buttonId}" requires a non-empty ButtonAction`);
    }

    const isControlAction = Object.prototype.hasOwnProperty.call(joystickDemoControlManifest, buttonAction);
    const isCamera = Object.prototype.hasOwnProperty.call(joystickDemoCamerasByButtonAction, buttonAction);
    if (!isControlAction && !isCamera) {
      throw new Error(`Unknown ButtonAction "${buttonAction}" assigned to ButtonId "${buttonId}"`);
    }
  }

  for (const camera of config.cameras) {
    const bindingCount = buttonActions.filter(buttonAction => buttonAction === camera.ButtonAction).length;
    if (bindingCount !== 1) {
      throw new Error(`Camera ButtonAction "${camera.ButtonAction}" must be assigned to exactly one button; received ${bindingCount}`);
    }
  }
}

/**
 * Registers every configured button as either a built-in action or a camera selector.
 */
function joystickDemoRegisterButtons() {
  for (const [buttonId, buttonAction] of Object.entries(config.controls)) {
    const controlDefinition = Object.prototype.hasOwnProperty.call(joystickDemoControlManifest, buttonAction)
      ? joystickDemoControlManifest[buttonAction]
      : null;

    joystickDemoController.button.on(buttonId, state => {
      if (controlDefinition?.Handler) {
        controlDefinition.Handler(state, buttonId);
      } else if (controlDefinition) {
        // Unassigned buttons are intentionally registered as no-ops.
      } else if (state === 'Released') {
        joystickDemoSelectSource(buttonAction, buttonId);
      }
    });
  }
}

/**
 * Resets in-memory camera assignments and motion tracking to the configured default.
 */
function joystickDemoResetTrackingState() {
  joystickDemoCurrentCamControlId = joystickDemoDefaultCamera.ControlId;

  joystickDemoCurrentMainVideo = joystickDemoDefaultCamera.ConnectorId;
  joystickDemoCurrentMainControl = joystickDemoDefaultCamera.ControlId;
  joystickDemoCurrentPreviewVideo = joystickDemoDefaultCamera.ConnectorId;
  joystickDemoCurrentPreviewControl = joystickDemoDefaultCamera.ControlId;

  joystickDemoControlling = 'main';
  joystickDemoTriggerState = false;
  joystickDemoAxisState = { Y: 0, RZ: 0, HAT0Y: 0 };
  joystickDemoLastPanTiltSent = { Tilt: 'Stop', Pan: 'Stop', Speed: 0 };
  joystickDemoLastZoomSent = { Zoom: 'Stop', Speed: 0 };
}

/**
 * Handles Pan and Tilt logic.
 * @roomosxapi https://roomos.cisco.com/xapi/Command.Camera.Ramp/
 */
function joystickDemoHandlePanTilt(speed) {
  const currentTilt = joystickDemoAxisState.Y >= 5 ? 'Up' : (joystickDemoAxisState.Y <= -5 ? 'Down' : 'Stop');
  const currentPan = joystickDemoAxisState.RZ >= 5 ? 'Right' : (joystickDemoAxisState.RZ <= -5 ? 'Left' : 'Stop');

  const isMoving = (currentTilt !== 'Stop' || currentPan !== 'Stop');
  const directionChanged = (currentTilt !== joystickDemoLastPanTiltSent.Tilt || currentPan !== joystickDemoLastPanTiltSent.Pan);
  const speedChanged = (speed !== joystickDemoLastPanTiltSent.Speed && isMoving);

  if (directionChanged || speedChanged) {
    const rampParams = { CameraId: joystickDemoCurrentCamControlId };
    let shouldSend = false;

    if (currentTilt !== 'Stop') {
      rampParams.Tilt = currentTilt;
      rampParams.TiltSpeed = speed;
      shouldSend = true;
    } else if (joystickDemoLastPanTiltSent.Tilt !== 'Stop') {
      rampParams.Tilt = 'Stop';
      shouldSend = true;
    }

    if (currentPan !== 'Stop') {
      rampParams.Pan = currentPan;
      rampParams.PanSpeed = speed;
      shouldSend = true;
    } else if (joystickDemoLastPanTiltSent.Pan !== 'Stop') {
      rampParams.Pan = 'Stop';
      shouldSend = true;
    }

    if (shouldSend) {
      joystickDemoLastPanTiltSent = { Tilt: currentTilt, Pan: currentPan, Speed: speed };
      joystickDemoLog(`Pan/Tilt ramp on Camera ${joystickDemoCurrentCamControlId} -> Pan: ${currentPan}, Tilt: ${currentTilt}, Speed: ${speed}`);
      xapi.Command.Camera.Ramp(rampParams).catch(err => joystickDemoError('Pan/Tilt ramp failed:', err));
    }
  }
}

/**
 * Handles Zoom logic (separate command for reliability).
 * @roomosxapi https://roomos.cisco.com/xapi/Command.Camera.Ramp/
 */
function joystickDemoHandleZoom(speed) {
  // Map: Negative values = In, Positive values = Out
  const currentZoom = joystickDemoAxisState.HAT0Y <= -5 ? 'In' : (joystickDemoAxisState.HAT0Y >= 5 ? 'Out' : 'Stop');

  // Zoom speed max on Cisco is 15. Cap it just in case.
  const zoomSpeed = Math.min(15, speed);

  const directionChanged = (currentZoom !== joystickDemoLastZoomSent.Zoom);
  const speedChanged = (zoomSpeed !== joystickDemoLastZoomSent.Speed && currentZoom !== 'Stop');

  if (directionChanged || speedChanged) {
    const zoomParams = {
      CameraId: joystickDemoCurrentCamControlId,
      Zoom: currentZoom
    };

    if (currentZoom !== 'Stop') {
      zoomParams.ZoomSpeed = zoomSpeed;
    }

    joystickDemoLastZoomSent = { Zoom: currentZoom, Speed: zoomSpeed };

    joystickDemoLog(`Zoom ramp on Camera ${joystickDemoCurrentCamControlId} -> Zoom: ${currentZoom}, Speed: ${zoomSpeed}`);
    xapi.Command.Camera.Ramp(zoomParams).catch(err => joystickDemoError('Zoom ramp failed:', err));
  }
}

function joystickDemoUpdateCameraRamp() {
  const speed = joystickDemoTriggerState
    ? Math.max(1, Math.round(config.joystick.Camera.BaseRampSpeed / config.joystick.Camera.SlowModeDivisor))
    : config.joystick.Camera.BaseRampSpeed;

  joystickDemoLog(`Updating camera ramp -> Speed: ${speed} (Slow mode: ${joystickDemoTriggerState})`);
  joystickDemoHandlePanTilt(speed);
  joystickDemoHandleZoom(speed);
}

// --- Listeners ---

joystickDemoController.stick.on('MAIN_PITCH', value => {
  if (joystickDemoAxisState.Y !== value) {
    joystickDemoAxisState.Y = value;
    joystickDemoUpdateCameraRamp();
  }
});

joystickDemoController.stick.on('MAIN_YAW', value => {
  if (joystickDemoAxisState.RZ !== value) {
    joystickDemoAxisState.RZ = value;
    joystickDemoUpdateCameraRamp();
  }
});

// Zoom Axis (Hat Switch Y)
joystickDemoController.stick.on('MINI_PITCH', value => {
  if (joystickDemoAxisState.HAT0Y !== value) {
    joystickDemoAxisState.HAT0Y = value;
    joystickDemoUpdateCameraRamp();
  }
});

function joystickDemoGetNameByConnectorId(id, object = config) {
  const camera = object.cameras.find(cameraConfig => cameraConfig.ConnectorId == id);
  if (camera) {
    return camera.Name;
  }

  joystickDemoError(`No camera found for ConnectorId: ${id}`);
  return null;
}

/**
 * Sets the Main video source and live-source overlay.
 * @roomosxapi https://roomos.cisco.com/xapi/Command.Video.Input.SetMainVideoSource/
 * @roomosxapi https://roomos.cisco.com/xapi/Command.Video.Graphics.Text.Display/
 */
async function joystickDemoSetMainSourceVideo(input) {
  joystickDemoCurrentMainVideo = input;
  joystickDemoLog(`Setting Main source to ${joystickDemoGetNameByConnectorId(input)} (ConnectorId: ${input})`);
  try {
    await xapi.Command.Video.Input.SetMainVideoSource({ ConnectorId: input });
    await xapi.Command.Video.Graphics.Text.Display({ Date: 'Off', Duration: 0, Target: ['MainSource'], Text: `${joystickDemoGetNameByConnectorId(input)} is Live 🔴`, Time: 'Off' });
  } catch (err) {
    const error = { Context: `Failed to set Main video source, ConnectorId: ${input}`, Error: err.message };
    joystickDemoError(error, err);
    throw error;
  }
}

/**
 * Assigns the Preview video source to the configured matrix output.
 * @roomosxapi https://roomos.cisco.com/xapi/Command.Video.Matrix.Assign/
 * @roomosxapi https://roomos.cisco.com/xapi/Command.UserInterface.Message.TextLine.Display/
 */
async function joystickDemoSetPreviewVideo(input) {
  joystickDemoCurrentPreviewVideo = input;
  joystickDemoLog(`Setting Preview source to ${joystickDemoGetNameByConnectorId(input)} (ConnectorId: ${input})`);
  try {
    await xapi.Command.Video.Matrix.Assign({ Mode: 'Replace', SourceId: input, Output: config.displays.right });
    await xapi.Command.UserInterface.Message.TextLine.Display({ Text: `Preview of ${joystickDemoGetNameByConnectorId(input)}.`, X: 5000, Y: 10000 });
  } catch (err) {
    const error = { Context: `Failed to set Preview video source, ConnectorId: ${input}, Output: ${config.displays.right}`, Error: err.message };
    joystickDemoError(error, err);
    throw error;
  }
}

async function joystickDemoSetCameraControlId(input) {
  console.log(typeof input, input);
  try {
    await xapi.Command.Camera.Ramp({ Pan: 'Stop', CameraId: joystickDemoCurrentCamControlId });
    await xapi.Command.Camera.Ramp({ Tilt: 'Stop', CameraId: joystickDemoCurrentCamControlId });
    await xapi.Command.Camera.Ramp({ Zoom: 'Stop', CameraId: joystickDemoCurrentCamControlId });
  } catch (err) {
    const error = { Context: `Failed to stop camera ramp before reassigning control, CameraId: ${joystickDemoCurrentCamControlId}`, Error: err.message };
    joystickDemoError(error, err);
    throw error;
  }
  joystickDemoLog(`Joystick control assigned to Camera ${input} (was ${joystickDemoCurrentCamControlId})`);
  joystickDemoCurrentCamControlId = input;
  joystickDemoUpdateCameraRamp();
}

async function joystickDemoSwapMainAndPreviewCameras() {
  joystickDemoLog('Swapping Main and Preview sources');

  const tempVideo = joystickDemoCurrentMainVideo;
  joystickDemoCurrentMainVideo = joystickDemoCurrentPreviewVideo;
  joystickDemoCurrentPreviewVideo = tempVideo;

  const tempControl = joystickDemoCurrentMainControl;
  joystickDemoCurrentMainControl = joystickDemoCurrentPreviewControl;
  joystickDemoCurrentPreviewControl = tempControl;

  try {
    await joystickDemoSetMainSourceVideo(joystickDemoCurrentMainVideo);
    await joystickDemoSetPreviewVideo(joystickDemoCurrentPreviewVideo);
  } catch (err) {
    joystickDemoError({ Context: `Failed to swap Main/Preview sources, Main: ${joystickDemoCurrentMainVideo}, Preview: ${joystickDemoCurrentPreviewVideo}`, Error: err.message }, err);
  }

  // The controlled camera and Main/Preview control mode intentionally remain unchanged.
}

function joystickDemoHandlePrecisionMode(state) {
  const newState = (state !== 'Released');
  if (joystickDemoTriggerState !== newState) {
    joystickDemoTriggerState = newState;
    joystickDemoUpdateCameraRamp();
  }
}

function joystickDemoHandleControlMain(state, buttonId) {
  if (state !== 'Released') return;

  joystickDemoLog(`${buttonId} pressed -> control mode set to Main`);
  joystickDemoControlling = 'main';
  joystickDemoSetCameraControlId(joystickDemoCurrentMainControl)
    .catch(err => joystickDemoError({ Context: `${buttonId} set control to Main failed`, Error: err.message }, err));
}

function joystickDemoHandleControlPreview(state, buttonId) {
  if (state !== 'Released') return;

  joystickDemoLog(`${buttonId} pressed -> control mode set to Preview`);
  joystickDemoControlling = 'preview';
  joystickDemoSetCameraControlId(joystickDemoCurrentPreviewControl)
    .catch(err => joystickDemoError({ Context: `${buttonId} set control to Preview failed`, Error: err.message }, err));
}

function joystickDemoHandleSelfviewWindowed(state, buttonId) {
  if (state !== 'Released') return;

  xapi.Command.Video.Selfview.Set({ Mode: 'On', FullscreenMode: 'Off', OnMonitorRole: 'First' })
    .catch(err => joystickDemoError({ Context: `${buttonId} Selfview.Set (windowed) failed`, Error: err.message }, err));
}

function joystickDemoHandleSelfviewFullscreen(state, buttonId) {
  if (state !== 'Released') return;

  xapi.Command.Video.Selfview.Set({ Mode: 'On', FullscreenMode: 'On', OnMonitorRole: 'First' })
    .catch(err => joystickDemoError({ Context: `${buttonId} Selfview.Set (fullscreen) failed`, Error: err.message }, err));
}

function joystickDemoHandleSelfviewOff(state, buttonId) {
  if (state !== 'Released') return;

  xapi.Command.Video.Selfview.Set({ Mode: 'Off' })
    .catch(err => joystickDemoError({ Context: `${buttonId} Selfview.Set (off) failed`, Error: err.message }, err));
}

function joystickDemoHandleSwapMainPreview(state, buttonId) {
  if (state !== 'Released') return;

  joystickDemoSwapMainAndPreviewCameras()
    .catch(err => joystickDemoError({ Context: `${buttonId} swap failed`, Error: err.message }, err));
}

const joystickDemoControlManifest = {
  Unassigned: {
    Description: 'No action is assigned to this button.',
    Handler: null
  },
  PrecisionMode: {
    Description: 'Reduces camera movement speed while the button is held.',
    Handler: joystickDemoHandlePrecisionMode
  },
  SwapMainPreview: {
    Description: 'Swaps the Main and Preview sources.',
    Handler: joystickDemoHandleSwapMainPreview
  },
  ControlMain: {
    Description: 'Assigns joystick camera control to the Main source.',
    Handler: joystickDemoHandleControlMain
  },
  ControlPreview: {
    Description: 'Assigns joystick camera control to the Preview source.',
    Handler: joystickDemoHandleControlPreview
  },
  SelfviewWindowed: {
    Description: 'Shows selfview as an inset on the first monitor.',
    Handler: joystickDemoHandleSelfviewWindowed
  },
  SelfviewFullscreen: {
    Description: 'Shows fullscreen selfview on the first monitor.',
    Handler: joystickDemoHandleSelfviewFullscreen
  },
  SelfviewOff: {
    Description: 'Hides selfview.',
    Handler: joystickDemoHandleSelfviewOff
  }
};

/**
 * Selects a camera source for whichever slot the joystick is currently controlling
 * (Main or Preview). Control follows the selected source.
 * @param {string} cameraButtonAction - Configured ButtonAction for the selected camera.
 * @param {string} buttonId - Configured logical button ID that invoked the selection.
 */
function joystickDemoSelectSource(cameraButtonAction, buttonId) {
  const camera = joystickDemoCamerasByButtonAction[cameraButtonAction];
  const srcVid = camera.ConnectorId;
  const srcCtrl = camera.ControlId;

  if (joystickDemoControlling == 'main') {
    joystickDemoCurrentMainControl = srcCtrl;
    joystickDemoSetMainSourceVideo(srcVid)
      .catch(err => joystickDemoError({ Context: `${buttonId} set Main source failed, ConnectorId: ${srcVid}`, Error: err.message }, err));
  } else {
    joystickDemoCurrentPreviewControl = srcCtrl;
    joystickDemoSetPreviewVideo(srcVid)
      .catch(err => joystickDemoError({ Context: `${buttonId} set Preview source failed, ConnectorId: ${srcVid}`, Error: err.message }, err));
  }

  joystickDemoSetCameraControlId(srcCtrl)
    .catch(err => joystickDemoError({ Context: `${buttonId} set control failed, ControlId: ${srcCtrl}`, Error: err.message }, err));
}

async function resetJoystickDemo(end = false) {
  joystickDemoLog(end ? 'Resetting and ending Joystick Demo' : 'Resetting Joystick Demo');

  joystickDemoResetTrackingState();

  try {
    await joystickDemoSetMainSourceVideo(joystickDemoCurrentMainVideo);
    await joystickDemoSetPreviewVideo(joystickDemoCurrentPreviewVideo);
    await joystickDemoSetCameraControlId(joystickDemoCurrentCamControlId);
  } catch (err) {
    joystickDemoError({ Context: 'Failed to restore default sources during reset', Error: err.message }, err);
  }

  if (end) {
    try {
      await xapi.Command.Video.Matrix.Reset({ Output: config.displays.right });
      await xapi.Command.UserInterface.Message.TextLine.Clear();
      await xapi.Command.Video.Graphics.Clear({ Target: ['MainSource'] });
    } catch (err) {
      joystickDemoError({ Context: `Failed to clear demo overlays on end, Output: ${config.displays.right}`, Error: err.message }, err);
    }
  }
}

/**
 * Enables the joystick while the Joystick Demo page is open and disables it when closed.
 * @roomosxapi https://roomos.cisco.com/xapi/Event.UserInterface.Extensions.Event.PageOpened/
 * @roomosxapi https://roomos.cisco.com/xapi/Event.UserInterface.Extensions.Event.PageClosed/
 */
async function handleJoystickPageEvent({ PageId, Type }) {
  if (PageId !== joystickDemoPanelId) return;

  try {
    if (Type === 'Opened') {
      joystickDemoLog('Joystick Demo page opened - enabling joystick');
      joystickDemoEnabled = true;
      await resetJoystickDemo();
    } else if (Type === 'Closed') {
      joystickDemoLog('Joystick Demo page closed - disabling joystick');
      joystickDemoEnabled = false;
      await resetJoystickDemo(true);
    }
  } catch (err) {
    joystickDemoError({ Context: `Failed to handle Joystick page event, PageId: ${PageId}, Type: ${Type}`, Error: err.message }, err);
  }
}

/********************************************

              Initialization

********************************************/

/**
 * Installs or updates the UI panel bundled with this macro.
 * @roomosxapi https://roomos.cisco.com/xapi/Command.UserInterface.Extensions.Panel.Save/
 */
async function installJoystickDemoPanel() {
  await xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: joystickDemoPanelId }, joystickDemoPanelXml);
  joystickDemoLog(`Installed UI panel "${joystickDemoPanelId}"`);
}

async function init() {
  try {
    joystickDemoValidateCameraConfig();
    joystickDemoValidateControlConfig();
    joystickDemoResetTrackingState();
    joystickDemoRegisterButtons();

    await installJoystickDemoPanel();
    await xapi.Config.Peripherals.InputDevice.Mode.set('On');

    xapi.Event.UserInterface.InputDevice.Joystick.on(data => {
      if (joystickDemoEnabled) joystickDemoController.handleInput(data);
    });

    xapi.Event.UserInterface.Extensions.Event.PageOpened.on(({ PageId }) =>
      handleJoystickPageEvent({ PageId, Type: 'Opened' })
    );

    xapi.Event.UserInterface.Extensions.Event.PageClosed.on(({ PageId }) =>
      handleJoystickPageEvent({ PageId, Type: 'Closed' })
    );

    joystickDemoLog('Joystick Ready with Pan/Tilt/Zoom');
  } catch (err) {
    console.error('[Init]:', { Context: 'Macro initialization failed', Error: err.message }, err);
    throw err;
  }
}

init();
