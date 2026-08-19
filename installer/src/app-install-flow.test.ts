import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfiguratorApp } from './app';
import type {
  DeviceCredentials,
  DeviceInstallationSession,
  DeviceInstallationState,
  InstallSources,
} from './device';
import type { InstallerSources } from './source';
import type { WorkflowNavigation } from './workflow';

vi.mock('./source', async () => {
  const source = await vi.importActual<typeof import('./source')>('./source');
  return {
    ...source,
    loadDependencySource: vi.fn(async () => 'dependency source'),
  };
});

const installerSources: InstallerSources = {
  manifest: {
    version: 'test',
    macro: {
      fileName: 'Joystick_CameraControl_ProductionSwitcher.js',
      macroName: 'Joystick_CameraControl_ProductionSwitcher',
      sha256: 'test',
    },
    dependency: {
      fileName: 'Thrustmaster_16000M-Class.js',
      macroName: 'Thrustmaster_16000M-Class',
      sourceUrl: 'https://example.test/Thrustmaster_16000M-Class.js',
    },
  },
  macroTemplate: [
    '/* JOYSTICK_CONFIG_START */',
    'const config = {};',
    '/* JOYSTICK_CONFIG_END */',
  ].join('\n'),
};

function testRoot(): HTMLElement {
  return {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => [],
  } as unknown as HTMLElement;
}

function testWorkflow(): WorkflowNavigation {
  return {
    currentStep: 4,
    initialize: vi.fn(),
    navigate: vi.fn(() => false),
    markProgress: vi.fn(),
  };
}

describe('direct installation connection flow', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
      matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
      })),
      setTimeout,
    });
  });

  it('continues the requested installation immediately after connecting and verifying', async () => {
    let state: DeviceInstallationState = { connected: false };
    const install = vi.fn(async (_sources: InstallSources, onProgress: (message: string) => void) => {
      onProgress('Installed test macros');
      return { kind: 'ready' as const, message: 'Ready' };
    });
    const session: DeviceInstallationSession = {
      snapshot: () => state,
      connect: vi.fn(async () => {
        state = {
          connected: true,
          host: 'room.example.test',
          verifiedDevice: {
            productPlatform: 'Room Kit Pro',
            roomOsVersion: 'RoomOS 26',
            serialMatches: true,
            activeCalls: 0,
          },
        };
        return state;
      }),
      fetchInstalledMacro: vi.fn(),
      recheck: vi.fn(async () => state),
      install,
      disconnect: vi.fn(),
    };
    const app = new ConfiguratorApp(testRoot(), session, testWorkflow());
    const testableApp = app as unknown as {
      sources: InstallerSources;
      credentials: DeviceCredentials;
      expectedSerial: string;
      openDeviceConnection(fetchMacro: boolean): void;
      connectDevice(): Promise<void>;
    };
    testableApp.sources = installerSources;
    testableApp.credentials = {
      host: 'room.example.test',
      username: 'admin',
      password: 'secret',
    };
    testableApp.expectedSerial = 'SERIAL-1';

    testableApp.openDeviceConnection(false);
    await testableApp.connectDevice();

    expect(install).toHaveBeenCalledOnce();
  });
});
