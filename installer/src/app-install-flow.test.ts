import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfiguratorApp } from './app';
import { generateConfiguredMacro } from './config';
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
  kind: 'release',
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

function testWorkflow(currentStep: WorkflowNavigation['currentStep'] = 4): WorkflowNavigation {
  return {
    currentStep,
    initialize: vi.fn(),
    navigate: vi.fn(() => false),
    markProgress: vi.fn(),
  };
}

function unknownReleaseMacro(): string {
  return generateConfiguredMacro(installerSources.macroTemplate, createDefaultState());
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

  it('shows the latest published Release as the About macro version', () => {
    const app = new ConfiguratorApp(testRoot(), undefined, testWorkflow());
    const testableApp = app as unknown as {
      catalog: ReleaseCatalog;
      sources: InstallerSources;
      releaseResolution: MacroReleaseResolution;
      renderAboutModal(): string;
    };
    testableApp.catalog = catalog;
    testableApp.sources = {
      ...installerSources,
      release: { ...installerSources.release, tag: 'v1.5.0' },
    };
    testableApp.releaseResolution = {
      origin: 'upload',
      recognition: 'older',
      detectedTag: 'v1.5.0',
      targetTag: 'v1.5.0',
      targetChosenExplicitly: false,
    };

    const html = testableApp.renderAboutModal();

    expect(html).toContain('<dt>Macro version</dt><dd><code>v2.0.0</code><small>Latest published Release</small></dd>');
    expect(html).toContain('<dt>Selected source</dt><dd><code>v1.5.0</code></dd>');
  });

  it('keeps an imported macro on Introduction so its source Release status is visible', async () => {
    const workflow = testWorkflow(1);
    const session: DeviceInstallationSession = {
      snapshot: () => ({ connected: false }),
      connect: vi.fn(),
      fetchInstalledMacro: vi.fn(),
      discoverCameraSources: vi.fn(async () => []),
      recheck: vi.fn(),
      install: vi.fn(),
      disconnect: vi.fn(),
    };
    const app = new ConfiguratorApp(testRoot(), session, workflow);
    const testableApp = app as unknown as {
      catalog: ReleaseCatalog;
      releaseResolution: MacroReleaseResolution;
      importMacroFile(input: HTMLInputElement): Promise<void>;
    };
    testableApp.catalog = catalog;

    await testableApp.importMacroFile({
      files: [{
        name: 'unknown-release.js',
        size: 512,
        text: vi.fn(async () => unknownReleaseMacro()),
      }],
    } as unknown as HTMLInputElement);

    expect(testableApp.releaseResolution).toMatchObject({
      origin: 'upload',
      recognition: 'unknown',
    });
    expect(workflow.navigate).not.toHaveBeenCalled();
    expect(workflow.currentStep).toBe(1);
  });

  it('keeps a fetched macro on Introduction so its source Release status is visible', async () => {
    const workflow = testWorkflow(1);
    const fetchInstalledMacro = vi.fn(async () => unknownReleaseMacro());
    const session: DeviceInstallationSession = {
      snapshot: () => ({
        connected: true,
        host: 'room.example.test',
        verifiedDevice: {
          productPlatform: 'Room Kit Pro',
          roomOsVersion: 'RoomOS 26',
          serialMatches: true,
          activeCalls: 0,
        },
      }),
      connect: vi.fn(),
      fetchInstalledMacro,
      discoverCameraSources: vi.fn(async () => []),
      recheck: vi.fn(),
      install: vi.fn(),
      disconnect: vi.fn(),
    };
    const app = new ConfiguratorApp(testRoot(), session, workflow);
    const testableApp = app as unknown as {
      catalog: ReleaseCatalog;
      releaseResolution: MacroReleaseResolution;
      beginDeviceMacroFetch(): Promise<void>;
    };
    testableApp.catalog = catalog;

    await testableApp.beginDeviceMacroFetch();

    expect(fetchInstalledMacro).toHaveBeenCalledOnce();
    expect(testableApp.releaseResolution).toMatchObject({
      origin: 'device',
      recognition: 'unknown',
    });
    expect(workflow.navigate).not.toHaveBeenCalled();
    expect(workflow.currentStep).toBe(1);
  });

  it('shows the post-verification confirmation before a first installation writes to the device', async () => {
    let state: DeviceInstallationState = { connected: false };
    const install = vi.fn(async (_sources: InstallSources, onProgress: (message: string) => void) => {
      onProgress('Installed test macros');
      return { kind: 'ready' as const, message: 'Ready' };
    });
    const recheck = vi.fn(async () => state);
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
      discoverCameraSources: vi.fn(async () => []),
      recheck,
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
      installConfirmationOpen: boolean;
      openDeviceConnection(fetchMacro: boolean): void;
      connectDevice(): Promise<void>;
      renderInstallConfirmationModal(): string;
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

    expect(install).not.toHaveBeenCalled();
    expect(recheck).toHaveBeenCalledOnce();
    expect(testableApp.installConfirmationOpen).toBe(true);
    expect(testableApp.renderInstallConfirmationModal()).toContain('Room Kit Pro · RoomOS 26');
    expect(testableApp.renderInstallConfirmationModal()).toContain('No active calls detected');
  });

  it('surfaces an unexpected device disconnect in the UI', () => {
    let onConnectionLost: ((message: string) => void) | undefined;
    const session = {
      snapshot: () => ({ connected: false }),
      connect: vi.fn(),
      fetchInstalledMacro: vi.fn(),
      discoverCameraSources: vi.fn(async () => []),
      recheck: vi.fn(),
      install: vi.fn(),
      disconnect: vi.fn(),
      onConnectionLost: vi.fn((listener: (message: string) => void) => {
        onConnectionLost = listener;
        return vi.fn();
      }),
    } satisfies DeviceInstallationSession;
    const app = new ConfiguratorApp(testRoot(), session, testWorkflow());
    const testableApp = app as unknown as {
      errorMessage: string;
      statusMessage: string;
      installConfirmationOpen: boolean;
      renderReviewActions(): string;
    };
    testableApp.installConfirmationOpen = true;

    onConnectionLost?.('The RoomOS connection was lost. Reconnect before continuing.');

    expect(testableApp.errorMessage).toContain('RoomOS connection was lost');
    expect(testableApp.statusMessage).toBe('The verified device connection ended unexpectedly.');
    expect(testableApp.installConfirmationOpen).toBe(false);
    expect(testableApp.renderReviewActions()).toContain('Verified device connection ended');
    expect(testableApp.renderReviewActions()).toContain('Reconnect before continuing.');
  });

  it('connects and discovers cameras without fetching or installing the macro', async () => {
    let state: DeviceInstallationState = { connected: false };
    const fetchInstalledMacro = vi.fn();
    const install = vi.fn();
    const discoverCameraSources = vi.fn(async () => [{
      ConnectorId: '2',
      Name: 'Presenter',
      ControlId: '1',
      cameraControlMode: 'On',
      connection: 'connected' as const,
      model: 'Quad Camera',
    }]);
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
      fetchInstalledMacro,
      discoverCameraSources,
      recheck: vi.fn(async () => state),
      install,
      disconnect: vi.fn(),
    };
    const app = new ConfiguratorApp(testRoot(), session, testWorkflow(2));
    const testableApp = app as unknown as {
      credentials: DeviceCredentials;
      expectedSerial: string;
      discoveredCameras: unknown[];
      openDeviceConnection(fetchMacro: boolean, discoverCameras?: boolean): void;
      connectDevice(): Promise<void>;
    };
    testableApp.credentials = {
      host: 'room.example.test',
      username: 'admin',
      password: 'secret',
    };
    testableApp.expectedSerial = 'SERIAL-1';

    testableApp.openDeviceConnection(false, true);
    await testableApp.connectDevice();

    expect(discoverCameraSources).toHaveBeenCalledOnce();
    expect(testableApp.discoveredCameras).toHaveLength(1);
    expect(fetchInstalledMacro).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });

  it('updates a discovered connector in place while preserving its relationships', () => {
    const session: DeviceInstallationSession = {
      snapshot: () => ({ connected: false }),
      connect: vi.fn(),
      fetchInstalledMacro: vi.fn(),
      discoverCameraSources: vi.fn(async () => []),
      recheck: vi.fn(),
      install: vi.fn(),
      disconnect: vi.fn(),
    };
    const app = new ConfiguratorApp(testRoot(), session, testWorkflow(2));
    const testableApp = app as unknown as {
      state: ConfiguratorState;
      discoveredCameras: Array<{
        ConnectorId: string;
        Name: string;
        ControlId: string | null;
        connection: 'connected';
      }>;
      addOrUpdateDiscoveredCamera(connectorId: string): void;
    };
    const original = createDefaultState();
    testableApp.state = original;
    testableApp.discoveredCameras = [{
      ConnectorId: '1',
      Name: 'Presenter',
      ControlId: '3',
      connection: 'connected',
    }];
    const originalId = original.cameras[0].id;
    const originalAssignment = original.assignments[12];

    testableApp.addOrUpdateDiscoveredCamera('1');

    expect(testableApp.state.cameras[0]).toMatchObject({
      id: originalId,
      Name: 'Presenter',
      ConnectorId: '1',
      ControlId: '3',
    });
    expect(testableApp.state.defaultCameraId).toBe(originalId);
    expect(testableApp.state.assignments[12]).toBe(originalAssignment);
  });

  it('renders each discovered camera as a single action row with details in an info tooltip', () => {
    const session: DeviceInstallationSession = {
      snapshot: () => ({
        connected: true,
        host: 'room.example.test',
        verifiedDevice: {
          productPlatform: 'Codec Pro G2',
          roomOsVersion: 'RoomOS 26',
          serialMatches: true,
          activeCalls: 0,
        },
      }),
      connect: vi.fn(),
      fetchInstalledMacro: vi.fn(),
      discoverCameraSources: vi.fn(async () => []),
      recheck: vi.fn(),
      install: vi.fn(),
      disconnect: vi.fn(),
    };
    const app = new ConfiguratorApp(testRoot(), session, testWorkflow(2));
    const testableApp = app as unknown as {
      discoveredCameras: Array<{
        ConnectorId: string;
        Name: string;
        ControlId: string | null;
        connection: 'connected' | 'disconnected' | 'unavailable';
        cameraControlMode?: string;
        model?: string;
      }>;
      renderDiscoveredCameras(): string;
    };
    testableApp.discoveredCameras = [{
      ConnectorId: '8',
      Name: 'Ethernet 1',
      ControlId: '9',
      connection: 'connected',
      cameraControlMode: 'Off',
      model: 'Room Vision PTZ',
    }, {
      ConnectorId: '9',
      Name: 'Presenter',
      ControlId: '10',
      connection: 'disconnected',
      model: 'Precision 60',
    }, {
      ConnectorId: '10',
      Name: 'USB Camera',
      ControlId: null,
      connection: 'unavailable',
    }];

    const html = testableApp.renderDiscoveredCameras();

    expect(html).toContain('<strong class="discovered-camera-name" title="Ethernet 1">Ethernet 1</strong>');
    expect(html).toContain('class="discovered-camera-card discovered-camera-card-connected"');
    expect(html).toContain('class="discovered-camera-card discovered-camera-card-disconnected"');
    expect(html).toContain('class="discovered-camera-card discovered-camera-card-unavailable"');
    expect(html).toContain('data-use-discovered-camera="8"');
    expect(html).toContain('class="field-info discovered-camera-info"');
    expect(html).toContain('Connected · ConnectorId: 8 · ControlId: 9 · Model: Room Vision PTZ');
    expect(html).toContain('Warnings: Device camera control is disabled');
    expect(html).not.toContain('<dl>');
    expect(html).not.toContain('camera-connection');
    expect(html).not.toContain('camera-discovery-warnings');
  });

  it('migrates a fetched unknown source without writing to the device or leaving update mode', async () => {
    const install = vi.fn();
    const fetchInstalledMacro = vi.fn();
    const session: DeviceInstallationSession = {
      snapshot: () => ({ connected: false }),
      connect: vi.fn(),
      fetchInstalledMacro,
      discoverCameraSources: vi.fn(async () => []),
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
