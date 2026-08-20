import { describe, expect, it, vi } from 'vitest';
import { createDeviceInstallationSession, type DeviceXapi, type VerifiedDevice } from './device';

const verifiedDevice: VerifiedDevice = {
  productPlatform: 'Room Kit Pro',
  roomOsVersion: 'RoomOS 26.3',
  serialMatches: true,
  activeCalls: 0,
};

const credentials = {
  host: 'room.example.com',
  username: 'admin',
  password: 'secret',
};

describe('device installation', () => {
  it('reads an installed macro through the verified device socket', async () => {
    const command = vi.fn(async () => ({
      Macro: {
        Name: 'Joystick_CameraControl_ProductionSwitcher',
        Content: '/* JOYSTICK_CONFIG_START */ source /* JOYSTICK_CONFIG_END */',
      },
    }));
    const xapi = { command, close: vi.fn() } as unknown as DeviceXapi;
    const session = createDeviceInstallationSession({
      connect: vi.fn(async () => xapi),
      verify: vi.fn(async () => verifiedDevice),
    });
    await session.connect(credentials, 'SERIAL-1');

    const source = await session.fetchInstalledMacro('Joystick_CameraControl_ProductionSwitcher');

    expect(source).toContain('JOYSTICK_CONFIG_START');
    expect(command).toHaveBeenCalledWith('Macros Macro Get', {
      Name: 'Joystick_CameraControl_ProductionSwitcher',
      Content: 'True',
    });
  });

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

    const session = createDeviceInstallationSession({
      connect: vi.fn(async () => xapi),
      verify: vi.fn(async () => verifiedDevice),
    });
    await session.connect(credentials, 'SERIAL-1');

    const result = await session.install(
      {
        dependencies: [{ name: 'Thrustmaster_16000M-Class', source: 'dependency source' }],
        macroName: 'Joystick_CameraControl_ProductionSwitcher',
        macroSource: 'configured macro source',
      },
      (message) => progress.push(message),
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
    expect(session.snapshot().installationResult).toEqual(result);
  });

  it('rechecks calls inside the session immediately before installation', async () => {
    const xapi = { close: vi.fn() } as unknown as DeviceXapi;
    const verify = vi.fn()
      .mockResolvedValueOnce(verifiedDevice)
      .mockResolvedValueOnce({ ...verifiedDevice, activeCalls: 1 });
    const install = vi.fn();
    const session = createDeviceInstallationSession({
      connect: vi.fn(async () => xapi),
      verify,
      install,
    });
    await session.connect(credentials, 'SERIAL-1');

    await expect(session.install({
      dependencies: [{ name: 'dependency', source: 'source' }],
      macroName: 'macro',
      macroSource: 'source',
    }, vi.fn())).rejects.toThrow('A call started after the confirmation prompt. Installation remains blocked.');

    expect(verify).toHaveBeenCalledTimes(2);
    expect(install).not.toHaveBeenCalled();
  });
});
