import { describe, expect, it, vi } from 'vitest';
import { installAndVerify, type DeviceXapi } from './device';

describe('device installation', () => {
  it('saves the dependency before the configured macro, activates, restarts, and observes readiness', async () => {
    let feedback: ((event: unknown) => void) | undefined;
    const stopFeedback = vi.fn();
    const command = vi.fn(async (path: string, _params?: unknown, _body?: unknown) => {
      if (path === 'Macros Runtime Restart') {
        feedback?.({
          MacroName: 'Joystick_CameraControl_ProductionSwitcher',
          Message: 'Joystick Ready with Pan/Tilt/Zoom',
        });
      }
      return { status: 'OK' };
    });
    const xapi = {
      command,
      event: {
        on: vi.fn((_path: string, callback: (event: unknown) => void) => {
          feedback = callback;
          return stopFeedback;
        }),
      },
    } as unknown as DeviceXapi;
    const progress: string[] = [];

    const result = await installAndVerify(
      xapi,
      {
        dependencyName: 'Thrustmaster_16000M-Class',
        dependencySource: 'dependency source',
        macroName: 'Joystick_CameraControl_ProductionSwitcher',
        macroSource: 'configured macro source',
      },
      (message) => progress.push(message),
      100,
    );

    expect(result.kind).toBe('ready');
    expect(command.mock.calls.map(([path]) => path)).toEqual([
      'Macros Macro Deactivate',
      'Macros Macro Deactivate',
      'Macros Macro Save',
      'Macros Macro Save',
      'Macros Macro Activate',
      'Macros Runtime Restart',
    ]);
    expect(command.mock.calls[0][1]).toMatchObject({ Name: 'Thrustmaster_16000M-Class' });
    expect(command.mock.calls[1][1]).toMatchObject({ Name: 'Joystick_CameraControl_ProductionSwitcher' });
    expect(command.mock.calls[2][1]).toMatchObject({ Name: 'Thrustmaster_16000M-Class' });
    expect(command.mock.calls[3][1]).toMatchObject({ Name: 'Joystick_CameraControl_ProductionSwitcher' });
    expect(progress.at(-1)).toContain('Waiting');
    expect(stopFeedback).toHaveBeenCalledOnce();
  });
});
