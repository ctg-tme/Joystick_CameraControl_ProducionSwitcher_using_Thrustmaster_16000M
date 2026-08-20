import { connect } from 'jsxapi';

export type DeviceXapi = ReturnType<typeof connect>;

export interface DeviceCredentials {
  host: string;
  username: string;
  password: string;
}

export interface VerifiedDevice {
  productPlatform: string;
  roomOsVersion: string;
  serialMatches: boolean;
  activeCalls: number;
}

export type DiscoveredCameraConnection = 'connected' | 'disconnected' | 'unavailable';

export interface DiscoveredCameraSource {
  ConnectorId: string;
  Name: string;
  ControlId: string | null;
  cameraControlMode?: string;
  connection: DiscoveredCameraConnection;
  model?: string;
}

export interface CameraDiscoveryStatuses {
  cameras?: unknown;
}

export interface InstallSources {
  dependencies: Array<{
    name: string;
    source: string;
  }>;
  macroName: string;
  macroSource: string;
}

export type InitializationResult =
  | { kind: 'ready'; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'timeout'; message: string };

const DEFAULT_OPERATION_TIMEOUT_MS = 20_000;
const DEFAULT_INSTALLATION_TIMEOUT_MS = 90_000;

class DeviceOperationTimeoutError extends Error {}

function operationTimeoutError(description: string, timeoutMs: number): DeviceOperationTimeoutError {
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  return new DeviceOperationTimeoutError(
    `${description} timed out after ${seconds} second${seconds === 1 ? '' : 's'}. Reconnect to the RoomOS device before retrying.`,
  );
}

function withOperationDeadline<T>(
  operation: PromiseLike<T> | T,
  description: string,
  timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(operationTimeoutError(description, timeoutMs));
    }, timeoutMs);
    Promise.resolve(operation).then(
      (value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function normalizeDeviceHost(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Enter the RoomOS device address.');
  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error('Enter a valid RoomOS hostname or IP address.');
  }
  if (!url.host || url.username || url.password) {
    throw new Error('Enter a valid RoomOS hostname or IP address.');
  }
  return url.host;
}

export function normalizeSerial(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function connectToDevice(credentials: DeviceCredentials, timeoutMs = 20_000): Promise<DeviceXapi> {
  return new Promise((resolve, reject) => {
    const xapi = connect(`wss://${credentials.host}`, {
      username: credentials.username,
      password: credentials.password,
    });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      xapi.removeListener('error', onError);
      xapi.removeListener('close', onClose);
      xapi.removeListener('ready', onReady);
      if (error) {
        xapi.close();
        reject(error);
      } else {
        resolve(xapi);
      }
    };
    const onError = () => finish(new Error(
      'Unable to connect. Trust the device certificate, verify the address, and confirm the administrator credentials.',
    ));
    const onClose = () => finish(new Error(
      'The device connection closed before verification completed. Trust its certificate, then retry.',
    ));
    const onReady = () => finish();
    const timer = globalThis.setTimeout(
      () => finish(new Error('The device connection timed out. Trust its certificate in this browser, then retry.')),
      timeoutMs,
    );
    xapi.on('error', onError);
    xapi.on('close', onClose);
    xapi.on('ready', onReady);
  });
}

function scalarString(value: unknown): string {
  if (Array.isArray(value) && value.length) return scalarString(value[0]);
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.Value === 'string' || typeof record.Value === 'number') return String(record.Value);
  }
  throw new Error('The device returned an unexpected status value.');
}

function optionalScalarString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const scalar = optionalScalarString(item);
      if (scalar !== undefined) return scalar;
    }
    return undefined;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  return optionalScalarString(record.Value);
}

function objectField(record: Record<string, unknown>, ...names: string[]): unknown {
  const normalizedNames = new Set(names.map((name) => name.toLowerCase()));
  const key = Object.keys(record).find((candidate) => normalizedNames.has(candidate.toLowerCase()));
  return key === undefined ? undefined : record[key];
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function collectionItems(
  value: unknown,
  collectionName: string,
  isItem: (record: Record<string, unknown>) => boolean,
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const record = recordValue(item);
      return record ? [record] : [];
    });
  }
  const record = recordValue(value);
  if (!record) return [];
  if (isItem(record)) return [record];

  const direct = objectField(record, collectionName);
  if (direct !== undefined) {
    const items = collectionItems(direct, collectionName, isItem);
    if (items.length) return items;
  }
  for (const child of Object.values(record)) {
    const items = collectionItems(child, collectionName, isItem);
    if (items.length) return items;
  }
  return [];
}

/** Normalizes JSXAPI collection/container variants into installer camera-source records. */
export function discoverCameraSourcesFromResponses(
  connectorConfiguration: unknown,
  statuses: CameraDiscoveryStatuses,
): DiscoveredCameraSource[] {
  const connectors = collectionItems(
    connectorConfiguration,
    'Connector',
    (record) => objectField(record, 'InputSourceType') !== undefined,
  );
  const cameras = collectionItems(
    statuses.cameras,
    'Camera',
    (record) => objectField(record, 'Connected', 'Model') !== undefined,
  );
  const camerasById = new Map<string, Record<string, unknown>>();
  for (const camera of cameras) {
    const id = optionalScalarString(objectField(camera, 'id', 'Id'))?.trim();
    if (id) camerasById.set(id, camera);
  }
  const connectionFromStatus = (value: unknown): DiscoveredCameraConnection | undefined => {
    const normalized = optionalScalarString(value)?.trim().toLowerCase();
    if (normalized === 'true') return 'connected';
    if (normalized === 'false') return 'disconnected';
    if (normalized === 'unknown') return 'unavailable';
    return undefined;
  };
  const connectionOrder: Record<DiscoveredCameraConnection, number> = {
    connected: 0,
    disconnected: 1,
    unavailable: 2,
  };

  const cameraConnectors = connectors.filter(
    (connector) => optionalScalarString(objectField(connector, 'InputSourceType'))?.toLowerCase() === 'camera',
  );

  return cameraConnectors
    .flatMap((connector): DiscoveredCameraSource[] => {
      const connectorId = optionalScalarString(objectField(connector, 'id', 'Id'))?.trim();
      if (!connectorId) return [];
      const cameraControl = recordValue(objectField(connector, 'CameraControl'));
      const configuredControlId = optionalScalarString(
        cameraControl && objectField(cameraControl, 'CameraId'),
      )?.trim() || null;
      const matchedStatus = camerasById.get(configuredControlId ?? connectorId);
      const controlId = configuredControlId
        ?? optionalScalarString(matchedStatus && objectField(matchedStatus, 'id', 'Id'))?.trim()
        ?? null;
      const connection = connectionFromStatus(matchedStatus && objectField(matchedStatus, 'Connected'))
        ?? 'unavailable';
      return [{
        ConnectorId: connectorId,
        Name: optionalScalarString(objectField(connector, 'Name'))?.trim() ?? '',
        ControlId: controlId,
        cameraControlMode: optionalScalarString(cameraControl && objectField(cameraControl, 'Mode')),
        connection,
        model: optionalScalarString(matchedStatus && objectField(matchedStatus, 'Model'))?.trim() || undefined,
      }];
    })
    .sort((left, right) => connectionOrder[left.connection] - connectionOrder[right.connection]
      || left.ConnectorId.localeCompare(right.ConnectorId, undefined, { numeric: true }));
}

async function discoverCameraSources(xapi: DeviceXapi): Promise<DiscoveredCameraSource[]> {
  const connectorConfiguration = await withOperationDeadline(
    xapi.config.get('Video Input Connector'),
    'Reading the camera connector configuration',
  );
  const cameraStatus = await withOperationDeadline(
    xapi.status.get('Cameras'),
    'Reading camera status',
  ).catch((error: unknown) => {
    if (error instanceof DeviceOperationTimeoutError) throw error;
    return undefined;
  });
  return discoverCameraSourcesFromResponses(connectorConfiguration, {
    cameras: cameraStatus,
  });
}

async function verifyConnectedDevice(
  xapi: DeviceXapi,
  expectedSerial: string,
): Promise<VerifiedDevice> {
  const [serial, version, product, calls] = await Promise.all([
    withOperationDeadline(
      xapi.status.get('SystemUnit Hardware Module SerialNumber'),
      'Reading the device serial number',
    ),
    withOperationDeadline(
      xapi.status.get('SystemUnit Software Version'),
      'Reading the RoomOS version',
    ),
    withOperationDeadline(
      xapi.status.get('SystemUnit ProductPlatform'),
      'Reading the device product platform',
    ),
    withOperationDeadline(
      xapi.status.get('SystemUnit State NumberOfActiveCalls'),
      'Reading the active call count',
    ),
  ]);
  const activeCalls = Number(scalarString(calls));
  return {
    productPlatform: scalarString(product),
    roomOsVersion: scalarString(version),
    serialMatches: normalizeSerial(scalarString(serial)) === normalizeSerial(expectedSerial),
    activeCalls: Number.isFinite(activeCalls) ? activeCalls : 0,
  };
}

function macroContentFromResponse(value: unknown, expectedName: string): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const content = macroContentFromResponse(entry, expectedName);
      if (content !== undefined) return content;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.Content === 'string' &&
    (record.Name === undefined || record.Name === expectedName)
  ) {
    return record.Content;
  }
  for (const child of Object.values(record)) {
    const content = macroContentFromResponse(child, expectedName);
    if (content !== undefined) return content;
  }
  return undefined;
}

async function fetchMacroSource(xapi: DeviceXapi, macroName: string): Promise<string> {
  const result = await withOperationDeadline(
    xapi.command('Macros Macro Get', { Name: macroName, Content: 'True' }),
    `Fetching the installed ${macroName} macro`,
  );
  const content = macroContentFromResponse(result, macroName);
  if (content === undefined) {
    throw new Error(`RoomOS did not return source for ${macroName}. Confirm that the macro is installed.`);
  }
  if (content.length > 1024 * 1024) {
    throw new Error('The device macro is too large to import.');
  }
  return content;
}

function eventText(event: unknown): string {
  return typeof event === 'string' ? event : JSON.stringify(event);
}

function eventMacroName(event: unknown): string | undefined {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return undefined;
  const record = event as Record<string, unknown>;
  const name = record.MacroName ?? record.Macro ?? record.Name;
  return typeof name === 'string' ? name : undefined;
}

function runCommand<T = unknown>(
  xapi: DeviceXapi,
  path: string,
  params?: object,
  body?: string,
): Promise<T> {
  return withOperationDeadline(
    xapi.command<T>(path, params, body),
    `RoomOS command ${path}`,
  );
}

interface FeedbackRegistration {
  (): void;
  registration?: PromiseLike<unknown>;
}

async function installAndVerify(
  xapi: DeviceXapi,
  sources: InstallSources,
  onProgress: (message: string) => void,
  timeoutMs = 45_000,
): Promise<InitializationResult> {
  let runtimeRestartStarted = false;
  let finishMonitor: (result: InitializationResult) => void = () => undefined;
  let monitorSettled = false;
  const monitor = new Promise<InitializationResult>((resolve) => {
    finishMonitor = (result) => {
      if (monitorSettled) return;
      monitorSettled = true;
      resolve(result);
    };
  });
  const stopFeedback = xapi.event.on('Macros Log', (event: unknown) => {
    if (!runtimeRestartStarted) return;
    const macroName = eventMacroName(event);
    if (macroName && macroName !== sources.macroName) return;
    const text = eventText(event);
    if (text.includes('Joystick Ready with Pan/Tilt/Zoom')) {
      finishMonitor({ kind: 'ready', message: 'The joystick macro reported that it is ready.' });
    } else if (/(SyntaxError|ReferenceError|TypeError|Macro initialization failed)/i.test(text)) {
      finishMonitor({ kind: 'failed', message: 'The joystick macro reported an initialization failure.' });
    }
  }) as FeedbackRegistration;
  let feedbackCleanupRequested = false;
  const stopFeedbackSafely = () => {
    feedbackCleanupRequested = true;
    stopFeedback();
  };

  try {
    if (stopFeedback.registration) {
      void Promise.resolve(stopFeedback.registration).then(() => {
        if (feedbackCleanupRequested) stopFeedback();
      }, () => undefined);
      await withOperationDeadline(
        stopFeedback.registration,
        'Registering macro readiness feedback',
      );
    }

    for (const name of [...sources.dependencies.map((dependency) => dependency.name), sources.macroName]) {
      onProgress(`Ensuring ${name} is inactive before saving`);
      try {
        await runCommand(xapi, 'Macros Macro Deactivate', { Name: name });
      } catch (error) {
        if (error instanceof DeviceOperationTimeoutError) throw error;
        // A first installation has nothing to deactivate.
      }
    }

    for (const dependency of sources.dependencies) {
      onProgress(`Saving dependency ${dependency.name}`);
      await runCommand(
        xapi,
        'Macros Macro Save',
        { Name: dependency.name, Overwrite: 'True', Transpile: 'True' },
        dependency.source,
      );
    }

    onProgress(`Saving configured macro ${sources.macroName}`);
    await runCommand(
      xapi,
      'Macros Macro Save',
      { Name: sources.macroName, Overwrite: 'True', Transpile: 'True' },
      sources.macroSource,
    );

    onProgress(`Activating ${sources.macroName}`);
    await runCommand(xapi, 'Macros Macro Activate', { Name: sources.macroName });

    onProgress('Restarting the macro runtime — all active macros will restart');
    const restart = xapi.command('Macros Runtime Restart');
    runtimeRestartStarted = true;
    await withOperationDeadline(restart, 'RoomOS command Macros Runtime Restart');

    onProgress('Waiting for the joystick macro to report ready');
    const timeout = globalThis.setTimeout(
      () => finishMonitor({
        kind: 'timeout',
        message: 'Installation commands were accepted, but initialization was not confirmed within 45 seconds.',
      }),
      timeoutMs,
    );
    const result = await monitor;
    globalThis.clearTimeout(timeout);
    return result;
  } finally {
    stopFeedbackSafely();
  }
}

export interface DeviceInstallationState {
  connected: boolean;
  host?: string;
  verifiedDevice?: VerifiedDevice;
  installationResult?: InitializationResult;
}

/**
 * Owns the verified RoomOS socket and the complete installation lifecycle.
 * Every operation after connect uses the same verified session and expected
 * serial number; install always performs its own final call-status recheck.
 */
export interface DeviceInstallationSession {
  snapshot(): DeviceInstallationState;
  onConnectionLost?(listener: (message: string) => void): () => void;
  connect(credentials: DeviceCredentials, expectedSerial: string): Promise<DeviceInstallationState>;
  fetchInstalledMacro(macroName: string): Promise<string>;
  discoverCameraSources(): Promise<DiscoveredCameraSource[]>;
  recheck(): Promise<DeviceInstallationState>;
  install(sources: InstallSources, onProgress: (message: string) => void): Promise<InitializationResult>;
  disconnect(): void;
}

interface DeviceInstallationDependencies {
  operationTimeoutMs: number;
  installationTimeoutMs: number;
  connect(credentials: DeviceCredentials): Promise<DeviceXapi>;
  verify(xapi: DeviceXapi, expectedSerial: string): Promise<VerifiedDevice>;
  fetch(xapi: DeviceXapi, macroName: string): Promise<string>;
  discover(xapi: DeviceXapi): Promise<DiscoveredCameraSource[]>;
  install(
    xapi: DeviceXapi,
    sources: InstallSources,
    onProgress: (message: string) => void,
  ): Promise<InitializationResult>;
}

const defaultDeviceInstallationDependencies: DeviceInstallationDependencies = {
  operationTimeoutMs: DEFAULT_OPERATION_TIMEOUT_MS,
  installationTimeoutMs: DEFAULT_INSTALLATION_TIMEOUT_MS,
  connect: connectToDevice,
  verify: verifyConnectedDevice,
  fetch: fetchMacroSource,
  discover: discoverCameraSources,
  install: installAndVerify,
};

class RoomOsDeviceInstallationSession implements DeviceInstallationSession {
  private device?: DeviceXapi;
  private host?: string;
  private expectedSerial?: string;
  private verifiedDevice?: VerifiedDevice;
  private installationResult?: InitializationResult;
  private readonly connectionLostListeners = new Set<(message: string) => void>();
  private readonly pendingOperations = new Set<{
    device: DeviceXapi;
    reject(error: Error): void;
  }>();
  private transportListeners?: {
    device: DeviceXapi;
    onError(error: Error): void;
    onClose(): void;
  };

  constructor(private readonly dependencies: DeviceInstallationDependencies) {}

  snapshot(): DeviceInstallationState {
    return {
      connected: this.device !== undefined,
      host: this.host,
      verifiedDevice: this.verifiedDevice,
      installationResult: this.installationResult,
    };
  }

  onConnectionLost(listener: (message: string) => void): () => void {
    this.connectionLostListeners.add(listener);
    return () => this.connectionLostListeners.delete(listener);
  }

  async connect(credentials: DeviceCredentials, expectedSerial: string): Promise<DeviceInstallationState> {
    if (!credentials.username || !credentials.password) throw new Error('Enter administrator credentials.');
    if (!expectedSerial.trim()) throw new Error('Enter the expected device serial number.');

    const normalizedCredentials = {
      ...credentials,
      host: normalizeDeviceHost(credentials.host),
    };
    this.disconnect();

    let candidate: DeviceXapi | undefined;
    try {
      candidate = await withOperationDeadline(
        this.dependencies.connect(normalizedCredentials),
        'Connecting to the RoomOS device',
        this.dependencies.operationTimeoutMs,
      );
      this.device = candidate;
      this.host = normalizedCredentials.host;
      this.expectedSerial = expectedSerial;
      this.attachTransportListeners(candidate);
      const verifiedDevice = await this.runDeviceOperation(
        candidate,
        'Verifying the connected device',
        (device) => this.dependencies.verify(device, expectedSerial),
      );
      if (!verifiedDevice.serialMatches) {
        throw new Error('The connected device did not match the expected serial number.');
      }
      this.verifiedDevice = verifiedDevice;
      this.installationResult = undefined;
      return this.snapshot();
    } catch (error) {
      if (candidate && this.device === candidate) {
        this.terminateConnection(
          candidate,
          error instanceof Error ? error : new Error(String(error)),
          undefined,
          true,
        );
      }
      throw error;
    }
  }

  async fetchInstalledMacro(macroName: string): Promise<string> {
    const device = this.requireDevice();
    return this.runDeviceOperation(
      device,
      'Fetching the installed macro',
      (activeDevice) => this.dependencies.fetch(activeDevice, macroName),
    );
  }

  async discoverCameraSources(): Promise<DiscoveredCameraSource[]> {
    const device = this.requireDevice();
    return this.runDeviceOperation(
      device,
      'Discovering camera sources',
      (activeDevice) => this.dependencies.discover(activeDevice),
    );
  }

  async recheck(): Promise<DeviceInstallationState> {
    const device = this.requireDevice();
    const expectedSerial = this.expectedSerial;
    if (!expectedSerial) throw new Error('Connect and verify the RoomOS device before continuing.');
    const verifiedDevice = await this.runDeviceOperation(
      device,
      'Rechecking the verified device',
      (activeDevice) => this.dependencies.verify(activeDevice, expectedSerial),
    );
    if (!verifiedDevice.serialMatches) {
      this.terminateConnection(
        device,
        new Error('The connected device no longer matches the expected serial number.'),
        undefined,
        true,
      );
      throw new Error('The connected device no longer matches the expected serial number.');
    }
    this.verifiedDevice = verifiedDevice;
    return this.snapshot();
  }

  async install(
    sources: InstallSources,
    onProgress: (message: string) => void,
  ): Promise<InitializationResult> {
    this.installationResult = undefined;
    const state = await this.recheck();
    if ((state.verifiedDevice?.activeCalls ?? 0) > 0) {
      throw new Error('A call started after the confirmation prompt. Installation remains blocked.');
    }
    const device = this.requireDevice();
    this.installationResult = await this.runDeviceOperation(
      device,
      'Installing and verifying the macros',
      (activeDevice) => this.dependencies.install(activeDevice, sources, onProgress),
      this.dependencies.installationTimeoutMs,
    );
    return this.installationResult;
  }

  disconnect(): void {
    const device = this.device;
    if (!device) {
      this.clearState();
      return;
    }
    this.terminateConnection(
      device,
      new Error('The RoomOS device was disconnected.'),
      undefined,
      true,
    );
  }

  private requireDevice(): DeviceXapi {
    if (!this.device || !this.verifiedDevice?.serialMatches) {
      throw new Error('Connect and verify the RoomOS device before continuing.');
    }
    return this.device;
  }

  private runDeviceOperation<T>(
    device: DeviceXapi,
    description: string,
    operation: (device: DeviceXapi) => Promise<T>,
    timeoutMs = this.dependencies.operationTimeoutMs,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
      const finish = (error?: Error, value?: T) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) globalThis.clearTimeout(timer);
        this.pendingOperations.delete(pendingOperation);
        if (error) reject(error);
        else resolve(value as T);
      };
      const pendingOperation = {
        device,
        reject: (error: Error) => finish(error),
      };
      this.pendingOperations.add(pendingOperation);
      timer = globalThis.setTimeout(() => {
        const error = operationTimeoutError(description, timeoutMs);
        this.terminateConnection(device, error, error.message, true);
      }, timeoutMs);

      Promise.resolve().then(() => {
        if (this.device !== device) {
          throw new Error('The RoomOS connection ended before the operation could start.');
        }
        return operation(device);
      }).then(
        (value) => finish(undefined, value),
        (reason: unknown) => {
          const error = reason instanceof Error ? reason : new Error(String(reason));
          if (error instanceof DeviceOperationTimeoutError && this.device === device) {
            this.terminateConnection(device, error, error.message, true);
          } else {
            finish(error);
          }
        },
      );
    });
  }

  private attachTransportListeners(device: DeviceXapi): void {
    if (typeof device.on !== 'function') return;
    const onError = (_error: Error) => {
      const message = 'The RoomOS connection was lost after a socket error. Reconnect before continuing.';
      this.terminateConnection(device, new Error(message), message, true);
    };
    const onClose = () => {
      const message = 'The RoomOS connection was lost because the socket closed. Reconnect before continuing.';
      this.terminateConnection(device, new Error(message), message, false);
    };
    this.transportListeners = { device, onError, onClose };
    device.on('error', onError);
    device.on('close', onClose);
  }

  private detachTransportListeners(device: DeviceXapi): void {
    const listeners = this.transportListeners;
    if (!listeners || listeners.device !== device) return;
    if (typeof device.removeListener === 'function') {
      device.removeListener('error', listeners.onError);
      device.removeListener('close', listeners.onClose);
    }
    this.transportListeners = undefined;
  }

  private terminateConnection(
    device: DeviceXapi,
    error: Error,
    notification: string | undefined,
    closeDevice: boolean,
  ): void {
    if (this.device !== device) return;
    this.detachTransportListeners(device);
    this.clearState();
    for (const operation of [...this.pendingOperations]) {
      if (operation.device === device) operation.reject(error);
    }
    if (closeDevice) {
      try {
        device.close();
      } catch {
        // State and pending operations are already safe even if transport cleanup fails.
      }
    }
    if (notification) {
      for (const listener of this.connectionLostListeners) {
        try {
          listener(notification);
        } catch {
          // A UI listener must not prevent the remaining listeners from being notified.
        }
      }
    }
  }

  private clearState(): void {
    this.device = undefined;
    this.host = undefined;
    this.expectedSerial = undefined;
    this.verifiedDevice = undefined;
    this.installationResult = undefined;
  }
}

export function createDeviceInstallationSession(
  dependencies: Partial<DeviceInstallationDependencies> = {},
): DeviceInstallationSession {
  return new RoomOsDeviceInstallationSession({
    ...defaultDeviceInstallationDependencies,
    ...dependencies,
  });
}
