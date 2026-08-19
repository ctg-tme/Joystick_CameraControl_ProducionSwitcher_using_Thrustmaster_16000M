import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const macroUrl = new URL('../../Joystick_CameraControl_ProductionSwitcher.js', import.meta.url);

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

  it('does not change tracking configuration or restore tracking when disabled', async () => {
    const source = await readFile(macroUrl, 'utf8');

    expect(source).not.toContain('xapi.Config.Cameras.SpeakerTrack');
    expect(source).not.toContain('xapi.Config.Cameras.PresenterTrack');
    expect(source).not.toContain('xapi.Command.Cameras.SpeakerTrack.Activate');
    expect(source).not.toMatch(/PresenterTrack\.Set\(\{ Mode: '(Follow|Persistent|Background)' \}\)/);
  });

  it('does not use Video Graphics or TextLine display APIs', async () => {
    const source = await readFile(macroUrl, 'utf8');

    expect(source).not.toContain('xapi.Command.Video.Graphics');
    expect(source).not.toContain('xapi.Command.UserInterface.Message.TextLine');
  });

  it('uses independent pan/tilt and zoom ramp speeds with the shared Precision Mode divisor', async () => {
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
    expect(statusPage).toContain('<WidgetId>${joystickDemoControlMethodStatusWidgetId}</WidgetId>');
    expect(statusPage).toContain('<WidgetId>${joystickDemoMainStatusWidgetId}</WidgetId>');
    expect(statusPage).toContain('<WidgetId>${joystickDemoPreviewStatusWidgetId}</WidgetId>');
    expect(source).toContain('Value: sections.Enabled');
    expect(source).toContain('Value: sections.ControlMethod');
    expect(source).toContain('Value: sections.Main');
    expect(source).toContain('Value: sections.Preview');
    expect(source).toContain("Enabled: joystickDemoFormatStatusSection('Joystick controls', joystickDemoEnabled ? 'Enabled' : 'Disabled')");
    expect(source).toContain("ControlMethod: joystickDemoFormatStatusSection('Control method', controlMethod)");
    expect(source).toContain("Main: joystickDemoFormatStatusSection('Main', mainCamera)");
    expect(source).toContain("Preview: joystickDemoFormatStatusSection('Preview', previewCamera)");
    expect(source).toContain('[joystickDemoControlsPageId, joystickDemoStatusPageId].includes(PageId)');
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
});
