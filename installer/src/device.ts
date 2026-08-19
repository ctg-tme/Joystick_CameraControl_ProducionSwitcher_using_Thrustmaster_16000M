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

export interface InstallSources {
  dependencyName: string;
  dependencySource: string;
  macroName: string;
  macroSource: string;
}

export type InitializationResult =
  | { kind: 'ready'; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'timeout'; message: string };

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
      if (error) {
        xapi.close();
        reject(error);
      } else {
        xapi.on('error', () => undefined);
        resolve(xapi);
      }
    };
    const onError = () => finish(new Error(
      'Unable to connect. Trust the device certificate, verify the address, and confirm the administrator credentials.',
    ));
    const timer = globalThis.setTimeout(
      () => finish(new Error('The device connection timed out. Trust its certificate in this browser, then retry.')),
      timeoutMs,
    );
    xapi.on('error', onError);
    xapi.on('ready', () => finish());
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

async function verifyConnectedDevice(
  xapi: DeviceXapi,
  expectedSerial: string,
): Promise<VerifiedDevice> {
  const [serial, version, product, calls] = await Promise.all([
    xapi.status.get('SystemUnit Hardware Module SerialNumber'),
    xapi.status.get('SystemUnit Software Version'),
    xapi.status.get('SystemUnit ProductPlatform'),
    xapi.status.get('SystemUnit State NumberOfActiveCalls'),
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
  const result = await xapi.command('Macros Macro Get', { Name: macroName, Content: 'True' });
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

async function installAndVerify(
  xapi: DeviceXapi,
  sources: InstallSources,
  onProgress: (message: string) => void,
  timeoutMs = 45_000,
): Promise<InitializationResult> {
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
    const macroName = eventMacroName(event);
    if (macroName && macroName !== sources.macroName) return;
    const text = eventText(event);
    if (text.includes('Joystick Ready with Pan/Tilt/Zoom')) {
      finishMonitor({ kind: 'ready', message: 'The joystick macro reported that it is ready.' });
    } else if (/(SyntaxError|ReferenceError|TypeError|Macro initialization failed)/i.test(text)) {
      finishMonitor({ kind: 'failed', message: 'The joystick macro reported an initialization failure.' });
    }
  });

  try {
    for (const name of [sources.dependencyName, sources.macroName]) {
      onProgress(`Ensuring ${name} is inactive before saving`);
      try {
        await xapi.command('Macros Macro Deactivate', { Name: name });
      } catch {
        // A first installation has nothing to deactivate.
      }
    }

    onProgress(`Saving dependency ${sources.dependencyName}`);
    await xapi.command(
      'Macros Macro Save',
      { Name: sources.dependencyName, Overwrite: 'True', Transpile: 'True' },
      sources.dependencySource,
    );

    onProgress(`Saving configured macro ${sources.macroName}`);
    await xapi.command(
      'Macros Macro Save',
      { Name: sources.macroName, Overwrite: 'True', Transpile: 'True' },
      sources.macroSource,
    );

    onProgress(`Activating ${sources.macroName}`);
    await xapi.command('Macros Macro Activate', { Name: sources.macroName });

    onProgress('Restarting the macro runtime — all active macros will restart');
    await xapi.command('Macros Runtime Restart');

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
    stopFeedback();
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
  connect(credentials: DeviceCredentials, expectedSerial: string): Promise<DeviceInstallationState>;
  fetchInstalledMacro(macroName: string): Promise<string>;
  recheck(): Promise<DeviceInstallationState>;
  install(sources: InstallSources, onProgress: (message: string) => void): Promise<InitializationResult>;
  disconnect(): void;
}

interface DeviceInstallationDependencies {
  connect(credentials: DeviceCredentials): Promise<DeviceXapi>;
  verify(xapi: DeviceXapi, expectedSerial: string): Promise<VerifiedDevice>;
  fetch(xapi: DeviceXapi, macroName: string): Promise<string>;
  install(
    xapi: DeviceXapi,
    sources: InstallSources,
    onProgress: (message: string) => void,
  ): Promise<InitializationResult>;
}

const defaultDeviceInstallationDependencies: DeviceInstallationDependencies = {
  connect: connectToDevice,
  verify: verifyConnectedDevice,
  fetch: fetchMacroSource,
  install: installAndVerify,
};

class RoomOsDeviceInstallationSession implements DeviceInstallationSession {
  private device?: DeviceXapi;
  private host?: string;
  private expectedSerial?: string;
  private verifiedDevice?: VerifiedDevice;
  private installationResult?: InitializationResult;

  constructor(private readonly dependencies: DeviceInstallationDependencies) {}

  snapshot(): DeviceInstallationState {
    return {
      connected: this.device !== undefined,
      host: this.host,
      verifiedDevice: this.verifiedDevice,
      installationResult: this.installationResult,
    };
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
      candidate = await this.dependencies.connect(normalizedCredentials);
      const verifiedDevice = await this.dependencies.verify(candidate, expectedSerial);
      if (!verifiedDevice.serialMatches) {
        throw new Error('The connected device did not match the expected serial number.');
      }
      this.device = candidate;
      this.host = normalizedCredentials.host;
      this.expectedSerial = expectedSerial;
      this.verifiedDevice = verifiedDevice;
      this.installationResult = undefined;
      return this.snapshot();
    } catch (error) {
      candidate?.close();
      this.clearState();
      throw error;
    }
  }

  async fetchInstalledMacro(macroName: string): Promise<string> {
    return this.dependencies.fetch(this.requireDevice(), macroName);
  }

  async recheck(): Promise<DeviceInstallationState> {
    const device = this.requireDevice();
    if (!this.expectedSerial) throw new Error('Connect and verify the RoomOS device before continuing.');
    this.verifiedDevice = await this.dependencies.verify(device, this.expectedSerial);
    if (!this.verifiedDevice.serialMatches) {
      throw new Error('The connected device no longer matches the expected serial number.');
    }
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
    this.installationResult = await this.dependencies.install(this.requireDevice(), sources, onProgress);
    return this.installationResult;
  }

  disconnect(): void {
    try {
      this.device?.close();
    } finally {
      this.clearState();
    }
  }

  private requireDevice(): DeviceXapi {
    if (!this.device || !this.verifiedDevice?.serialMatches) {
      throw new Error('Connect and verify the RoomOS device before continuing.');
    }
    return this.device;
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
