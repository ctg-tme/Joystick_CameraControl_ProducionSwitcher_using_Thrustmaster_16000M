import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfiguratorApp } from './app';
import type {
  DeviceCredentials,
  DeviceInstallationSession,
  DeviceInstallationState,
  InstallSources,
} from './device';
import { createDefaultState, type ConfiguratorState } from './model';
import type { InstallerSources, MacroReleaseResolution, ReleaseCatalog } from './source';
import type { WorkflowNavigation } from './workflow';

const digest = 'a'.repeat(64);
const catalog: ReleaseCatalog = {
  version: 1,
  repositoryVersion: 'v2.0.0',
  latest: 'v2.0.0',
  releases: [{
    tag: 'v2.0.0',
    publishedAt: '2026-08-19T12:00:00Z',
    releaseUrl: 'https://example.test/v2.0.0',
    macro: {
      fileName: 'Joystick_CameraControl_ProductionSwitcher.js',
      macroName: 'Joystick_CameraControl_ProductionSwitcher',
      sha256: digest,
      path: 'releases/v2.0.0/Joystick_CameraControl_ProductionSwitcher.js',
    },
    dependencies: [{
      repo: 'ctg-tme/Thrustmaster_16000M-InputDevice-Class',
      release: 'v1.0.0',
      fileName: 'Thrustmaster_16000M-Class.js',
      macroName: 'Thrustmaster_16000M-Class',
      sha256: digest,
      path: 'releases/v2.0.0/dependencies/input/v1.0.0/Thrustmaster_16000M-Class.js',
    }],
  }],
};

const installerSources: InstallerSources = {
  release: catalog.releases[0],
  macroTemplate: [
    '/* JOYSTICK_CONFIG_START */',
    'const config = {};',
    '/* JOYSTICK_CONFIG_END */',
  ].join('\n'),
  dependencies: [{
    manifest: catalog.releases[0].dependencies[0],
    source: 'dependency source',
  }],
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
      catalog: ReleaseCatalog;
      releaseResolution: MacroReleaseResolution;
      credentials: DeviceCredentials;
      expectedSerial: string;
      openDeviceConnection(fetchMacro: boolean): void;
      connectDevice(): Promise<void>;
    };
    testableApp.sources = installerSources;
    testableApp.catalog = catalog;
    testableApp.releaseResolution = {
      origin: 'fresh',
      recognition: 'fresh',
      targetTag: 'v2.0.0',
      targetChosenExplicitly: false,
    };
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

  it('migrates a fetched unknown source without writing to the device or leaving update mode', async () => {
    const install = vi.fn();
    const fetchInstalledMacro = vi.fn();
    const session: DeviceInstallationSession = {
      snapshot: () => ({ connected: false }),
      connect: vi.fn(),
      fetchInstalledMacro,
      recheck: vi.fn(),
      install,
      disconnect: vi.fn(),
    };
    const app = new ConfiguratorApp(testRoot(), session, testWorkflow());
    const testableApp = app as unknown as {
      state: ConfiguratorState;
      sources?: InstallerSources;
      catalog: ReleaseCatalog;
      releaseResolution: MacroReleaseResolution;
      releaseSourceCache: Map<string, InstallerSources>;
      installationMode: 'install' | 'update';
      migrateToLatest(): Promise<void>;
    };
    testableApp.catalog = catalog;
    testableApp.releaseResolution = {
      origin: 'device',
      recognition: 'unknown',
      targetChosenExplicitly: false,
    };
    testableApp.installationMode = 'update';
    testableApp.state = createDefaultState();
    testableApp.state.projectName = 'Preserve every field';
    testableApp.state.panTiltRampSpeed = 21;
    testableApp.releaseSourceCache.set('v2.0.0', installerSources);
    const before = structuredClone(testableApp.state);

    await testableApp.migrateToLatest();

    expect(testableApp.state).toEqual(before);
    expect(testableApp.installationMode).toBe('update');
    expect(testableApp.sources).toBe(installerSources);
    expect(testableApp.releaseResolution).toMatchObject({
      origin: 'device',
      targetTag: 'v2.0.0',
      targetChosenExplicitly: true,
    });
    expect(fetchInstalledMacro).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });
});
