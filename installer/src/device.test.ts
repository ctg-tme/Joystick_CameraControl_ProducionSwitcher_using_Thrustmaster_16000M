import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDeviceInstallationSession,
  discoverCameraSourcesFromResponses,
  verifyConnectedDevice,
  type DeviceXapi,
  type VerifiedDevice,
} from './device';

const verifiedDevice: VerifiedDevice = {
  broadcastName: 'Boardroom East',
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

function createDeviceEmitter(fields: Record<string, unknown> = {}): DeviceXapi {
  return Object.assign(new EventEmitter(), {
    close: vi.fn(),
    ...fields,
  }) as unknown as DeviceXapi;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('device installation', () => {
  it('reads the Device Broadcast name while verifying the connected device', async () => {
    const config = vi.fn(async (path: string) => {
      expect(path).toBe('SystemUnit BroadcastName');
      return { Value: ' Boardroom East ' };
    });
    const status = vi.fn(async (path: string) => ({
      'SystemUnit Hardware Module SerialNumber': 'SERIAL-1',
      'SystemUnit Software Version': '26.3.1',
      'SystemUnit ProductPlatform': 'Codec Pro G2',
      'SystemUnit State NumberOfActiveCalls': '0',
    })[path]);
    const xapi = { config: { get: config }, status: { get: status } } as unknown as DeviceXapi;

    await expect(verifyConnectedDevice(xapi, 'serial1')).resolves.toEqual({
      broadcastName: 'Boardroom East',
      productPlatform: 'Codec Pro G2',
      roomOsVersion: '26.3.1',
      serialMatches: true,
      activeCalls: 0,
    });
    expect(config).toHaveBeenCalledOnce();
  });

  it('discovers camera connectors and joins camera status by CameraId', () => {
    const result = discoverCameraSourcesFromResponses(
      [{
        id: '2',
        InputSourceType: 'camera',
        Name: 'Presenter',
        CameraControl: { CameraId: '1', Mode: 'On' },
      }, {
        id: '1',
        InputSourceType: 'PC',
        Name: 'Laptop',
        CameraControl: { CameraId: '2', Mode: 'Off' },
      }, {
        id: '4',
        InputSourceType: 'camera',
        Name: '',
        CameraControl: { CameraId: '4', Mode: 'Off' },
      }],
      { cameras: { Camera: [
        { id: '1', Connected: 'True', Model: 'Quad Camera' },
        { id: '4', Connected: 'False' },
      ] } },
    );

    expect(result).toEqual([{
      ConnectorId: '2',
      Name: 'Presenter',
      ControlId: '1',
      cameraControlMode: 'On',
      connection: 'connected',
      model: 'Quad Camera',
    }, {
      ConnectorId: '4',
      Name: '',
      ControlId: '4',
      cameraControlMode: 'Off',
      connection: 'disconnected',
      model: undefined,
    }]);
  });

  it('accepts singleton wrappers, missing CameraId, and unavailable camera status', () => {
    const connector = {
      Video: { Input: { Connector: {
        id: 3,
        InputSourceType: { Value: 'camera' },
        Name: { Value: 'USB Camera' },
        CameraControl: { Mode: { Value: 'Off' } },
      } } },
    };

    expect(discoverCameraSourcesFromResponses(connector, {})).toEqual([{
      ConnectorId: '3',
      Name: 'USB Camera',
      ControlId: null,
      cameraControlMode: 'Off',
      connection: 'unavailable',
      model: undefined,
    }]);
  });

  it('does not treat video connector connectivity as camera connectivity', () => {
    const statuses = {
      cameras: { Camera: [{ id: '2', Connected: 'False', Model: 'Precision 60' }] },
      videoInputConnectors: { Connector: [{ id: '8', Connected: 'True', Type: 'Ethernet' }] },
    };
    const result = discoverCameraSourcesFromResponses(
      [{
        id: '2',
        InputSourceType: 'camera',
        Name: 'Disconnected Camera',
        CameraControl: { CameraId: '2', Mode: 'On' },
      }, {
        id: '8',
        InputSourceType: 'camera',
        Name: 'Ethernet 1',
        CameraControl: { Mode: 'Off' },
      }],
      statuses,
    );

    expect(result.map(({ ConnectorId, connection }) => ({ ConnectorId, connection }))).toEqual([{
      ConnectorId: '2',
      connection: 'disconnected',
    }, {
      ConnectorId: '8',
      connection: 'unavailable',
    }]);
  });

  it('uses the connector id to match xStatus Cameras when configuration omits CameraId', () => {
    const result = discoverCameraSourcesFromResponses(
      [{
        id: '8',
        InputSourceType: 'camera',
        Name: 'Ethernet 1',
      }, {
        id: '9',
        InputSourceType: 'camera',
        Name: 'Room Vision PTZ',
      }, {
        id: '1',
        InputSourceType: 'camera',
        Name: 'Quad Camera',
        CameraControl: { CameraId: '1', Mode: 'On' },
      }],
      {
        cameras: { Camera: [{
          id: '1',
          Connected: 'True',
          DetectedConnector: '1',
          Model: 'Quad Camera',
        }, {
          id: '9',
          Connected: 'True',
          DetectedConnector: '0',
          Model: 'Room Vision PTZ',
        }] },
      },
    );

    expect(result).toEqual([{
      ConnectorId: '1',
      Name: 'Quad Camera',
      ControlId: '1',
      cameraControlMode: 'On',
      connection: 'connected',
      model: 'Quad Camera',
    }, {
      ConnectorId: '9',
      Name: 'Room Vision PTZ',
      ControlId: '9',
      cameraControlMode: undefined,
      connection: 'connected',
      model: 'Room Vision PTZ',
    }, {
      ConnectorId: '8',
      Name: 'Ethernet 1',
      ControlId: null,
      cameraControlMode: undefined,
      connection: 'unavailable',
      model: undefined,
    }]);
  });

  it('returns configuration-derived cameras when the Cameras status read fails', async () => {
    const xapi = {
      config: { get: vi.fn(async () => [{
        id: '5',
        InputSourceType: 'camera',
        Name: 'Third Party',
        CameraControl: { CameraId: '5', Mode: 'Off' },
      }]) },
      status: { get: vi.fn(async () => { throw new Error('status unavailable'); }) },
      close: vi.fn(),
    } as unknown as DeviceXapi;
    const session = createDeviceInstallationSession({
      connect: vi.fn(async () => xapi),
      verify: vi.fn(async () => verifiedDevice),
    });
    await session.connect(credentials, 'SERIAL-1');

    await expect(session.discoverCameraSources()).resolves.toMatchObject([{
      ConnectorId: '5',
      ControlId: '5',
      connection: 'unavailable',
    }]);
  });

  it('reads only camera status through the verified session', async () => {
    const status = vi.fn(async (path: string) => path === 'Cameras'
      ? { Camera: [] }
      : { Connector: [{ id: '8', Connected: 'True', Type: 'Ethernet' }] });
    const xapi = {
      config: { get: vi.fn(async () => [{
        id: '8',
        InputSourceType: 'camera',
        Name: 'Ethernet 1',
        CameraControl: { Mode: 'Off' },
      }]) },
      status: { get: status },
      close: vi.fn(),
    } as unknown as DeviceXapi;
    const session = createDeviceInstallationSession({
      connect: vi.fn(async () => xapi),
      verify: vi.fn(async () => verifiedDevice),
    });
    await session.connect(credentials, 'SERIAL-1');

    await expect(session.discoverCameraSources()).resolves.toMatchObject([{
      ConnectorId: '8',
      ControlId: null,
      connection: 'unavailable',
    }]);
    expect(status).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith('Cameras');
  });

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

  it.each(['error', 'close'] as const)('invalidates the session and rejects pending work on socket %s', async (event) => {
    const xapi = createDeviceEmitter();
    const session = createDeviceInstallationSession({
      connect: vi.fn(async () => xapi),
      verify: vi.fn(async () => verifiedDevice),
      fetch: vi.fn(() => new Promise<string>(() => undefined)),
    });
    const onConnectionLost = vi.fn();
    session.onConnectionLost?.(onConnectionLost);
    await session.connect(credentials, 'SERIAL-1');
    const pendingFetch = session.fetchInstalledMacro('macro');

    if (event === 'error') {
      (xapi as unknown as EventEmitter).emit('error', new Error('socket reset'));
    } else {
      (xapi as unknown as EventEmitter).emit('close');
    }

    await expect(pendingFetch).rejects.toThrow('RoomOS connection was lost');
    expect(session.snapshot()).toEqual({ connected: false });
    expect(onConnectionLost).toHaveBeenCalledOnce();
  });

  it.each([
    ['fetch', 'Fetching the installed macro'],
    ['discovery', 'Discovering camera sources'],
    ['recheck', 'Rechecking the verified device'],
  ] as const)('disconnects a session when %s reaches its deadline', async (operation, description) => {
    vi.useFakeTimers();
    const xapi = createDeviceEmitter();
    let verificationCount = 0;
    const session = createDeviceInstallationSession({
      connect: vi.fn(async () => xapi),
      verify: vi.fn(() => {
        verificationCount += 1;
        return verificationCount === 1
          ? Promise.resolve(verifiedDevice)
          : new Promise<VerifiedDevice>(() => undefined);
      }),
      fetch: vi.fn(() => new Promise<string>(() => undefined)),
      discover: vi.fn(() => new Promise<never>(() => undefined)),
      operationTimeoutMs: 25,
    });
    await session.connect(credentials, 'SERIAL-1');

    const pendingOperation = operation === 'fetch'
      ? session.fetchInstalledMacro('macro')
      : operation === 'discovery'
        ? session.discoverCameraSources()
        : session.recheck();
    const rejection = expect(pendingOperation).rejects.toThrow(`${description} timed out`);
    await vi.advanceTimersByTimeAsync(26);

    await rejection;
    expect(session.snapshot()).toEqual({ connected: false });
  });

  it('applies a deadline to each RoomOS installation command', async () => {
    vi.useFakeTimers();
    const command = vi.fn(() => new Promise(() => undefined));
    const stopFeedback = Object.assign(vi.fn(), { registration: Promise.resolve() });
    const xapi = createDeviceEmitter({
      command,
      event: { on: vi.fn(() => stopFeedback) },
    });
    const session = createDeviceInstallationSession({
      connect: vi.fn(async () => xapi),
      verify: vi.fn(async () => verifiedDevice),
    });
    await session.connect(credentials, 'SERIAL-1');

    const installation = session.install({
      dependencies: [{ name: 'dependency', source: 'source' }],
      macroName: 'macro',
      macroSource: 'source',
    }, vi.fn());
    const rejection = expect(installation).rejects.toThrow('RoomOS command Macros Macro Deactivate timed out');
    await vi.advanceTimersByTimeAsync(20_001);

    await rejection;
    expect(session.snapshot()).toEqual({ connected: false });
  });

  it('applies a deadline to readiness feedback registration before issuing commands', async () => {
    vi.useFakeTimers();
    const command = vi.fn();
    const stopFeedback = Object.assign(vi.fn(), {
      registration: new Promise(() => undefined),
    });
    const xapi = createDeviceEmitter({
      command,
      event: { on: vi.fn(() => stopFeedback) },
    });
    const session = createDeviceInstallationSession({
      connect: vi.fn(async () => xapi),
      verify: vi.fn(async () => verifiedDevice),
    });
    await session.connect(credentials, 'SERIAL-1');

    const installation = session.install({
      dependencies: [{ name: 'dependency', source: 'source' }],
      macroName: 'macro',
      macroSource: 'source',
    }, vi.fn());
    const rejection = expect(installation).rejects.toThrow('Registering macro readiness feedback timed out');
    await vi.advanceTimersByTimeAsync(20_001);

    await rejection;
    expect(command).not.toHaveBeenCalled();
    expect(session.snapshot()).toEqual({ connected: false });
  });

  it('saves the dependency before the configured macro, activates, restarts, and observes readiness', async () => {
    let feedback: ((event: unknown) => void) | undefined;
    const stopFeedback = vi.fn();
    const command = vi.fn(async (path: string, _params?: unknown, _body?: unknown) => {
      if (path === 'Macros Runtime Restart') {
        queueMicrotask(() => {
          feedback?.({
            MacroName: 'Joystick_CameraControl_ProductionSwitcher',
            Message: 'Joystick Ready with Pan/Tilt/Zoom',
          });
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

  it('awaits feedback registration and ignores ready logs emitted before runtime restart', async () => {
    let feedback: ((event: unknown) => void) | undefined;
    let resolveRegistration: (() => void) | undefined;
    const registration = new Promise<void>((resolve) => {
      resolveRegistration = resolve;
    });
    let resolveRestart: (() => void) | undefined;
    const restart = new Promise<void>((resolve) => {
      resolveRestart = resolve;
    });
    const command = vi.fn(async (path: string) => {
      if (path === 'Macros Runtime Restart') await restart;
      return { status: 'OK' };
    });
    const stopFeedback = Object.assign(vi.fn(), { registration });
    const xapi = createDeviceEmitter({
      command,
      event: {
        on: vi.fn((_path: string, callback: (event: unknown) => void) => {
          feedback = callback;
          return stopFeedback;
        }),
      },
    });
    const session = createDeviceInstallationSession({
      connect: vi.fn(async () => xapi),
      verify: vi.fn(async () => verifiedDevice),
    });
    await session.connect(credentials, 'SERIAL-1');

    let settled = false;
    const installation = session.install({
      dependencies: [{ name: 'dependency', source: 'source' }],
      macroName: 'macro',
      macroSource: 'source',
    }, vi.fn()).finally(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(feedback).toBeTypeOf('function'));
    feedback?.({ MacroName: 'macro', Message: 'Joystick Ready with Pan/Tilt/Zoom' });
    expect(command).not.toHaveBeenCalled();

    resolveRegistration?.();
    await vi.waitFor(() => expect(command).toHaveBeenCalledWith('Macros Runtime Restart'));
    resolveRestart?.();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    expect(settled).toBe(false);

    feedback?.({ MacroName: 'macro', Message: 'Joystick Ready with Pan/Tilt/Zoom' });
    await expect(installation).resolves.toMatchObject({ kind: 'ready' });
    expect(stopFeedback).toHaveBeenCalledOnce();
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
