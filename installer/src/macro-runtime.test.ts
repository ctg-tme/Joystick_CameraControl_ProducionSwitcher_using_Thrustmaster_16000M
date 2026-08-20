import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const macroUrl = new URL('../../Joystick_CameraControl_ProductionSwitcher.js', import.meta.url);

interface RecoverySnapshot {
  enabled: boolean;
  mainVideo: string;
  mainControl: string | null;
  previewVideo: string;
  previewControl: string | null;
  currentControl: string | null;
  controlling: string;
  handedness: string;
  trigger: boolean;
  axes: { Y: number; RZ: number; HAT0Y: number };
  lastPanTilt: { Tilt: string; Pan: string; Speed: number };
  lastZoom: { Zoom: string; Speed: number };
  controls: Record<string, unknown>;
}

interface RecoveryRuntime {
  prepare(): void;
  enable(): Promise<void>;
  disable(): Promise<void>;
  recover(): Promise<void>;
  swap(): Promise<void>;
  controlMain(): void;
  controlPreview(): void;
  selectSource(cameraButtonAction: string): void;
  updateRamp(): void;
  stopMovement(): Promise<void>;
  installPanel(): Promise<void>;
  statusSections(): Record<string, string>;
  dispatchInput(data: unknown): void;
  snapshot(): RecoverySnapshot;
  handledInputs(): unknown[];
}

function createRecoveryRuntime(source: string, xapi: unknown, logger: Console): RecoveryRuntime {
  const executableSource = source
    .replace(/^import .*;\n/gm, '')
    .replace(/\ninit\(\);\s*$/, '');
  class FakeController {
    readonly buttons = [
      'STICK_TRIGGER', 'STICK_SOUTH', 'STICK_EAST', 'STICK_WEST',
      'BASE_LEFT_1', 'BASE_LEFT_2', 'BASE_LEFT_3', 'BASE_LEFT_6',
      'BASE_LEFT_5', 'BASE_LEFT_4', 'BASE_RIGHT_3', 'BASE_RIGHT_2',
      'BASE_RIGHT_1', 'BASE_RIGHT_4', 'BASE_RIGHT_5', 'BASE_RIGHT_6',
    ];
    readonly stick = { on: () => undefined };
    readonly button = { on: () => undefined };
    readonly inputs: unknown[] = [];
    handleInput(data: unknown): void { this.inputs.push(data); }
    setHandednessHardwareToggle(): void {}
  }
  const exposeTestInterface = `
    return {
      prepare() {
        joystickDemoValidateCameraConfig();
        joystickDemoResetTrackingState();
        joystickDemoCurrentMainVideo = '2';
        joystickDemoCurrentMainControl = '2';
        joystickDemoCurrentPreviewVideo = '3';
        joystickDemoCurrentPreviewControl = '3';
        joystickDemoCurrentCamControlId = '3';
        joystickDemoControlling = 'preview';
        joystickDemoHandedness = 'left';
        joystickDemoTriggerState = true;
        joystickDemoAxisState = { Y: 72, RZ: -81, HAT0Y: 64 };
        joystickDemoLastPanTiltSent = { Tilt: 'Up', Pan: 'Left', Speed: 6 };
        joystickDemoLastZoomSent = { Zoom: 'Out', Speed: 4 };
        joystickDemoEnabled = true;
      },
      async enable() {
        joystickDemoValidateCameraConfig();
        joystickDemoResetTrackingState();
        await joystickDemoSetEnabled(true);
      },
      disable() { return joystickDemoSetEnabled(false); },
      recover: joystickDemoRecoverFromSpeakerTrackActivation,
      swap: joystickDemoSwapMainAndPreviewCameras,
      controlMain() { joystickDemoHandleControlMain('Released', 'TEST_MAIN'); },
      controlPreview() { joystickDemoHandleControlPreview('Released', 'TEST_PREVIEW'); },
      selectSource(cameraButtonAction) { joystickDemoSelectSource(cameraButtonAction, 'TEST_CAMERA'); },
      updateRamp: joystickDemoUpdateCameraRamp,
      stopMovement: joystickDemoStopCameraMovement,
      installPanel: installJoystickDemoPanel,
      statusSections: joystickDemoGetStatusSections,
      dispatchInput(data) {
        if (joystickDemoEnabled) joystickDemoController.handleInput(data);
      },
      snapshot() {
        return {
          enabled: joystickDemoEnabled,
          mainVideo: joystickDemoCurrentMainVideo,
          mainControl: joystickDemoCurrentMainControl,
          previewVideo: joystickDemoCurrentPreviewVideo,
          previewControl: joystickDemoCurrentPreviewControl,
          currentControl: joystickDemoCurrentCamControlId,
          controlling: joystickDemoControlling,
          handedness: joystickDemoHandedness,
          trigger: joystickDemoTriggerState,
          axes: { ...joystickDemoAxisState },
          lastPanTilt: { ...joystickDemoLastPanTiltSent },
          lastZoom: { ...joystickDemoLastZoomSent },
          controls: { ...config.controls }
        };
      },
      handledInputs() { return [...joystickDemoController.inputs]; }
    };
  `;
  const factory = new Function(
    'xapi',
    'ThrustMaster16000M_JoyStick',
    'console',
    `${executableSource}\n${exposeTestInterface}`,
  ) as (xapiValue: unknown, controller: typeof FakeController, consoleValue: Console) => RecoveryRuntime;
  return factory(xapi, FakeController, logger);
}

describe('joystick runtime behavior', () => {
  it('turns off automatic camera tracking before enabling manual control', async () => {
    const source = await readFile(macroUrl, 'utf8');
    const expectedSpeakerTrackCommands = [
      'xapi.Command.Cameras.SpeakerTrack.Deactivate()',
      'xapi.Command.Cameras.SpeakerTrack.Closeup.Deactivate()',
      'xapi.Command.Cameras.SpeakerTrack.Frames.Deactivate()',
    ];
    const transitionStart = source.indexOf('async function joystickDemoSetEnabled(enabled)');
    const transitionEnd = source.indexOf('\n/**', transitionStart + 1);
    const transition = source.slice(transitionStart, transitionEnd);
    const shutdownStart = source.indexOf('async function joystickDemoDisableAutomaticCameraTracking()');
    const shutdownEnd = source.indexOf('\n/**', shutdownStart + 1);
    const shutdown = source.slice(shutdownStart, shutdownEnd);

    const speakerTrackCommands = [
      ...source.matchAll(/xapi\.Command\.Cameras\.SpeakerTrack(?:\.[A-Za-z]+)*\.Deactivate\(\)/g),
    ].map(([command]) => command);
    expect(speakerTrackCommands).toEqual(expectedSpeakerTrackCommands);
    expect(source).toContain("xapi.Command.Cameras.SpeakerTrack.Set({ Behavior: 'Manual' })");
    expect(source).toContain("xapi.Command.Cameras.PresenterTrack.Set({ Mode: 'Off' })");
    expect(shutdown).toContain('await command.Run();');
    expect(shutdown).toContain('is unavailable or its shutdown command failed; continuing:');
    expect(shutdown).not.toContain('throw new Error');
    expect(transition).toContain('if (enabled) {');
    expect(transition).toContain('await joystickDemoDisableAutomaticCameraTracking();');
    expect(transition.indexOf('await joystickDemoDisableAutomaticCameraTracking();'))
      .toBeLessThan(transition.indexOf('await resetJoystickDemo(!enabled);'));
  });

  it('sets the default Main camera only while enabling with SetDefaultCamera true', async () => {
    const source = await readFile(macroUrl, 'utf8');

    for (const [setDefaultCamera, expectedMainSources] of [
      [true, ['1']],
      [false, []],
    ] as const) {
      const mainSources: string[] = [];
      const configuredSource = source.replace(
        'SetDefaultCamera: true',
        `SetDefaultCamera: ${setDefaultCamera}`,
      );
      const xapi = {
        Command: {
          Camera: { Ramp: async () => undefined },
          Cameras: {
            SpeakerTrack: {
              Deactivate: async () => undefined,
              Set: async () => undefined,
              Closeup: { Deactivate: async () => undefined },
              Frames: { Deactivate: async () => undefined },
            },
            PresenterTrack: { Set: async () => undefined },
          },
          Video: {
            Input: {
              SetMainVideoSource: async ({ ConnectorId }: { ConnectorId: string }) => {
                mainSources.push(ConnectorId);
              },
            },
            Matrix: {
              Assign: async () => undefined,
              Reset: async () => undefined,
            },
          },
          UserInterface: {
            Extensions: { Widget: { SetValue: async () => undefined } },
          },
        },
      };
      const logger = {
        log: () => undefined,
        debug: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      } as unknown as Console;
      const runtime = createRecoveryRuntime(configuredSource, xapi, logger);

      await runtime.enable();

      expect(mainSources).toEqual(expectedMainSources);

      runtime.prepare();
      const beforeDisable = runtime.snapshot();
      mainSources.length = 0;
      await runtime.disable();

      expect(mainSources).toEqual([]);
      expect(runtime.snapshot()).toMatchObject({
        mainVideo: beforeDisable.mainVideo,
        mainControl: beforeDisable.mainControl,
      });
    }
  });

  it('does not change tracking configuration or restore tracking when disabled', async () => {
    const source = await readFile(macroUrl, 'utf8');

    expect(source).not.toContain('xapi.Config.Cameras.SpeakerTrack');
    expect(source).not.toContain('xapi.Config.Cameras.PresenterTrack');
    expect(source).not.toContain('xapi.Command.Cameras.SpeakerTrack.Activate');
    expect(source).not.toMatch(/PresenterTrack\.Set\(\{ Mode: '(Follow|Persistent|Background)' \}\)/);
  });

  it('never changes the RoomOS video input connector name configuration', async () => {
    const source = await readFile(macroUrl, 'utf8');

    expect(source).not.toContain('xapi.Config.Video.Input.Connector');
    expect(source).not.toContain('xapi.config.set');
  });

  it('does not use Video Graphics or TextLine display APIs', async () => {
    const source = await readFile(macroUrl, 'utf8');

    expect(source).not.toContain('xapi.Command.Video.Graphics');
    expect(source).not.toContain('xapi.Command.UserInterface.Message.TextLine');
  });

  it('uses independent pan/tilt and zoom ramp speeds with the shared Ramp divisor', async () => {
    const source = await readFile(macroUrl, 'utf8');

    expect(source).toContain('PanTiltRampSpeed: 12');
    expect(source).toContain('ZoomRampSpeed: 12');
    expect(source).toContain('config.joystick.Camera.PanTiltRampSpeed / divisor');
    expect(source).toContain('config.joystick.Camera.ZoomRampSpeed / divisor');
    expect(source).toContain('PanTiltRampSpeed must be a whole number between 1 and 24');
    expect(source).toContain('ZoomRampSpeed must be a whole number between 1 and 15');
    expect(source).not.toContain('Math.min(15, speed)');
  });

  it('keeps movement details at debug level and button selections at info level', async () => {
    const source = await readFile(macroUrl, 'utf8');

    expect(source).toContain('console.debug(\'[Joystick_Demo]:\', ...args)');
    expect(source).toContain('joystickDemoDebug(`Pan/Tilt ramp');
    expect(source).toContain('joystickDemoDebug(`Zoom ramp');
    expect(source).toContain('joystickDemoDebug(`Updating camera ramp');
    expect(source).toContain('joystickDemoLog(`Button selection ->');
  });

  it('gives each dynamic Status section its own row and text widget', async () => {
    const source = await readFile(macroUrl, 'utf8');
    const statusPageStart = source.indexOf('<Name>Status</Name>');
    const statusPageEnd = source.indexOf('<PageId>${joystickDemoStatusPageId}</PageId>', statusPageStart);
    const statusPage = source.slice(statusPageStart, statusPageEnd);

    expect(statusPageStart).toBeGreaterThan(-1);
    expect(statusPageEnd).toBeGreaterThan(statusPageStart);
    expect(statusPage.match(/<Row>/g)).toHaveLength(4);
    expect(statusPage.match(/<Type>Text<\/Type>/g)).toHaveLength(4);
    expect(statusPage).toContain('<WidgetId>${joystickDemoEnabledStatusWidgetId}</WidgetId>');
    expect(statusPage).toContain('<WidgetId>${joystickDemoControllingStatusWidgetId}</WidgetId>');
    expect(statusPage).toContain('<WidgetId>${joystickDemoMainStatusWidgetId}</WidgetId>');
    expect(statusPage).toContain('<WidgetId>${joystickDemoPreviewStatusWidgetId}</WidgetId>');
    expect(source).toContain('Value: sections.Enabled');
    expect(source).toContain('Value: sections.Controlling');
    expect(source).toContain('Value: sections.Main');
    expect(source).toContain('Value: sections.Preview');
    expect(source).toContain("Enabled: joystickDemoFormatStatusSection('Joystick controls', joystickDemoEnabled ? 'Enabled' : 'Disabled')");
    expect(source).toContain("Controlling: joystickDemoFormatStatusSection('Controlling', controlling)");
    expect(source).toContain("Main: joystickDemoFormatStatusSection('Main', mainCamera)");
    expect(source).toContain("Preview: joystickDemoFormatStatusSection('Preview', previewCamera)");
    expect(source).toContain('[joystickDemoControlsPageId, joystickDemoStatusPageId].includes(PageId)');
  });

  it('swaps the Status camera names and Controlling role while retaining the controlled camera', async () => {
    const source = await readFile(macroUrl, 'utf8');
    const xapi = {
      Command: {
        Video: {
          Input: { SetMainVideoSource: async () => undefined },
          Matrix: { Assign: async () => undefined },
        },
        UserInterface: {
          Extensions: { Widget: { SetValue: async () => undefined } },
        },
      },
    };
    const logger = {
      log: () => undefined,
      debug: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as Console;
    const runtime = createRecoveryRuntime(source, xapi, logger);
    runtime.prepare();

    expect(runtime.statusSections()).toMatchObject({
      Controlling: 'Controlling: Preview',
      Main: 'Main: Camera 2',
      Preview: 'Preview: Camera 3',
    });

    await runtime.swap();

    expect(runtime.snapshot()).toMatchObject({
      mainVideo: '3',
      previewVideo: '2',
      currentControl: '3',
      controlling: 'main',
    });
    expect(runtime.statusSections()).toMatchObject({
      Controlling: 'Controlling: Live',
      Main: 'Main: Camera 3',
      Preview: 'Preview: Camera 2',
    });

    await runtime.swap();

    expect(runtime.snapshot()).toMatchObject({
      mainVideo: '2',
      previewVideo: '3',
      currentControl: '3',
      controlling: 'preview',
    });
    expect(runtime.statusSections()).toMatchObject({
      Controlling: 'Controlling: Preview',
      Main: 'Main: Camera 2',
      Preview: 'Preview: Camera 3',
    });
  });

  it('keeps Status aligned across Main, Preview, camera-selection, and Swap controls', async () => {
    const source = await readFile(macroUrl, 'utf8');
    const xapi = {
      Command: {
        Camera: { Ramp: async () => undefined },
        Video: {
          Input: { SetMainVideoSource: async () => undefined },
          Matrix: { Assign: async () => undefined },
        },
        UserInterface: {
          Extensions: { Widget: { SetValue: async () => undefined } },
        },
      },
    };
    const logger = {
      log: () => undefined,
      debug: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as Console;
    const runtime = createRecoveryRuntime(source, xapi, logger);
    runtime.prepare();

    runtime.controlMain();
    runtime.selectSource('SelectCamera4');
    expect(runtime.statusSections()).toMatchObject({
      Controlling: 'Controlling: Live',
      Main: 'Main: Camera 4',
      Preview: 'Preview: Camera 3',
    });

    runtime.controlPreview();
    runtime.selectSource('SelectCamera1');
    expect(runtime.statusSections()).toMatchObject({
      Controlling: 'Controlling: Preview',
      Main: 'Main: Camera 4',
      Preview: 'Preview: Camera 1',
    });

    await runtime.swap();
    expect(runtime.statusSections()).toMatchObject({
      Controlling: 'Controlling: Live',
      Main: 'Main: Camera 1',
      Preview: 'Preview: Camera 4',
    });
  });

  it('routes video-only sources while suppressing every camera ramp command', async () => {
    const source = (await readFile(macroUrl, 'utf8')).replace("ControlId: '4'", 'ControlId: null');
    const rampCalls: Record<string, unknown>[] = [];
    const xapi = {
      Command: {
        Camera: { Ramp: async (parameters: Record<string, unknown>) => { rampCalls.push(parameters); } },
        Video: {
          Input: { SetMainVideoSource: async () => undefined },
          Matrix: { Assign: async () => undefined },
        },
        UserInterface: {
          Extensions: { Widget: { SetValue: async () => undefined } },
        },
      },
    };
    const logger = {
      log: () => undefined,
      debug: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as Console;
    const runtime = createRecoveryRuntime(source, xapi, logger);
    runtime.prepare();
    runtime.controlMain();
    await new Promise((resolve) => setTimeout(resolve, 0));
    rampCalls.length = 0;

    runtime.selectSource('SelectCamera4');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rampCalls).toHaveLength(3);
    expect(rampCalls.every((parameters) => parameters.CameraId === '2')).toBe(true);
    expect(runtime.snapshot()).toMatchObject({
      mainVideo: '4',
      mainControl: null,
      currentControl: null,
      axes: { Y: 0, RZ: 0, HAT0Y: 0 },
    });
    expect(runtime.statusSections()).toMatchObject({
      Controlling: 'Controlling: Live — video only',
      Main: 'Main: Camera 4',
    });

    rampCalls.length = 0;
    runtime.updateRamp();
    await runtime.stopMovement();
    expect(rampCalls).toEqual([]);

    runtime.selectSource('SelectCamera1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runtime.snapshot().currentControl).toBe('1');
    expect(rampCalls).toEqual([]);
  });

  it('downloads the installer icon and applies it to the saved Joystick Controls panel', async () => {
    const source = await readFile(macroUrl, 'utf8');
    const configuredSource = source.replace(
      "panelLocation: 'HomeScreenAndCallControls'",
      "panelLocation: 'ControlPanel'",
    );
    const calls: Array<{ command: string; parameters: Record<string, unknown> }> = [];
    let savedPanelXml = '';
    const xapi = {
      Command: {
        UserInterface: {
          Extensions: {
            Icon: {
              Download: async (parameters: Record<string, unknown>) => {
                calls.push({ command: 'Icon.Download', parameters });
                return { IconId: 'downloaded-installer-icon' };
              },
            },
            Panel: {
              Save: async (parameters: Record<string, unknown>, panelXml: string) => {
                calls.push({ command: 'Panel.Save', parameters });
                savedPanelXml = panelXml;
              },
              Update: async (parameters: Record<string, unknown>) => {
                calls.push({ command: 'Panel.Update', parameters });
                return {};
              },
            },
            Widget: { SetValue: async () => undefined },
          },
        },
      },
    };
    const logger = {
      log: () => undefined,
      debug: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as Console;
    const runtime = createRecoveryRuntime(configuredSource, xapi, logger);
    runtime.prepare();

    await runtime.installPanel();

    expect(source).toContain("panelLocation: 'HomeScreenAndCallControls'");
    expect(source).toContain('joystickDemoValidatePanelLocationConfig();');
    expect(savedPanelXml).toContain('<Location>ControlPanel</Location>');
    expect(savedPanelXml).not.toContain('<Order>');

    expect(calls).toEqual([
      {
        command: 'Panel.Save',
        parameters: { PanelId: 'ic26_avDemo~joy' },
      },
      {
        command: 'Icon.Download',
        parameters: {
          Url: 'https://ctg-tme.github.io/Joystick_CameraControl_ProductionSwitcher_using_Thrustmaster_16000M/icons/joystick-camera-control-512.png',
        },
      },
      {
        command: 'Panel.Update',
        parameters: {
          IconId: 'downloaded-installer-icon',
          Icon: 'Custom',
          PanelId: 'ic26_avDemo~joy',
        },
      },
    ]);
  });

  it('recovers the remembered Main source when SpeakerTrack activates during joystick control', async () => {
    const source = await readFile(macroUrl, 'utf8');
    const recoveryStart = source.indexOf('async function joystickDemoRecoverFromSpeakerTrackActivation()');
    const recoveryEnd = source.indexOf('\nfunction joystickDemoHandleSpeakerTrackStatus', recoveryStart);
    const recovery = source.slice(recoveryStart, recoveryEnd);

    expect(source).toContain('xapi.Status.Cameras.SpeakerTrack.Status.on(joystickDemoHandleSpeakerTrackStatus)');
    expect(source).toContain("status !== 'Active' || !joystickDemoEnabled");
    expect(recovery).toContain('await joystickDemoDisableAutomaticCameraTracking();');
    expect(recovery).toContain('await joystickDemoSetMainSourceVideo(lastMainVideo);');
    expect(recovery).not.toContain('joystickDemoResetTrackingState');
    expect(recovery).toContain("Title: 'Joystick Controls active'");
    expect(recovery).toContain("Text: 'Disable Joystick Controls before enabling SpeakerTrack.'");
  });

  it('stops every axis and clears transient input before SpeakerTrack recovery re-enables handling', async () => {
    const source = await readFile(macroUrl, 'utf8');
    const events: Array<{ name: string; snapshot: RecoverySnapshot }> = [];
    const warnings: unknown[][] = [];
    let runtime: RecoveryRuntime;
    const capture = (name: string) => {
      const snapshot = runtime.snapshot();
      events.push({ name, snapshot });
      runtime.dispatchInput({ during: name });
    };
    const ramp = async (parameters: Record<string, unknown>) => {
      const axis = ['Pan', 'Tilt', 'Zoom'].find((candidate) => candidate in parameters) ?? 'Unknown';
      capture(`stop-${axis}`);
      if (axis === 'Pan') throw new Error('simulated Pan stop failure');
    };
    const widgetSetValue = async (parameters: { WidgetId: string; Value: string }) => {
      if (parameters.WidgetId.endsWith('~enabled') && parameters.Value === 'enabled') {
        capture('panel-synchronized-enabled');
      }
    };
    const xapi = {
      Command: {
        Camera: { Ramp: ramp },
        Cameras: {
          SpeakerTrack: {
            Deactivate: async () => capture('tracking-deactivated'),
            Set: async () => undefined,
            Closeup: { Deactivate: async () => undefined },
            Frames: { Deactivate: async () => undefined },
          },
          PresenterTrack: { Set: async () => undefined },
        },
        Video: {
          Input: { SetMainVideoSource: async () => capture('main-restored') },
        },
        UserInterface: {
          Message: { Alert: { Display: async () => undefined } },
          Extensions: { Widget: { SetValue: widgetSetValue } },
        },
      },
    };
    const logger = {
      log: () => undefined,
      debug: () => undefined,
      warn: (...args: unknown[]) => warnings.push(args),
      error: () => undefined,
    } as unknown as Console;
    runtime = createRecoveryRuntime(source, xapi, logger);
    runtime.prepare();
    const before = runtime.snapshot();

    await expect(runtime.recover()).resolves.toBeUndefined();

    expect(events.slice(0, 3).map((event) => event.name)).toEqual([
      'stop-Pan',
      'stop-Tilt',
      'stop-Zoom',
    ]);
    expect(events.slice(0, 3).every((event) => !event.snapshot.enabled)).toBe(true);
    const tracking = events.find((event) => event.name === 'tracking-deactivated');
    expect(tracking?.snapshot).toMatchObject({
      enabled: false,
      trigger: false,
      axes: { Y: 0, RZ: 0, HAT0Y: 0 },
      lastPanTilt: { Tilt: 'Stop', Pan: 'Stop', Speed: 0 },
      lastZoom: { Zoom: 'Stop', Speed: 0 },
    });
    expect(events.findIndex((event) => event.name === 'tracking-deactivated'))
      .toBeLessThan(events.findIndex((event) => event.name === 'main-restored'));
    const finalSync = events.find((event) => event.name === 'panel-synchronized-enabled');
    expect(finalSync?.snapshot).toMatchObject({
      enabled: true,
      trigger: false,
      axes: { Y: 0, RZ: 0, HAT0Y: 0 },
      lastPanTilt: { Tilt: 'Stop', Pan: 'Stop', Speed: 0 },
      lastZoom: { Zoom: 'Stop', Speed: 0 },
    });
    expect(runtime.handledInputs()).toEqual([{ during: 'panel-synchronized-enabled' }]);
    expect(runtime.snapshot()).toMatchObject({
      mainVideo: before.mainVideo,
      mainControl: before.mainControl,
      previewVideo: before.previewVideo,
      previewControl: before.previewControl,
      currentControl: before.currentControl,
      controlling: before.controlling,
      handedness: before.handedness,
      controls: before.controls,
    });
    expect(warnings.some((args) => args.map(String).join(' ').includes('Failed to stop Pan'))).toBe(true);
  });
});
