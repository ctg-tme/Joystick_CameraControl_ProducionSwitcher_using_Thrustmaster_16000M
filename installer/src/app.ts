import {
  generateConfigSource,
  generateConfiguredMacro,
  PROJECT_REPOSITORY_URL,
  validateConfiguratorState,
} from './config';
import {
  createDeviceInstallationSession,
  normalizeDeviceHost,
  type DiscoveredCameraSource,
  type DeviceCredentials,
  type DeviceInstallationSession,
} from './device';
import {
  BUILT_IN_ACTIONS,
  DEFAULT_ASSIGNMENTS,
  PANEL_LOCATIONS,
  PHYSICAL_BUTTONS,
  assignmentActionId,
  assignmentCameraId,
  builtInAssignment,
  cameraAssignment,
  cameraButtonActions,
  createDefaultAssignments,
  createDefaultState,
  isPreviewDependentAssignment,
  logicalButtonId,
  type ActionCategory,
  type CameraDefinition,
  type ConfiguratorState,
} from './model';
import { downloadBinary } from './download';
import { generateConfiguredOperatorGuide, renderConfiguredPrintSheet } from './manual';
import {
  chooseReleaseTarget,
  createFreshReleaseResolution,
  ingestMacroSource,
  isLocalDevelopmentHost,
  latestCatalogRelease,
  loadInstallerRelease,
  loadLocalDevelopmentSources,
  loadReleaseCatalog,
  migrateToLatestRelease,
  type InstallerSources,
  type MacroReleaseResolution,
  type MacroSourceOrigin,
  type ReleaseCatalog,
} from './source';
import {
  WORKFLOW_STEPS,
  createWorkflowNavigation,
  type WorkflowNavigation,
  type WorkflowStep,
} from './workflow';

const UNUSED_ASSIGNMENT = builtInAssignment('');
const DEFAULT_CAMERA_BUTTONS = [12, 11, 15, 16] as const;
const JOYSTICK_MODEL = 'Thrustmaster T.16000M';
const CISCO_SAMPLE_CODE_LICENSE_URL = 'https://developer.cisco.com/docs/licenses/';
const PROJECT_README_URL = `${PROJECT_REPOSITORY_URL}#readme`;
const THEME_STORAGE_KEY = 'joystick-configurator-theme';
const DEVICE_IDENTITY_STORAGE_KEY = 'joystick-configurator-device-identity';
const LOCAL_DEVELOPMENT_TARGET = 'local-development';

const CONFIGURATION_DEFINITIONS = {
  projectName: {
    label: 'Project name',
    path: 'config.documentation',
    description: 'The project name used for documentation within the macro. It does not affect operation.',
  },
  roomName: {
    label: 'Room name',
    path: 'config.documentation',
    description: 'The room where the macro will be installed. It is used only for documentation and can help distinguish rooms with different configurations.',
  },
  handedness: {
    label: 'Physical handedness switch',
    path: 'config.joystick',
    description: 'Updates the macro to match the handedness switch on the bottom of the joystick. If they do not match, the base-button references swap sides.',
  },
  setDefaultCamera: {
    label: 'Set default camera',
    path: 'config.joystick',
    description: 'Controls whether enabling Joystick Controls sets Main to the configured default camera. Disabled leaves the current Main source unchanged; use it when the operator will choose the Main source manually.',
  },
  panelLocation: {
    label: 'Joystick Controls location',
    path: 'config.userInterface',
    description: 'Controls where the Joystick Controls UI is available on the RoomOS device. HomeScreenAndCallControls makes it available both outside and during calls.',
  },
  previewMode: {
    label: 'Preview display mode',
    path: 'config.previewDisplay',
    description: 'Uses the Video Matrix xAPI to reserve a screen output as a local camera Preview display before a source is sent into the call. Off prevents all Preview controls, switching, and display commands. Enable it only with a free HDMI output; it is not recommended when three displays are actively in use.',
  },
  previewOutput: {
    label: 'Preview display output',
    path: 'config.previewDisplay',
    description: 'The HDMI output reserved for the local camera Preview display. Choose only a free output; Preview mode is not recommended when three displays are actively in use.',
  },
  panTiltRampSpeed: {
    label: 'PAN/TILT Ramp Speed',
    path: 'config.joystick.Camera',
    description: 'The base speed for camera pan and tilt movement. Not all Cisco cameras respect this setting.',
  },
  zoomRampSpeed: {
    label: 'ZOOM Ramp Speed',
    path: 'config.joystick.Camera',
    description: 'The base speed for camera zoom movement. Not all Cisco cameras respect this setting.',
  },
  slowModeDivisor: {
    label: 'Ramp divisor',
    path: 'config.joystick.Camera',
    description: 'Divides the PAN/TILT and ZOOM speeds by this value while the Precision mode button is held.',
  },
  cameraName: {
    label: 'Camera name',
    path: 'config.cameras',
    description: 'A readable name used in the macro, installer, status display, and generated PDF operator guide.',
  },
  videoConnectorId: {
    label: 'Video ConnectorId',
    path: 'config.cameras',
    description: 'The RoomOS video input connector used to put this camera on Main or Preview.',
  },
  cameraControlId: {
    label: 'Camera ControlId',
    path: 'config.cameras',
    description: 'The RoomOS camera identifier that receives PAN/TILT and ZOOM commands. Choose Disabled for USB or third-party video-only sources.',
  },
  defaultCamera: {
    label: 'Default camera',
    path: 'config.joystick',
    description: 'The camera used for the macro\'s default Main, Preview, and joystick-control assignments. Set default camera determines whether enabling Joystick Controls applies it to Main.',
  },
} as const;

type ConfigurationDefinitionKey = keyof typeof CONFIGURATION_DEFINITIONS;

type ThemePreference = 'system' | 'light' | 'dark';
type InstallationMode = 'install' | 'update';
type PendingDeviceAction = 'install' | 'fetch-macro' | 'discover-cameras';

function storedThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    // Storage may be unavailable in a privacy-restricted browser context.
  }
  return 'system';
}

function storedDeviceCredentials(): DeviceCredentials {
  try {
    const value = window.localStorage.getItem(DEVICE_IDENTITY_STORAGE_KEY);
    if (!value) return { host: '', username: '', password: '' };
    const parsed = JSON.parse(value) as { host?: unknown; username?: unknown };
    return {
      host: typeof parsed.host === 'string' ? parsed.host : '',
      username: typeof parsed.username === 'string' ? parsed.username : '',
      password: '',
    };
  } catch {
    return { host: '', username: '', password: '' };
  }
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function integerOptions(minimum: number, maximum: number, selected: number): string {
  return Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index)
    .map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`)
    .join('');
}

function isSupportedCameraControlId(selected: string | null): boolean {
  return selected === null || /^(?:[1-9]|1[0-5])$/.test(selected.trim());
}

function cameraControlOptions(selected: string | null): string {
  const supported = isSupportedCameraControlId(selected);
  const unsupported = !supported
    ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)} (unsupported)</option>`
    : '';
  return `${unsupported}<option value="" ${selected === null ? 'selected' : ''}>Disabled (USB/ThirdParty)</option>${Array.from(
    { length: 15 },
    (_, index) => String(index + 1),
  ).map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`).join('')}`;
}

function downloadText(fileName: string, content: string, type = 'text/javascript;charset=utf-8'): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

interface AssignmentInfo {
  label: string;
  description: string;
  category: ActionCategory;
  code: string;
}

export class ConfiguratorApp {
  private state: ConfiguratorState = createDefaultState();
  private themePreference: ThemePreference = storedThemePreference();
  private readonly systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  private catalog?: ReleaseCatalog;
  private releaseResolution?: MacroReleaseResolution;
  private readonly releaseSourceCache = new Map<string, InstallerSources>();
  private sources?: InstallerSources;
  private sourceError = '';
  private credentials: DeviceCredentials = storedDeviceCredentials();
  private expectedSerial = '';
  private installationMode: InstallationMode = 'install';
  private installationProgressMode: InstallationMode = 'install';
  private pendingDeviceAction?: PendingDeviceAction;
  private deviceConnectionOpen = false;
  private installConfirmationOpen = false;
  private installationProgressOpen = false;
  private installationProgressMessages: string[] = [];
  private busy = false;
  private statusMessage = '';
  private errorMessage = '';
  private configurationMessage = '';
  private configurationError = '';
  private discoveredCameras: DiscoveredCameraSource[] = [];
  private cameraDiscoveryHost?: string;
  private cameraDiscoveryLoading = false;
  private cameraDiscoveryScheduled = false;
  private cameraDiscoveryError = '';
  private cameraMessage = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly deviceSession: DeviceInstallationSession = createDeviceInstallationSession(),
    private readonly workflow: WorkflowNavigation = createWorkflowNavigation(),
  ) {}

  async initialize(): Promise<void> {
    this.applyTheme();
    this.workflow.initialize({
      onPopState: () => {
        this.render();
        window.scrollTo({ top: 0 });
      },
      beforeUnload: () => this.captureDeviceFields(),
    });
    this.systemTheme.addEventListener('change', () => {
      if (this.themePreference === 'system') this.applyTheme();
    });
    this.render();
    try {
      this.catalog = await loadReleaseCatalog();
      this.releaseResolution = createFreshReleaseResolution(this.catalog);
      this.sources = await this.loadReleaseSources(this.catalog.latest);
    } catch (error) {
      this.sourceError = error instanceof Error ? error.message : String(error);
    }
    this.render();
  }

  private applyTheme(): void {
    const effectiveTheme = this.themePreference === 'system'
      ? (this.systemTheme.matches ? 'dark' : 'light')
      : this.themePreference;
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.dataset.themePreference = this.themePreference;
    document.documentElement.style.colorScheme = effectiveTheme;
  }

  private setThemePreference(preference: ThemePreference): void {
    this.themePreference = preference;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // The selected theme still applies for this session.
    }
    this.applyTheme();
  }

  private async loadReleaseSources(tag: string): Promise<InstallerSources> {
    if (!this.catalog) throw new Error('The installer Release catalog is not available.');
    const cached = this.releaseSourceCache.get(tag);
    if (cached) return cached;
    const sources = await loadInstallerRelease(this.catalog, tag);
    this.releaseSourceCache.set(sources.release.tag, sources);
    return sources;
  }

  private async loadLocalSources(): Promise<InstallerSources> {
    if (!this.catalog) throw new Error('The installer Release catalog is not available.');
    if (!isLocalDevelopmentHost(window.location?.hostname ?? '')) {
      throw new Error('Local development sources are available only on localhost or 127.0.0.1.');
    }
    const cached = this.releaseSourceCache.get(LOCAL_DEVELOPMENT_TARGET);
    if (cached) return cached;
    const sources = await loadLocalDevelopmentSources(this.catalog);
    this.releaseSourceCache.set(LOCAL_DEVELOPMENT_TARGET, sources);
    return sources;
  }

  private hasSupportedTarget(): boolean {
    return Boolean(
      this.releaseResolution?.targetTag &&
      this.sources?.release.tag === this.releaseResolution.targetTag,
    );
  }

  private navigateToStep(step: WorkflowStep, pushHistory = true): void {
    if (!this.workflow.navigate(step, pushHistory)) return;
    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => this.root.querySelector<HTMLElement>('.workflow-page')?.focus(), 0);
  }

  private cameraById(cameraId: string | undefined): CameraDefinition | undefined {
    return this.state.cameras.find((camera) => camera.id === cameraId);
  }

  private defaultAssignments(): Record<number, string> {
    const assignments = createDefaultAssignments();
    for (const button of PHYSICAL_BUTTONS) {
      if (assignmentCameraId(DEFAULT_ASSIGNMENTS[button.number])) {
        assignments[button.number] = UNUSED_ASSIGNMENT;
      }
    }
    this.state.cameras.forEach((camera, index) => {
      const button = DEFAULT_CAMERA_BUTTONS[index];
      if (button) assignments[button] = cameraAssignment(camera.id);
    });
    return assignments;
  }

  private restoreDefaultControls(): void {
    this.state.assignments = this.defaultAssignments();
    this.configurationError = '';
    this.configurationMessage = 'All 16 buttons were restored to the documented default controls.';
    this.render();
  }

  private restoreDefaultButton(buttonNumber: number): void {
    const assignment = this.defaultAssignments()[buttonNumber];
    if (assignment === undefined) return;
    const cameraId = assignmentCameraId(assignment);
    if (cameraId) {
      for (const button of PHYSICAL_BUTTONS) {
        if (button.number !== buttonNumber && this.state.assignments[button.number] === assignment) {
          this.state.assignments[button.number] = UNUSED_ASSIGNMENT;
        }
      }
    }
    this.state.assignments[buttonNumber] = assignment;
    this.configurationError = '';
    this.configurationMessage = `Button ${buttonNumber} was restored to its default action.`;
    this.render();
  }

  private assignmentInfo(assignment: string): AssignmentInfo {
    const actionId = assignmentActionId(assignment);
    if (actionId !== undefined) {
      const action = BUILT_IN_ACTIONS.find((candidate) => candidate.id === actionId);
      if (action) {
        return {
          label: action.label,
          description: action.description,
          category: action.category,
          code: action.id || "''",
        };
      }
    }

    const camera = this.cameraById(assignmentCameraId(assignment));
    if (camera) {
      const buttonAction = cameraButtonActions(this.state.cameras).get(camera.id) ?? 'SelectCamera';
      return {
        label: camera.Name || 'Unnamed camera',
        description: `Selects ${camera.Name || 'this camera'} for the active Main or Preview target.`,
        category: 'camera',
        code: buttonAction,
      };
    }

    return {
      label: 'Invalid assignment',
      description: 'Choose another action.',
      category: 'unused',
      code: 'Invalid',
    };
  }

  private actionOptions(selected: string, buttonNumber: number): string {
    const defaultAssignment = this.defaultAssignments()[buttonNumber];
    const actionOptions = BUILT_IN_ACTIONS.map((action) =>
      `<option value="${escapeHtml(builtInAssignment(action.id))}" ${selected === builtInAssignment(action.id) ? 'selected' : ''}>${escapeHtml(action.label)}${defaultAssignment === builtInAssignment(action.id) ? ' · Default' : ''}</option>`
    ).join('');
    const cameraOptions = this.state.cameras.map((camera) =>
      `<option value="${escapeHtml(cameraAssignment(camera.id))}" ${selected === cameraAssignment(camera.id) ? 'selected' : ''}>Camera · ${escapeHtml(camera.Name || 'Unnamed camera')}${defaultAssignment === cameraAssignment(camera.id) ? ' · Default' : ''}</option>`
    ).join('');
    return `
      <optgroup label="Built-in actions">${actionOptions}</optgroup>
      <optgroup label="Configured cameras">${cameraOptions}</optgroup>`;
  }

  private renderWorkflowRail(): string {
    return `
      <aside class="workflow-rail no-print" aria-label="Configuration progress">
        <div class="workflow-rail-intro">
          <span class="section-kicker">Configuration workflow</span>
          <strong>Build your controller</strong>
          <p>Your choices remain available as you move between pages.</p>
        </div>
        <nav aria-label="Configurator pages">
          <ol class="workflow-step-list">
            ${WORKFLOW_STEPS.map((step, index) => {
              const number = (index + 1) as WorkflowStep;
              const current = number === this.workflow.currentStep;
              return `
                <li>
                  <button class="workflow-step${current ? ' current' : ''}" type="button" data-workflow-step="${number}" ${current ? 'aria-current="step"' : ''}>
                    <span class="workflow-step-status" aria-hidden="true">${number}</span>
                    <span><strong>${step.title}</strong><small>${step.description}</small></span>
                  </button>
                </li>`;
            }).join('')}
          </ol>
        </nav>
      </aside>`;
  }

  private renderWorkflowActions(): string {
    const currentStep = this.workflow.currentStep;
    const previous = currentStep > 1 ? (currentStep - 1) as WorkflowStep : undefined;
    const next = currentStep < WORKFLOW_STEPS.length ? (currentStep + 1) as WorkflowStep : undefined;
    const nextDisabled = currentStep === 2 && validateConfiguratorState(this.state).length > 0;
    return `
      <footer class="workflow-actions no-print">
        <span>Page ${currentStep} of ${WORKFLOW_STEPS.length}</span>
        <div>
          ${previous ? `<button class="button secondary" type="button" data-workflow-step="${previous}">Back</button>` : ''}
          ${next ? `<button class="button primary" type="button" data-workflow-step="${next}" ${nextDisabled ? 'disabled' : ''}>Continue to ${WORKFLOW_STEPS[next - 1].title}</button>` : ''}
        </div>
      </footer>`;
  }

  private renderReviewActions(): string {
    const configurationIsValid = validateConfiguratorState(this.state).length === 0;
    const hasSupportedTarget = this.hasSupportedTarget();
    const session = this.deviceSession.snapshot();
    const verifiedDevice = session.verifiedDevice;
    const installResult = session.installationResult;
    const isUpdate = this.installationMode === 'update';
    const deviceAction = isUpdate ? 'Update Macro' : 'Install Macro';
    const deviceDescription = session.connected
      ? `${isUpdate ? 'Update' : 'Install'} the macro on the verified ${escapeHtml(session.verifiedDevice?.productPlatform ?? 'RoomOS device')}.`
      : `Connect directly to the target RoomOS device, verify it, and ${isUpdate ? 'update' : 'install'} the solution.`;
    const canPromptInstall = Boolean(
      session.connected &&
      verifiedDevice?.serialMatches &&
      hasSupportedTarget &&
      configurationIsValid &&
      !this.busy,
    );
    const canConnect = hasSupportedTarget && configurationIsValid && !this.busy;
    return `
      <section class="review-action-grid" aria-label="Installation and download options">
        <article class="review-action primary-action">
          <span class="review-action-number">1</span>
          <div><h2>Download Macro</h2><p>Save the configured JavaScript macro for a manual RoomOS upload.</p></div>
          <button class="button primary" id="download-macro" type="button" ${hasSupportedTarget && configurationIsValid ? '' : 'disabled'}>Download Macro</button>
        </article>
        <article class="review-action device-action">
          <span class="review-action-number">2</span>
          <div>
            <h2>${deviceAction}</h2>
            <p>${deviceDescription}</p>
            ${verifiedDevice ? `
              <div class="review-device-status ${verifiedDevice.serialMatches && verifiedDevice.activeCalls === 0 ? 'success' : 'error'}" role="status" aria-live="polite">
                <strong>${verifiedDevice.serialMatches ? 'Serial confirmed' : 'Serial mismatch — installation blocked'}</strong>
                <span>${escapeHtml(verifiedDevice.productPlatform)} · RoomOS ${escapeHtml(verifiedDevice.roomOsVersion)}</span>
                <span>${verifiedDevice.activeCalls === 0 ? 'No active calls' : `${verifiedDevice.activeCalls} active call(s) — installation blocked`}</span>
              </div>` : `
              <div class="review-device-status neutral" role="status" aria-live="polite">
                <strong>Not connected</strong>
                <span>Connect and verify the exact device before installation.</span>
              </div>`}
            ${installResult ? `
              <div class="review-install-result ${installResult.kind === 'ready' ? 'success' : installResult.kind === 'failed' ? 'error' : 'warning'}" role="status" aria-live="polite">
                <strong>${installResult.kind === 'ready' ? 'Installation ready' : installResult.kind === 'failed' ? 'Initialization failed' : 'Initialization not confirmed'}</strong>
                <span>${escapeHtml(installResult.message)}</span>
              </div>` : ''}
          </div>
          <div class="review-action-buttons">
            <button class="button secondary" ${session.connected ? 'data-open-install-confirmation' : 'data-open-device-connection'} type="button" ${session.connected ? (canPromptInstall ? '' : 'disabled') : (canConnect ? '' : 'disabled')}>${deviceAction}</button>
            ${session.connected ? '<button class="button secondary" id="disconnect-device" type="button">Disconnect</button>' : ''}
          </div>
        </article>
        <article class="review-action">
          <span class="review-action-number">3</span>
          <div><h2>Download Operator Guide</h2><p>Save the configured, single-page PDF for operators and room handoff.</p></div>
          <button class="button secondary" id="download-operator-guide" type="button">Download Operator Guide (PDF)</button>
        </article>
      </section>`;
  }

  private renderCurrentPage(): string {
    if (this.workflow.currentStep === 1) return this.renderHeader();
    if (this.workflow.currentStep === 2) return this.renderSettings();
    if (this.workflow.currentStep === 3) return `<div class="button-assignment-page">${this.renderButtonMap()}</div>`;
    return `
      <div class="review-page">
        <header class="page-intro">
          <span class="section-kicker">04 · Review</span>
          <h1>Review and installation</h1>
          <p>Confirm the generated configuration, then choose how you want to deliver the solution.</p>
          ${this.renderSelectedReleaseSummary()}
        </header>
        ${this.renderReviewActions()}
        ${this.renderOutput()}
      </div>`;
  }

  private renderReleaseSelector(): string {
    if (!this.catalog) {
      return `
        <label class="release-picker" for="base-macro-release">
          <span>Choose Release</span>
          <select id="base-macro-release" disabled><option>${this.sourceError ? 'Unavailable' : 'Loading…'}</option></select>
        </label>`;
    }
    const selectedTag = this.releaseResolution?.targetTag;
    const localDevelopment = isLocalDevelopmentHost(window.location?.hostname ?? '')
      ? this.catalog.localDevelopment
      : undefined;
    const localSelected = this.sources?.kind === 'local-development';
    const unresolvedLabel = this.releaseResolution?.recognition === 'unavailable'
      ? `Imported macro · ${this.releaseResolution.detectedTag} unavailable`
      : 'Imported macro · Release unknown';
    return `
      <label class="release-picker" for="base-macro-release">
        <span>Choose Release</span>
        <select id="base-macro-release" ${this.busy ? 'disabled' : ''}>
          ${selectedTag ? '' : `<option value="" selected disabled>${escapeHtml(unresolvedLabel)}</option>`}
          ${localDevelopment ? `<option value="${LOCAL_DEVELOPMENT_TARGET}" ${localSelected ? 'selected' : ''}>Local Development · Macro Version ${escapeHtml(localDevelopment.macroVersion)}</option>` : ''}
          ${this.catalog.releases.map((release) => `
            <option value="${escapeHtml(release.tag)}" ${!localSelected && release.tag === selectedTag ? 'selected' : ''}>${escapeHtml(release.tag)}${release.tag === this.catalog?.latest ? ' · Latest' : ''}</option>`).join('')}
        </select>
      </label>`;
  }

  private renderSelectedReleaseSummary(): string {
    const release = this.sources?.release;
    if (!release || !this.hasSupportedTarget()) {
      return '<p class="selected-release-summary warning">Target Release: choose a supported Release before downloading or installing macros.</p>';
    }
    const dependencies = release.dependencies
      .map((dependency) => `${dependency.fileName} ${dependency.release}`)
      .join(', ');
    if (this.sources?.kind === 'local-development') {
      return `<p class="selected-release-summary"><strong>Target:</strong> Local Development <span>· Macro Version ${escapeHtml(release.tag)} · ${escapeHtml(dependencies)}</span></p>`;
    }
    return `<p class="selected-release-summary"><strong>Target Release:</strong> ${escapeHtml(release.tag)} <span>· ${escapeHtml(dependencies)}</span></p>`;
  }

  private renderSourceReleaseStatus(): string {
    const resolution = this.releaseResolution;
    const catalog = this.catalog;
    if (!resolution || !catalog || resolution.origin === 'fresh') return '';
    const detected = resolution.detectedTag ?? 'Unknown';
    const target = resolution.targetTag;
    let sentiment = 'success';
    let heading = 'Source release is current';
    let message = `${detected} matches the latest supported Release.`;

    if (this.sources?.kind === 'local-development' && target) {
      heading = 'Local development target selected';
      message = `The recovered configuration now uses the working-tree macro (Macro Version ${target}); no device changes were made.`;
    } else if (resolution.recognition === 'older') {
      sentiment = 'warning';
      heading = 'Source release is older';
      message = target
        ? `${detected} is loaded with its verified dependency pair. ${catalog.latest} is available.`
        : `${detected} was detected, but no supported target is selected.`;
    } else if (resolution.recognition === 'unknown') {
      sentiment = target ? 'success' : 'warning';
      heading = target ? 'Supported migration target selected' : 'Source release is unknown';
      message = target
        ? `The source version could not be identified. Its recovered configuration now targets ${target}.`
        : `The configuration was recovered, but downloading and installation require an explicit supported target.`;
    } else if (resolution.recognition === 'unavailable') {
      sentiment = target ? 'success' : 'warning';
      heading = target ? 'Supported migration target selected' : 'Source release is unavailable';
      message = target
        ? `${detected} is not packaged. Its recovered configuration now targets ${target}.`
        : `${detected} is not packaged. The configuration remains editable, but downloading and installation require an explicit supported target.`;
    } else if (resolution.targetChosenExplicitly && target) {
      heading = 'Release target changed';
      message = `The recovered configuration now targets ${target}; no device changes were made.`;
    }

    const offerLatest = !target || target !== catalog.latest;
    return `
      <div class="callout ${sentiment} release-status" role="status">
        <div><strong>${escapeHtml(heading)}</strong><p>${escapeHtml(message)}</p></div>
        ${offerLatest ? `<button class="button secondary" id="migrate-latest-release" type="button" ${this.busy ? 'disabled' : ''}>Migrate to latest release (${escapeHtml(catalog.latest)})</button>` : ''}
      </div>`;
  }

  private renderHeader(): string {
    const connected = this.deviceSession.snapshot().connected;
    return `
      <header class="hero">
        <div class="hero-copy">
          <span class="eyebrow">Cisco RoomOS macro solution</span>
          <h1>Joystick Camera Control Production Switcher</h1>
          <p class="hero-summary">Control Cisco RoomOS cameras with a Thrustmaster T.16000M joystick and run a simple Main/Preview production workflow without a separate control computer.</p>
          <p class="hero-read-more"><a id="project-readme-link" href="${PROJECT_README_URL}" target="_blank" rel="noreferrer">Read the project README <span aria-hidden="true">↗</span></a> for the complete feature set, requirements, operator workflow, and manual setup.</p>
          <section class="installer-introduction no-print" aria-labelledby="choose-start-title">
            <div class="installer-introduction-heading">
              <div><span class="eyebrow">Start with the Web Installer</span><h2 id="choose-start-title">Choose how to begin</h2></div>
              ${this.renderReleaseSelector()}
            </div>
            <p>Configure every button, install or update both RoomOS macros, and download a room-specific PDF operator guide.</p>
            <div class="installation-paths no-print" aria-label="Choose how to begin">
              <article>
                <div><strong>Fresh Installation</strong><p>Start with the documented defaults, then configure the room and cameras.</p></div>
                <button class="button primary" id="fresh-installation" type="button" ${this.catalog && !this.busy ? '' : 'disabled'}>Fresh Installation</button>
              </article>
              <article>
                <div><strong>Start from Macro</strong><p>Load settings from a macro file without executing its source.</p></div>
                <label class="button secondary file-button">Start from Macro
                  <input id="import-macro-file" type="file" accept=".js,.txt,text/javascript" ${this.catalog && !this.busy ? '' : 'disabled'}>
                </label>
              </article>
              <article>
                <div><strong>Fetch Macro from Device</strong><p>${connected ? 'Read the installed macro from the verified device.' : 'Connect to a device, verify it, and read its installed macro.'}</p></div>
                <button class="button secondary" id="begin-device-macro-fetch" type="button" ${this.catalog && !this.busy ? '' : 'disabled'}>Fetch Macro from Device</button>
              </article>
            </div>
            ${this.renderSourceReleaseStatus()}
          </section>
          ${this.configurationMessage ? `<div class="callout success introduction-callout"><strong>Configuration loaded</strong><p>${escapeHtml(this.configurationMessage)}</p></div>` : ''}
          ${this.configurationError ? `<div class="callout error introduction-callout"><strong>Configuration not loaded</strong><p>${escapeHtml(this.configurationError)}</p></div>` : ''}
        </div>
        <div class="hero-sidebar">
          <figure class="live-demo">
            <img src="./assets/infocomm-2026-joystick-demo.png" alt="An operator controlling a camera with the Thrustmaster T.16000M at InfoComm 2026">
            <figcaption>The joystick camera-control experience demonstrated at InfoComm 2026.</figcaption>
          </figure>
          <ul class="solution-highlights" aria-label="Solution highlights">
            <li><strong>Direct camera control</strong><span>Pan, tilt, and zoom supported Cisco cameras from the joystick.</span></li>
            <li><strong>Main and Preview</strong><span>Take a source live or stage it locally before swapping it to Main.</span></li>
            <li><strong>One to four cameras</strong><span>Name each source and assign the T.16000M buttons for the room.</span></li>
          </ul>
          <aside class="purpose-checklist" aria-labelledby="purpose-checklist-title">
            <span class="eyebrow">Purpose-built solution</span>
            <h2 id="purpose-checklist-title">What to know before you begin</h2>
            <ul>
              <li><strong>T.16000M only</strong><span>The controls and handedness modes are designed for this joystick, not generic USB controllers.</span></li>
              <li><strong>RoomOS and supported cameras</strong><span>You need a compatible RoomOS device. Cisco certified cameras provide joystick PTZ control; other sources can be switched only.</span></li>
              <li><strong>Custom sample code</strong><span>The solution is community-tested and is not supported by Cisco TAC.</span></li>
            </ul>
            <a href="${PROJECT_README_URL}" target="_blank" rel="noreferrer">Review all requirements and limitations <span aria-hidden="true">↗</span></a>
          </aside>
        </div>
      </header>`;
  }

  private renderSettings(): string {
    return `
      <div class="macro-settings-page">
      <section class="panel section no-print" id="configure">
        <div class="section-heading">
          <div><span class="section-kicker">02 · Settings</span><h1>Macro settings</h1></div>
          <p>These values drive the macro and the printable guide.</p>
        </div>
        <div class="settings-groups">
          <section class="settings-group settings-group-documentation" aria-labelledby="settings-documentation-title">
            <header class="settings-group-heading">
              <h2 id="settings-documentation-title">Documentation</h2>
            </header>
            <div class="settings-field-grid">
              <label class="field">${this.renderConfigurationLabel('projectName')}<input data-setting="projectName" value="${escapeHtml(this.state.projectName)}"></label>
              <label class="field">${this.renderConfigurationLabel('roomName')}<input data-setting="roomName" value="${escapeHtml(this.state.roomName)}"></label>
            </div>
          </section>
          <section class="settings-group settings-group-preview" aria-labelledby="settings-preview-title">
            <header class="settings-group-heading">
              <h2 id="settings-preview-title">Preview display</h2>
            </header>
            <div class="settings-field-grid">
              <label class="field">${this.renderConfigurationLabel('previewMode')}
                <select data-setting="previewMode">
                  <option value="On" ${this.state.previewMode === 'On' ? 'selected' : ''}>On</option>
                  <option value="Off" ${this.state.previewMode === 'Off' ? 'selected' : ''}>Off</option>
                </select>
              </label>
              <label class="field">${this.renderConfigurationLabel('previewOutput')}<select data-setting="previewOutput">${integerOptions(1, 3, this.state.previewOutput)}</select></label>
            </div>
          </section>
          <section class="settings-group settings-group-user-interface" aria-labelledby="settings-user-interface-title">
            <header class="settings-group-heading">
              <h2 id="settings-user-interface-title">User interface</h2>
            </header>
            <div class="settings-field-grid">
              <label class="field">${this.renderConfigurationLabel('panelLocation')}
                <select data-setting="panelLocation">
                  ${PANEL_LOCATIONS.map((location) => `<option value="${location}" ${this.state.panelLocation === location ? 'selected' : ''}>${location}</option>`).join('')}
                </select>
              </label>
            </div>
          </section>
          <section class="settings-group settings-group-joystick" aria-labelledby="settings-joystick-title">
            <header class="settings-group-heading">
              <h2 id="settings-joystick-title">Joystick</h2>
            </header>
            <div class="settings-field-grid settings-field-grid-three">
              <label class="field">${this.renderConfigurationLabel('handedness')}
                <select data-setting="handedness">
                  <option value="right" ${this.state.handedness === 'right' ? 'selected' : ''}>Right-handed</option>
                  <option value="left" ${this.state.handedness === 'left' ? 'selected' : ''}>Left-handed</option>
                </select>
              </label>
              <label class="field">${this.renderConfigurationLabel('setDefaultCamera')}
                <select data-setting="setDefaultCamera">
                  <option value="true" ${this.state.setDefaultCamera ? 'selected' : ''}>Enabled</option>
                  <option value="false" ${!this.state.setDefaultCamera ? 'selected' : ''}>Disabled</option>
                </select>
              </label>
              <label class="field">${this.renderConfigurationLabel('defaultCamera')}
                <select id="default-camera">
                  ${this.state.cameras.map((camera) => `<option value="${escapeHtml(camera.id)}" ${camera.id === this.state.defaultCameraId ? 'selected' : ''}>${escapeHtml(camera.Name || 'Unnamed camera')}</option>`).join('')}
                </select>
              </label>
            </div>
            <section class="settings-subgroup" aria-labelledby="settings-camera-movement-title">
              <header class="settings-group-heading settings-subgroup-heading">
                <h3 id="settings-camera-movement-title">Camera movement</h3>
              </header>
              <div class="settings-field-grid settings-field-grid-three">
                <label class="field">${this.renderConfigurationLabel('panTiltRampSpeed')}<select data-setting="panTiltRampSpeed">${integerOptions(1, 24, this.state.panTiltRampSpeed)}</select></label>
                <label class="field">${this.renderConfigurationLabel('zoomRampSpeed')}<select data-setting="zoomRampSpeed">${integerOptions(1, 15, this.state.zoomRampSpeed)}</select></label>
                <label class="field">${this.renderConfigurationLabel('slowModeDivisor')}<select data-setting="slowModeDivisor">${integerOptions(1, 4, this.state.slowModeDivisor)}</select></label>
              </div>
            </section>
          </section>
        </div>
      </section>
      ${this.renderCameras()}
      </div>`;
  }

  private renderCameras(): string {
    const cameraActions = cameraButtonActions(this.state.cameras);
    return `
      <section class="panel section no-print" id="cameras">
        <div class="section-heading">
          <div><h2>Configure camera sources</h2></div>
          <p>Camera ButtonAction names are generated automatically and become choices in every button dropdown.</p>
        </div>
        <div class="camera-source-layout">
          <div class="configured-cameras-pane">
            <div class="camera-pane-heading"><h3>Configured cameras</h3><span>${this.state.cameras.length} of 4</span></div>
            <div class="camera-grid">
              ${this.state.cameras.map((camera, index) => {
                const unsupportedControlId = !isSupportedCameraControlId(camera.ControlId);
                return `<article class="camera-card">
                  <div class="camera-card-header">
                    <span class="camera-number">${index + 1}</span>
                    <div><strong>${escapeHtml(camera.Name || `Camera ${index + 1}`)}</strong><code>${escapeHtml(cameraActions.get(camera.id) ?? '')}</code></div>
                    <button class="icon-button" type="button" data-remove-camera="${escapeHtml(camera.id)}" ${this.state.cameras.length === 1 ? 'disabled' : ''} aria-label="Remove ${escapeHtml(camera.Name || 'camera')}">×</button>
                  </div>
                  <div class="camera-fields">
                    <label class="field wide">${this.renderConfigurationLabel('cameraName', camera.id)}<input data-camera-id="${escapeHtml(camera.id)}" data-camera-field="Name" value="${escapeHtml(camera.Name)}"></label>
                    <label class="field">${this.renderConfigurationLabel('videoConnectorId', camera.id)}<input data-camera-id="${escapeHtml(camera.id)}" data-camera-field="ConnectorId" inputmode="numeric" value="${escapeHtml(camera.ConnectorId)}"></label>
                    <label class="field">${this.renderConfigurationLabel('cameraControlId', camera.id)}<select data-camera-id="${escapeHtml(camera.id)}" data-camera-field="ControlId" ${unsupportedControlId ? 'aria-invalid="true"' : ''}>${cameraControlOptions(camera.ControlId)}</select>${camera.ControlId === null ? '<small>Video only — joystick camera control unavailable.</small>' : ''}${unsupportedControlId ? '<small class="field-validation-error">Unsupported ControlId — choose 1–15 or Disabled before continuing.</small>' : ''}</label>
                  </div>
                </article>`;
              }).join('')}
            </div>
            <div class="camera-actions">
              <button class="button secondary" id="add-camera" type="button" ${this.state.cameras.length >= 4 ? 'disabled' : ''}>Add camera</button>
            </div>
            ${this.cameraMessage ? `<div class="callout progress camera-message" role="status"><strong>Camera configuration updated</strong><p>${escapeHtml(this.cameraMessage)}</p></div>` : ''}
          </div>
          ${this.renderDiscoveredCameras()}
        </div>
      </section>`;
  }

  private renderDiscoveredCameras(): string {
    const session = this.deviceSession.snapshot();
    const connected = Boolean(session.connected && session.verifiedDevice?.serialMatches);
    const discoveredForConnection = connected && this.cameraDiscoveryHost === session.host;
    return `
      <aside class="discovered-cameras-pane" aria-labelledby="discovered-cameras-title">
        <div class="camera-pane-heading">
          <div><h3 id="discovered-cameras-title">Discovered cameras</h3>${connected ? `<small>${escapeHtml(session.verifiedDevice?.productPlatform ?? 'Verified RoomOS device')}</small>` : ''}</div>
          ${connected ? `<button class="button secondary compact-button" id="refresh-cameras" type="button" ${this.cameraDiscoveryLoading ? 'disabled' : ''}>${this.cameraDiscoveryLoading ? 'Discovering…' : 'Refresh cameras'}</button>` : ''}
        </div>
        ${!connected ? `
          <div class="camera-discovery-empty">
            <p>Connect to the exact RoomOS device to read its configured camera inputs. Discovery does not fetch the macro or change device configuration.</p>
            <button class="button primary" id="discover-cameras" type="button">Discover Cameras</button>
          </div>` : ''}
        ${connected && this.cameraDiscoveryLoading ? '<div class="callout progress" role="status"><strong>Discovering cameras</strong><p>Reading video input configuration and camera status.</p></div>' : ''}
        ${connected && this.cameraDiscoveryError ? `<div class="callout error" role="alert"><strong>Camera discovery failed</strong><p>${escapeHtml(this.cameraDiscoveryError)}</p></div>` : ''}
        ${connected && discoveredForConnection && !this.cameraDiscoveryLoading && !this.cameraDiscoveryError && this.discoveredCameras.length === 0 ? '<div class="camera-discovery-empty"><p>No camera-type video input connectors were reported by this device.</p></div>' : ''}
        ${connected && this.discoveredCameras.length ? `<div class="discovered-camera-list" aria-live="polite">${this.discoveredCameras.map((source, index) => {
          const configured = this.state.cameras.find((camera) => camera.ConnectorId.trim() === source.ConnectorId);
          const name = source.Name.trim() || configured?.Name.trim() || `Camera ${source.ConnectorId}`;
          const upToDate = Boolean(
            configured &&
            configured.Name.trim() === name &&
            configured.ControlId === source.ControlId,
          );
          const atLimit = !configured && this.state.cameras.length >= 4;
          const action = upToDate ? 'Added' : configured ? 'Update Camera' : 'Add Camera';
          const connectionStatus = source.connection === 'connected'
            ? 'Connected'
            : source.connection === 'disconnected'
              ? 'Disconnected'
              : 'Status unavailable';
          const warnings = [
            source.connection === 'disconnected' ? 'Camera is disconnected' : '',
            source.connection === 'unavailable' ? 'Camera status unavailable' : '',
            source.cameraControlMode?.toLowerCase() === 'off' ? 'Device camera control is disabled' : '',
          ].filter(Boolean);
          const details = [
            connectionStatus,
            `ConnectorId: ${source.ConnectorId}`,
            `ControlId: ${source.ControlId === null ? 'Disabled' : source.ControlId}`,
            `Model: ${source.model ?? 'Model unavailable'}`,
            warnings.length ? `Warnings: ${warnings.join('; ')}` : '',
          ].filter(Boolean).join(' · ');
          const tooltipId = `discovered-camera-help-${index + 1}`;
          return `
            <article class="discovered-camera-card discovered-camera-card-${source.connection}">
              <strong class="discovered-camera-name" title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
              <button class="button ${configured ? 'secondary' : 'primary'}" type="button" data-use-discovered-camera="${escapeHtml(source.ConnectorId)}" ${upToDate || atLimit || this.cameraDiscoveryLoading ? 'disabled' : ''}>${atLimit ? 'Four-camera limit reached' : action}</button>
              <span class="field-info discovered-camera-info">
                <button class="field-info-trigger" type="button" aria-label="Information about ${escapeHtml(name)}" aria-describedby="${tooltipId}">
                  <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M12 10.75v6M12 7.25h.01"></path></svg>
                </button>
                <span class="field-tooltip discovered-camera-tooltip" id="${tooltipId}" role="tooltip">${escapeHtml(details)}</span>
              </span>
            </article>`;
        }).join('')}</div>` : ''}
      </aside>`;
  }

  private renderConfigurationLabel(key: ConfigurationDefinitionKey, instance = ''): string {
    const definition = CONFIGURATION_DEFINITIONS[key];
    const instanceSuffix = instance ? `-${instance.replace(/[^a-zA-Z0-9_-]/g, '-')}` : '';
    const tooltipId = `configuration-help-${key}${instanceSuffix}`;

    return `<span class="field-label"><span>${escapeHtml(definition.label)}</span><span class="field-info">
      <button class="field-info-trigger" type="button" aria-label="Information about ${escapeHtml(definition.label)}" aria-describedby="${tooltipId}">
        <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M12 10.75v6M12 7.25h.01"></path></svg>
      </button>
      <span class="field-tooltip" id="${tooltipId}" role="tooltip"><strong class="field-tooltip-path">${escapeHtml(definition.path)}</strong><span>${escapeHtml(definition.description)}</span></span>
    </span></span>`;
  }

  private renderDiagram(): string {
    return `
      <div class="diagram" aria-label="Configurable Thrustmaster T.16000M button diagram">
        <img src="./assets/thrustmaster-t16000m.png" alt="Thrustmaster T.16000M button and axis reference">
        ${PHYSICAL_BUTTONS.map((button) => {
          const info = this.assignmentInfo(this.state.assignments[button.number]);
          return `<button class="pin ${info.category}" type="button" data-focus-button="${button.number}" style="left:${button.x}%;top:${button.y}%;" title="Button ${button.number}: ${escapeHtml(info.label)}">${button.number}</button>`;
        }).join('')}
        <span class="axis-badge tilt">Tilt</span>
        <span class="axis-badge pan">Pan</span>
        <span class="axis-badge zoom">Zoom</span>
      </div>`;
  }

  private renderButtonMap(): string {
    return `
      <section class="panel section button-map-section" id="button-map">
        <div class="section-heading">
          <div><span class="section-kicker">03 · Controls</span><h1>Button assignments</h1></div>
          <div class="section-heading-tools no-print">
            <p>Read each row from the physical control through its selected action and result. Default assignments can be restored at any time.</p>
            <div class="section-heading-actions">
              <button class="button secondary" type="button" data-open-action-definitions aria-haspopup="dialog">Action definitions</button>
              <button class="button secondary" id="restore-default-controls" type="button">Restore all defaults</button>
            </div>
          </div>
          <p class="print-only">Configured for the ${this.state.handedness}-handed hardware switch position.</p>
        </div>
        <div class="map-layout">
          <div class="diagram-column">
            ${this.renderDiagram()}
            <div class="legend">
              ${[
                ['main', 'Main'],
                ['preview', 'Preview'],
                ['camera', 'Camera'],
                ['motion', 'Motion / swap'],
                ['selfview', 'Selfview'],
                ['unused', 'No action'],
              ].map(([category, label]) => `<span><i class="${category}"></i>${label}</span>`).join('')}
            </div>
          </div>
          <div class="assignment-list">
            ${PHYSICAL_BUTTONS.map((button) => {
              const assignment = this.state.assignments[button.number];
              const info = this.assignmentInfo(assignment);
              const isDefault = assignment === this.defaultAssignments()[button.number];
              const previewActionIsUnavailable = this.state.previewMode === 'Off' && isPreviewDependentAssignment(assignment);
              const previewWarningMessage = assignmentActionId(assignment) === 'ControlPreview'
                ? 'This Control Preview action will be ignored while Preview Display mode is Off.'
                : 'This button action will be ignored.';
              const previewWarningTooltipId = `preview-warning-help-${button.number}`;
              return `
                <article class="assignment-row${previewActionIsUnavailable ? ' preview-action-unavailable' : ''}" id="button-row-${button.number}">
                  <span class="chip ${info.category}">${button.number}</span>
                  <div class="assignment-name"><strong>${escapeHtml(button.label)}</strong><code>${escapeHtml(logicalButtonId(button, this.state.handedness))}</code></div>
                  <label class="field compact no-print"><span>ButtonAction ${isDefault ? '<em class="default-badge">Default</em>' : ''}</span><select data-button-number="${button.number}">${this.actionOptions(assignment, button.number)}</select></label>
                  <div class="assignment-result"><strong>${escapeHtml(info.label)}</strong><span>${escapeHtml(info.description)}</span>${previewActionIsUnavailable ? `<div class="assignment-warning"><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M12 3 2.5 20h19L12 3Z"></path><path d="M12 9v5.5M12 17.5h.01"></path></svg><div class="assignment-warning-copy"><div class="assignment-warning-heading"><strong>Preview display is Off</strong><span class="field-info assignment-warning-info"><button class="field-info-trigger" type="button" aria-label="Why Button ${button.number} has a Preview warning" aria-describedby="${previewWarningTooltipId}"><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M12 10.75v6M12 7.25h.01"></path></svg></button><span class="field-tooltip" id="${previewWarningTooltipId}" role="tooltip">This warning appears because Preview display mode is set to Off in Macro Settings. Set it to On to enable Preview actions.</span></span></div><p>${previewWarningMessage}</p></div></div>` : ''}${isDefault ? '' : `<button class="restore-button no-print" type="button" data-restore-button="${button.number}">Restore Button ${button.number} default</button>`}</div>
                </article>`;
            }).join('')}
          </div>
        </div>
      </section>`;
  }

  private renderActionDefinitionsModal(): string {
    const cameraActions = cameraButtonActions(this.state.cameras);
    return `
      <dialog class="action-definitions-dialog no-print" id="action-definitions-dialog" aria-labelledby="action-definitions-title">
        <div class="action-definitions-shell">
          <header>
            <div><span class="section-kicker">Action key</span><h2 id="action-definitions-title">Action definitions</h2></div>
            <button class="icon-button" type="button" data-close-action-definitions aria-label="Close action definitions dialog">×</button>
          </header>
          <div class="action-definitions-content">
            <p>Use these definitions while assigning joystick buttons. The rows remain in physical-control, selection, and result order behind this dialog.</p>
            <section aria-labelledby="built-in-actions-title">
              <h3 class="manifest-group-title" id="built-in-actions-title">Built-in actions</h3>
              <div class="manifest-grid">
                ${BUILT_IN_ACTIONS.map((action) => `
                  <article class="manifest-item">
                    <span class="manifest-mark ${action.category}"></span>
                    <div><code>${escapeHtml(action.id || "'' (blank)")}</code><strong>${escapeHtml(action.label)}</strong><p>${escapeHtml(action.description)}</p></div>
                  </article>`).join('')}
              </div>
            </section>
            <section aria-labelledby="camera-actions-title">
              <h3 class="manifest-group-title" id="camera-actions-title">Configured cameras</h3>
              <div class="manifest-grid camera-key">
                ${this.state.cameras.map((camera) => `
                  <article class="manifest-item">
                    <span class="manifest-mark camera"></span>
                    <div><code>${escapeHtml(cameraActions.get(camera.id) ?? 'SelectCamera')}</code><strong>${escapeHtml(camera.Name || 'Unnamed camera')}</strong><p>Selects this camera for the active Main or Preview target.</p></div>
                  </article>`).join('')}
              </div>
            </section>
          </div>
          <footer><button class="button primary" type="button" data-close-action-definitions>Close</button></footer>
        </div>
      </dialog>`;
  }

  private renderAboutModal(): string {
    const macroVersion = this.catalog?.latest ?? 'Unavailable';
    const macroFileName = this.sources?.release.macro.fileName ?? 'Not selected';
    const selectedSource = this.sources?.kind === 'local-development'
      ? 'Local Development'
      : this.releaseResolution?.targetTag ?? 'Not selected';
    const dependencyRelease = this.sources?.release.dependencies
      .map((dependency) => `${dependency.fileName} ${dependency.release}`)
      .join(', ') ?? 'Not selected';
    return `
      <dialog class="about-dialog no-print" id="about-dialog" aria-labelledby="about-title" aria-describedby="about-summary">
        <div class="about-shell">
          <header>
            <div><span class="section-kicker">About</span><h2 id="about-title">Joystick Camera Control</h2><p class="about-product-model">${JOYSTICK_MODEL}</p></div>
            <form method="dialog"><button class="icon-button" type="submit" aria-label="Close About dialog">×</button></form>
          </header>
          <div class="about-content">
            <section class="about-overview" aria-labelledby="about-overview-title">
              <h3 id="about-overview-title">RoomOS camera production control from one joystick</h3>
              <p id="about-summary">This project stages, controls, and swaps up to four camera sources between Main and Preview. It combines the RoomOS macro with a browser configurator, direct installer, and downloadable operator guide.</p>
              <a class="about-project-link" href="${PROJECT_REPOSITORY_URL}" target="_blank" rel="noreferrer">Project repository <span aria-hidden="true">↗</span></a>
            </section>
            <section aria-labelledby="about-details-title">
              <h3 id="about-details-title">Project details</h3>
              <dl class="about-details">
                <div><dt>Macro version</dt><dd><code>${escapeHtml(macroVersion)}</code><small>Latest published Release</small></dd></div>
                <div><dt>Macro file</dt><dd><code>${escapeHtml(macroFileName)}</code></dd></div>
                <div><dt>Selected source</dt><dd><code>${escapeHtml(selectedSource)}</code></dd></div>
                <div><dt>Dependency Release</dt><dd><code>${escapeHtml(dependencyRelease)}</code></dd></div>
                <div><dt>Camera sources</dt><dd>One to four configured sources</dd></div>
                <div><dt>Production layout</dt><dd>Main with optional Preview</dd></div>
                <div><dt>Included tools</dt><dd>Configurator, direct installer, and PDF operator guide</dd></div>
                <div><dt>Project license</dt><dd>Cisco Sample Code License 1.1</dd></div>
              </dl>
            </section>
          </div>
          <footer><form method="dialog"><button class="button primary" type="submit">Close</button></form></footer>
        </div>
      </dialog>`;
  }

  private renderOutput(): string {
    const errors = validateConfiguratorState(this.state);
    let configSource = '';
    if (!errors.length) configSource = generateConfigSource(this.state);
    return `
      <section class="panel section no-print" id="output">
        <div class="section-heading">
          <div><span class="section-kicker">Configuration review</span><h2>Config object</h2></div>
          <p>The installer injects this exact object into the packaged macro.</p>
        </div>
        ${errors.length ? `<div class="callout error"><strong>Configuration needs attention</strong><ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul></div>` : `
          <pre class="code-preview"><code>${escapeHtml(configSource)}</code></pre>`}
        ${this.sourceError ? `<div class="callout error"><strong>Packaged source unavailable</strong><p>${escapeHtml(this.sourceError)}</p></div>` : ''}
      </section>`;
  }

  private renderDeviceConnectionModal(): string {
    const isFetch = this.pendingDeviceAction === 'fetch-macro';
    const isDiscovery = this.pendingDeviceAction === 'discover-cameras';
    const isUpdate = this.installationMode === 'update';
    const actionLabel = isUpdate ? 'Update Macro' : 'Install Macro';
    const operation = isUpdate ? 'update' : 'install';
    return `
      <dialog class="device-connection-dialog no-print" id="device-connection-dialog" aria-labelledby="device-connection-title">
        <div class="confirm-dialog-shell device-connection-shell">
          <header>
            <div><span class="section-kicker">Secure RoomOS connection</span><h2 id="device-connection-title">${isDiscovery ? 'Discover Cameras' : isFetch ? 'Fetch Macro from Device' : `Connect to ${actionLabel}`}</h2></div>
            <button class="icon-button" type="button" data-close-device-connection aria-label="Close device connection dialog" ${this.busy ? 'disabled' : ''}>×</button>
          </header>
          <div class="confirm-dialog-content device-connection-content">
            <p>${isDiscovery ? 'Verify the exact device, then read its camera input configuration and status without fetching the macro or changing RoomOS.' : isFetch ? 'Verify the exact device, then read its installed solution macro without changing or restarting RoomOS.' : `Verify the exact device, then immediately ${operation} the configured solution. This restarts every active macro on the device.`}</p>
            <div class="device-form">
              <label class="field wide"><span>Device address</span><input id="device-host" placeholder="room-device.example.com" value="${escapeHtml(this.credentials.host)}" ${this.busy ? 'disabled' : ''}></label>
              <label class="field"><span>Administrator username</span><input id="device-username" autocomplete="username" value="${escapeHtml(this.credentials.username)}" ${this.busy ? 'disabled' : ''}></label>
              <label class="field"><span>Administrator password</span><input id="device-password" type="password" autocomplete="current-password" ${this.busy ? 'disabled' : ''}></label>
              <label class="field wide"><span>Expected serial number</span><input id="expected-serial" value="${escapeHtml(this.expectedSerial)}" ${this.busy ? 'disabled' : ''}><small>The observed serial is never displayed or logged.</small></label>
            </div>
            <p class="device-cache-note">The device address and username are saved in this browser. The password and expected serial number are never cached.</p>
            ${this.busy && this.statusMessage ? `<div class="callout progress"><strong>Connection progress</strong><p>${escapeHtml(this.statusMessage)}</p></div>` : ''}
            ${this.errorMessage ? `<div class="callout error"><strong>Unable to connect</strong><p>${escapeHtml(this.errorMessage)}</p></div>` : ''}
          </div>
          <footer>
            <button class="button secondary" id="trust-certificate" type="button" ${this.busy ? 'disabled' : ''}>Open certificate page</button>
            <button class="button secondary" type="button" data-close-device-connection ${this.busy ? 'disabled' : ''}>Cancel</button>
            <button class="button primary" id="connect-device" type="button" ${this.busy ? 'disabled' : ''}>${this.busy ? 'Connecting…' : isDiscovery ? 'Connect, verify, and discover' : isFetch ? 'Connect, verify, and fetch' : `Connect, verify, and ${operation}`}</button>
          </footer>
        </div>
      </dialog>`;
  }

  private renderInstallConfirmationModal(): string {
    const session = this.deviceSession.snapshot();
    const activeCalls = session.verifiedDevice?.activeCalls ?? 0;
    const isUpdate = this.installationMode === 'update';
    const actionLabel = isUpdate ? 'Update Macro' : 'Install Macro';
    return `
      <dialog class="install-confirm-dialog no-print" id="install-confirm-dialog" aria-labelledby="install-confirm-title">
        <div class="confirm-dialog-shell">
          <header>
            <div><span class="section-kicker">Confirm device change</span><h2 id="install-confirm-title">${actionLabel}</h2></div>
            <button class="icon-button" type="button" data-close-install-confirmation aria-label="Close confirmation dialog">×</button>
          </header>
          <div class="confirm-dialog-content">
            <p>The installer will save both macros, activate the configured solution, and restart the RoomOS macro runtime. Every active macro on this device will restart.</p>
            ${activeCalls > 0 ? `
              <div class="callout warning"><strong>Device is currently on a call</strong><p>${activeCalls} active call(s) detected. The ${actionLabel.toLowerCase()} is blocked until the call has ended. Close this prompt and try again afterward.</p></div>
            ` : `
              <div class="callout success"><strong>No active calls detected</strong><p>The device was checked immediately before this confirmation prompt.</p></div>
            `}
          </div>
          <footer>
            <button class="button secondary" type="button" data-close-install-confirmation>${activeCalls > 0 ? 'Close' : 'Cancel'}</button>
            ${activeCalls === 0 ? `<button class="button primary" id="confirm-install-device" type="button">Confirm ${actionLabel}</button>` : ''}
          </footer>
        </div>
      </dialog>`;
  }

  private renderInstallationProgressModal(): string {
    const session = this.deviceSession.snapshot();
    const installResult = session.installationResult;
    const isUpdate = this.installationProgressMode === 'update';
    const operationLabel = isUpdate ? 'Updating macro' : 'Installing macro';
    const outcome = this.errorMessage || installResult?.kind === 'failed'
      ? 'error'
      : installResult?.kind === 'timeout'
        ? 'warning'
        : installResult?.kind === 'ready'
          ? 'success'
          : 'progress';
    const outcomeTitle = outcome === 'error'
      ? 'Installation stopped'
      : outcome === 'warning'
        ? 'Initialization not confirmed'
        : outcome === 'success'
          ? 'Installation complete'
          : operationLabel;
    const outcomeMessage = this.errorMessage
      || installResult?.message
      || this.statusMessage
      || 'Preparing the RoomOS installation.';
    return `
      <dialog class="installation-progress-dialog no-print" id="installation-progress-dialog" aria-labelledby="installation-progress-title" aria-describedby="installation-progress-summary" aria-busy="${this.busy}" tabindex="-1">
        <div class="confirm-dialog-shell installation-progress-shell">
          <header>
            <div><span class="section-kicker">RoomOS installation</span><h2 id="installation-progress-title">${operationLabel}</h2></div>
            ${this.busy ? '' : '<button class="icon-button" type="button" data-close-installation-progress aria-label="Close installation progress dialog">×</button>'}
          </header>
          <div class="confirm-dialog-content installation-progress-content">
            <div class="installation-progress-status ${outcome}" id="installation-progress-summary" role="status" aria-live="polite" aria-atomic="true">
              ${this.busy ? '<span class="installation-progress-spinner" aria-hidden="true"></span>' : `<span class="installation-progress-outcome" aria-hidden="true">${outcome === 'success' ? '✓' : '!'}</span>`}
              <div><strong>${outcomeTitle}</strong><p>${escapeHtml(outcomeMessage)}</p></div>
            </div>
            <ol class="installation-progress-log" aria-label="Installation steps">
              ${this.installationProgressMessages.map((message, index) => {
                const isCurrent = this.busy && index === this.installationProgressMessages.length - 1;
                const isLastOutcome = !this.busy && index === this.installationProgressMessages.length - 1 && outcome !== 'success';
                const itemClass = isCurrent ? 'current' : isLastOutcome ? outcome : 'complete';
                return `<li class="${itemClass}"><span aria-hidden="true">${itemClass === 'complete' ? '✓' : index + 1}</span><p>${escapeHtml(message)}</p></li>`;
              }).join('')}
            </ol>
          </div>
          <footer>
            ${this.busy
              ? '<p class="installation-progress-note">Keep this window open while the installation is in progress.</p>'
              : '<button class="button primary" type="button" data-close-installation-progress>Close</button>'}
          </footer>
        </div>
      </dialog>`;
  }

  private render(): void {
    const currentYear = new Date().getFullYear();
    this.root.innerHTML = `
      <div class="site-shell">
        <nav class="topbar no-print">
          <button type="button" class="wordmark" data-workflow-step="1">
            <span class="wordmark-mark" aria-hidden="true"><img src="/icons/joystick-camera-control.svg" alt=""></span>
            <span class="wordmark-copy"><strong>Joystick Camera Control</strong><small>${JOYSTICK_MODEL}</small></span>
          </button>
          <div class="topbar-actions">
            <label class="theme-picker"><span>Theme</span><select id="theme-preference" aria-label="Theme">
              <option value="system" ${this.themePreference === 'system' ? 'selected' : ''}>System</option>
              <option value="light" ${this.themePreference === 'light' ? 'selected' : ''}>Light</option>
              <option value="dark" ${this.themePreference === 'dark' ? 'selected' : ''}>Dark</option>
            </select></label>
            <button class="nav-button" data-open-about type="button">About</button>
          </div>
        </nav>
        <main class="workflow-shell">
          ${this.renderWorkflowRail()}
          <div class="workflow-main">
            <section class="workflow-page" tabindex="-1" aria-label="${WORKFLOW_STEPS[this.workflow.currentStep - 1].title}">
              ${this.renderCurrentPage()}
            </section>
            ${this.renderWorkflowActions()}
          </div>
        </main>
        <footer class="site-footer no-print">
          <p>&copy; ${currentYear} Cisco Systems, Inc. <span aria-hidden="true">||</span> Created by the Collaboration TME team</p>
          <a href="${CISCO_SAMPLE_CODE_LICENSE_URL}" target="_blank" rel="noreferrer" aria-label="Cisco Sample Code License (opens in a new tab)">Cisco Sample Code License</a>
        </footer>
        ${this.renderAboutModal()}
        ${this.renderActionDefinitionsModal()}
        ${this.renderDeviceConnectionModal()}
        ${this.renderInstallConfirmationModal()}
        ${this.renderInstallationProgressModal()}
      </div>
      ${renderConfiguredPrintSheet(this.state)}`;
    this.bindEvents();
    if (this.deviceConnectionOpen) {
      const dialog = this.byId('device-connection-dialog') as HTMLDialogElement | null;
      if (dialog && !dialog.open) dialog.showModal();
    }
    if (this.installConfirmationOpen) {
      const dialog = this.byId('install-confirm-dialog') as HTMLDialogElement | null;
      if (dialog && !dialog.open) dialog.showModal();
    }
    if (this.installationProgressOpen) {
      const dialog = this.byId('installation-progress-dialog') as HTMLDialogElement | null;
      if (dialog && !dialog.open) dialog.showModal();
    }
    const session = this.deviceSession.snapshot();
    if (
      this.workflow.currentStep === 2 &&
      session.connected &&
      session.verifiedDevice?.serialMatches &&
      this.cameraDiscoveryHost !== session.host &&
      !this.cameraDiscoveryLoading &&
      !this.cameraDiscoveryScheduled
    ) {
      this.cameraDiscoveryScheduled = true;
      window.setTimeout(() => {
        this.cameraDiscoveryScheduled = false;
        void this.discoverCameras(false);
      }, 0);
    }
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-workflow-step]').forEach((button) => {
      button.addEventListener('click', () => this.navigateToStep(Number(button.dataset.workflowStep) as WorkflowStep));
    });

    this.byId('theme-preference')?.addEventListener('change', (event) => {
      this.setThemePreference((event.currentTarget as HTMLSelectElement).value as ThemePreference);
    });
    this.byId('base-macro-release')?.addEventListener('change', (event) => {
      const tag = (event.currentTarget as HTMLSelectElement).value;
      if (tag) void this.selectReleaseTarget(tag);
    });
    this.byId('migrate-latest-release')?.addEventListener('click', () => {
      void this.migrateToLatest();
    });

    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]').forEach((input) => {
      const key = input.dataset.setting as keyof ConfiguratorState;
      if (key === 'projectName' || key === 'roomName') {
        input.addEventListener('input', () => {
          if (key === 'projectName') this.state.projectName = input.value;
          if (key === 'roomName') this.state.roomName = input.value;
          this.syncDocumentMetadata();
        });
        return;
      }
      input.addEventListener('change', () => {
        if (key === 'handedness') this.state.handedness = input.value as ConfiguratorState['handedness'];
        if (key === 'setDefaultCamera') this.state.setDefaultCamera = input.value === 'true';
        if (key === 'panelLocation') this.state.panelLocation = input.value as ConfiguratorState['panelLocation'];
        if (key === 'previewMode') this.state.previewMode = input.value as ConfiguratorState['previewMode'];
        if (key === 'previewOutput') this.state.previewOutput = Number(input.value);
        if (key === 'panTiltRampSpeed') this.state.panTiltRampSpeed = Number(input.value);
        if (key === 'zoomRampSpeed') this.state.zoomRampSpeed = Number(input.value);
        if (key === 'slowModeDivisor') this.state.slowModeDivisor = Number(input.value);
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-camera-id]').forEach((input) => {
      const field = input.dataset.cameraField as 'Name' | 'ConnectorId' | 'ControlId';
      if (field === 'Name' || field === 'ConnectorId') {
        input.addEventListener('input', () => {
          const camera = this.cameraById(input.dataset.cameraId);
          if (camera && field === 'Name') camera.Name = input.value;
          if (camera && field === 'ConnectorId') camera.ConnectorId = input.value;
          this.cameraMessage = '';
          this.syncCameraMetadata();
        });
        return;
      }
      input.addEventListener('change', () => {
        const camera = this.cameraById(input.dataset.cameraId);
        if (camera && field === 'ControlId') camera.ControlId = input.value || null;
        this.cameraMessage = '';
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLSelectElement>('[data-button-number]').forEach((select) => {
      select.addEventListener('change', () => {
        const buttonNumber = Number(select.dataset.buttonNumber);
        const cameraId = assignmentCameraId(select.value);
        if (cameraId) {
          for (const button of PHYSICAL_BUTTONS) {
            if (button.number !== buttonNumber && this.state.assignments[button.number] === select.value) {
              this.state.assignments[button.number] = UNUSED_ASSIGNMENT;
            }
          }
        }
        this.state.assignments[buttonNumber] = select.value;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-focus-button]').forEach((button) => {
      button.addEventListener('click', () => {
        const number = button.dataset.focusButton;
        const row = document.getElementById(`button-row-${number}`);
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => row?.querySelector('select')?.focus(), 350);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-restore-button]').forEach((button) => {
      button.addEventListener('click', () => this.restoreDefaultButton(Number(button.dataset.restoreButton)));
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-open-about]').forEach((button) => {
      button.addEventListener('click', () => {
        const dialog = this.byId('about-dialog') as HTMLDialogElement | null;
        if (dialog && !dialog.open) dialog.showModal();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-open-action-definitions]').forEach((button) => {
      button.addEventListener('click', () => {
        const dialog = this.byId('action-definitions-dialog') as HTMLDialogElement | null;
        if (dialog && !dialog.open) dialog.showModal();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-close-action-definitions]').forEach((button) => {
      button.addEventListener('click', () => {
        const dialog = this.byId('action-definitions-dialog') as HTMLDialogElement | null;
        if (dialog?.open) dialog.close();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-remove-camera]').forEach((button) => {
      button.addEventListener('click', () => {
        const cameraId = button.dataset.removeCamera;
        if (!cameraId || this.state.cameras.length === 1) return;
        this.state.cameras = this.state.cameras.filter((camera) => camera.id !== cameraId);
        for (const physicalButton of PHYSICAL_BUTTONS) {
          if (this.state.assignments[physicalButton.number] === cameraAssignment(cameraId)) {
            this.state.assignments[physicalButton.number] = UNUSED_ASSIGNMENT;
          }
        }
        if (this.state.defaultCameraId === cameraId) this.state.defaultCameraId = this.state.cameras[0].id;
        this.render();
      });
    });

    this.byId('add-camera')?.addEventListener('click', () => this.addCamera());
    this.byId('discover-cameras')?.addEventListener('click', () => void this.beginCameraDiscovery());
    this.byId('refresh-cameras')?.addEventListener('click', () => void this.discoverCameras(true));
    this.root.querySelectorAll<HTMLButtonElement>('[data-use-discovered-camera]').forEach((button) => {
      button.addEventListener('click', () => this.addOrUpdateDiscoveredCamera(button.dataset.useDiscoveredCamera));
    });
    this.byId('restore-default-controls')?.addEventListener('click', () => this.restoreDefaultControls());
    this.byId('fresh-installation')?.addEventListener('click', () => void this.startFreshInstallation());
    this.byId('import-macro-file')?.addEventListener('change', (event) => {
      void this.importMacroFile(event.currentTarget as HTMLInputElement);
    });
    this.byId('begin-device-macro-fetch')?.addEventListener('click', () => void this.beginDeviceMacroFetch());
    this.byId('default-camera')?.addEventListener('change', (event) => {
      this.state.defaultCameraId = (event.currentTarget as HTMLSelectElement).value;
      this.render();
    });
    this.byId('download-macro')?.addEventListener('click', () => this.downloadConfiguredMacro());
    this.byId('download-operator-guide')?.addEventListener('click', () => void this.downloadOperatorGuide());
    this.root.querySelectorAll<HTMLButtonElement>('[data-open-device-connection]').forEach((button) => {
      button.addEventListener('click', () => this.openDeviceConnection(false));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-open-install-confirmation]').forEach((button) => {
      button.addEventListener('click', () => void this.openInstallConfirmation());
    });
    this.byId('trust-certificate')?.addEventListener('click', () => this.openCertificatePage());
    this.byId('connect-device')?.addEventListener('click', () => void this.connectDevice());
    this.byId('disconnect-device')?.addEventListener('click', () => this.disconnectDevice());
    this.root.querySelectorAll<HTMLButtonElement>('[data-close-device-connection]').forEach((button) => {
      button.addEventListener('click', () => this.closeDeviceConnection());
    });
    const connectionDialog = this.byId('device-connection-dialog') as HTMLDialogElement | null;
    connectionDialog?.addEventListener('cancel', (event) => {
      if (this.busy) event.preventDefault();
    });
    connectionDialog?.addEventListener('close', () => {
      if (!this.deviceConnectionOpen) return;
      this.captureDeviceFields();
      this.credentials.password = '';
      this.deviceConnectionOpen = false;
      this.pendingDeviceAction = undefined;
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-close-install-confirmation]').forEach((button) => {
      button.addEventListener('click', () => this.closeInstallConfirmation());
    });
    const installDialog = this.byId('install-confirm-dialog') as HTMLDialogElement | null;
    installDialog?.addEventListener('close', () => {
      this.installConfirmationOpen = false;
    });
    this.byId('confirm-install-device')?.addEventListener('click', () => {
      this.installConfirmationOpen = false;
      installDialog?.close();
      void this.installDevice();
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-close-installation-progress]').forEach((button) => {
      button.addEventListener('click', () => this.closeInstallationProgress());
    });
    const progressDialog = this.byId('installation-progress-dialog') as HTMLDialogElement | null;
    progressDialog?.addEventListener('cancel', (event) => {
      if (this.busy) event.preventDefault();
    });
    progressDialog?.addEventListener('close', () => {
      if (!this.busy) this.installationProgressOpen = false;
    });
  }

  private byId(id: string): HTMLElement | null {
    return this.root.querySelector(`#${id}`);
  }

  private syncDocumentMetadata(): void {
    this.root.querySelectorAll<HTMLElement>('[data-project-name-output]').forEach((element) => {
      element.textContent = this.state.projectName || 'Joystick Camera Control';
    });
    this.root.querySelectorAll<HTMLElement>('[data-room-name-output]').forEach((element) => {
      element.textContent = this.state.roomName || 'Room';
    });
    const preview = this.root.querySelector<HTMLElement>('.code-preview code');
    if (preview && !validateConfiguratorState(this.state).length) {
      preview.textContent = generateConfigSource(this.state);
    }
  }

  private syncCameraMetadata(): void {
    const cameraActions = cameraButtonActions(this.state.cameras);
    this.root.querySelectorAll<HTMLElement>('.camera-card').forEach((card) => {
      const nameInput = card.querySelector<HTMLInputElement>('input[data-camera-field="Name"]');
      const camera = this.cameraById(nameInput?.dataset.cameraId);
      if (!camera) return;
      const name = camera.Name || 'Unnamed camera';
      const heading = card.querySelector<HTMLElement>('.camera-card-header strong');
      const action = card.querySelector<HTMLElement>('.camera-card-header code');
      const remove = card.querySelector<HTMLButtonElement>('[data-remove-camera]');
      if (heading) heading.textContent = camera.Name || `Camera ${this.state.cameras.indexOf(camera) + 1}`;
      if (action) action.textContent = cameraActions.get(camera.id) ?? '';
      if (remove) remove.setAttribute('aria-label', `Remove ${name}`);
    });
    const defaultCamera = this.byId('default-camera') as HTMLSelectElement | null;
    for (const option of defaultCamera?.options ?? []) {
      const camera = this.cameraById(option.value);
      if (camera) option.textContent = camera.Name || 'Unnamed camera';
    }
    const next = this.root.querySelector<HTMLButtonElement>('.workflow-actions [data-workflow-step="3"]');
    if (next) next.disabled = validateConfiguratorState(this.state).length > 0;
    this.root.querySelector('.camera-message')?.remove();
    const printSheet = this.root.querySelector<HTMLElement>('.print-sheet');
    if (printSheet) printSheet.outerHTML = renderConfiguredPrintSheet(this.state);
  }

  private async selectReleaseTarget(tag: string): Promise<void> {
    if (!this.catalog || !this.releaseResolution || this.busy) return;
    const previousSources = this.sources;
    const previousResolution = this.releaseResolution;
    this.busy = true;
    this.sourceError = '';
    this.render();
    try {
      const localDevelopment = tag === LOCAL_DEVELOPMENT_TARGET;
      const sources = localDevelopment
        ? await this.loadLocalSources()
        : await this.loadReleaseSources(tag);
      this.sources = sources;
      this.releaseResolution = localDevelopment
        ? { ...previousResolution, targetTag: sources.release.tag, targetChosenExplicitly: true }
        : chooseReleaseTarget(previousResolution, this.catalog, sources.release.tag);
      this.configurationError = '';
      const targetLabel = localDevelopment
        ? `Local Development (Macro Version ${sources.release.tag})`
        : sources.release.tag;
      this.configurationMessage = previousResolution.origin === 'fresh'
        ? `Fresh installations now target ${targetLabel}. Your configuration settings were preserved.`
        : `Migrated the recovered configuration to ${targetLabel}. No device changes were made.`;
    } catch (error) {
      this.sources = previousSources;
      this.releaseResolution = previousResolution;
      this.sourceError = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async migrateToLatest(): Promise<void> {
    if (!this.catalog || !this.releaseResolution || this.busy) return;
    const latestResolution = migrateToLatestRelease(this.releaseResolution, this.catalog);
    await this.selectReleaseTarget(latestResolution.targetTag!);
  }

  private async loadConfigurationSource(
    source: string,
    message: string,
    origin: Exclude<MacroSourceOrigin, 'fresh'>,
  ): Promise<void> {
    if (!this.catalog) throw new Error('The installer Release catalog is not available.');
    const ingested = ingestMacroSource(source, this.catalog, origin);
    this.state = ingested.state;
    this.releaseResolution = ingested.release;
    this.sources = undefined;
    this.sourceError = '';
    if (ingested.release.targetTag) {
      try {
        this.sources = await this.loadReleaseSources(ingested.release.targetTag);
      } catch (error) {
        this.sourceError = error instanceof Error ? error.message : String(error);
      }
    }
    this.configurationError = '';
    this.configurationMessage = message;
  }

  private async startFreshInstallation(): Promise<void> {
    if (!this.catalog || this.busy) return;
    const selectedTag = this.releaseResolution?.targetTag ?? latestCatalogRelease(this.catalog).tag;
    this.busy = true;
    this.sourceError = '';
    try {
      const sources = this.sources?.kind === 'local-development'
        ? await this.loadLocalSources()
        : await this.loadReleaseSources(selectedTag);
      this.sources = sources;
      this.releaseResolution = {
        origin: 'fresh',
        recognition: 'fresh',
        targetTag: sources.release.tag,
        targetChosenExplicitly: sources.kind === 'local-development' || sources.release.tag !== this.catalog.latest,
      };
    } catch (error) {
      this.sourceError = error instanceof Error ? error.message : String(error);
      this.busy = false;
      this.render();
      return;
    }
    this.state = createDefaultState();
    this.installationMode = 'install';
    this.configurationMessage = '';
    this.configurationError = '';
    this.busy = false;
    this.navigateToStep(2);
  }

  private async importMacroFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;
    this.configurationMessage = '';
    this.configurationError = '';
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a macro smaller than 1 MiB.');
      await this.loadConfigurationSource(
        await file.text(),
        `Loaded ${file.name}. Review the recovered settings before downloading or installing.`,
        'upload',
      );
      this.installationMode = 'install';
    } catch (error) {
      this.configurationError = error instanceof Error ? error.message : String(error);
    }
    this.render();
  }

  private async beginDeviceMacroFetch(): Promise<void> {
    const session = this.deviceSession.snapshot();
    if (session.connected && session.verifiedDevice?.serialMatches) {
      await this.fetchInstalledMacro();
      return;
    }
    this.openDeviceConnection(true);
  }

  private async fetchInstalledMacro(): Promise<void> {
    const session = this.deviceSession.snapshot();
    if (!session.connected || !session.verifiedDevice?.serialMatches || !this.catalog) return;
    const macroName = latestCatalogRelease(this.catalog).macro.macroName;
    this.configurationMessage = '';
    this.configurationError = '';
    this.busy = true;
    this.statusMessage = `Reading ${macroName} from the verified device.`;
    this.render();
    try {
      const source = await this.deviceSession.fetchInstalledMacro(macroName);
      await this.loadConfigurationSource(
        source,
        `Fetched ${macroName} from the verified device. Review the recovered settings before installing changes.`,
        'device',
      );
      this.installationMode = 'update';
      this.statusMessage = 'The installed macro configuration was loaded without changing the device.';
      this.pendingDeviceAction = undefined;
    } catch (error) {
      this.configurationError = error instanceof Error ? error.message : String(error);
      this.statusMessage = 'The device was not changed.';
      this.pendingDeviceAction = undefined;
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private addCamera(): void {
    if (this.state.cameras.length >= 4) return;
    const id = `camera-${Date.now()}`;
    const number = this.state.cameras.length + 1;
    let connectorNumber = 1;
    const connectorIds = new Set(this.state.cameras.map((camera) => camera.ConnectorId.trim()));
    while (connectorIds.has(String(connectorNumber))) connectorNumber += 1;
    this.state.cameras.push({
      id,
      Name: `Camera ${number}`,
      ConnectorId: String(connectorNumber),
      ControlId: String(connectorNumber),
    });
    const assigned = this.assignAvailableButton(id, number);
    this.cameraMessage = assigned
      ? `Camera ${number} was added and assigned to an available joystick button.`
      : `Camera ${number} was added. Assign this camera to one button in Configure Controls.`;
    this.render();
  }

  private assignAvailableButton(cameraId: string, number: number): boolean {
    const preferredButtons = [DEFAULT_CAMERA_BUTTONS[number - 1], 13, 14, 8, 2, 11, 12, 15, 16, 5, 6, 7, 9, 10, 3, 4, 1]
      .filter((button): button is number => button !== undefined);
    const available = preferredButtons.find((button) => this.state.assignments[button] === UNUSED_ASSIGNMENT);
    if (available) this.state.assignments[available] = cameraAssignment(cameraId);
    return available !== undefined;
  }

  private addOrUpdateDiscoveredCamera(connectorId: string | undefined): void {
    if (!connectorId) return;
    const discovered = this.discoveredCameras.find((source) => source.ConnectorId === connectorId);
    if (!discovered) return;
    const configured = this.state.cameras.find((camera) => camera.ConnectorId.trim() === connectorId);
    const name = discovered.Name.trim() || configured?.Name.trim() || `Camera ${connectorId}`;
    if (configured) {
      configured.Name = name;
      configured.ControlId = discovered.ControlId;
      this.cameraMessage = `${name} was updated from discovered ConnectorId ${connectorId}. Its default and button assignments were preserved.`;
      this.render();
      return;
    }
    if (this.state.cameras.length >= 4) return;
    const id = `camera-${Date.now()}-${connectorId}`;
    this.state.cameras.push({
      id,
      Name: name,
      ConnectorId: connectorId,
      ControlId: discovered.ControlId,
    });
    const assigned = this.assignAvailableButton(id, this.state.cameras.length);
    this.cameraMessage = assigned
      ? `${name} was added and assigned to an available joystick button.`
      : `${name} was added. Assign this camera to one button in Configure Controls.`;
    this.render();
  }

  private async beginCameraDiscovery(): Promise<void> {
    const session = this.deviceSession.snapshot();
    if (!session.connected || !session.verifiedDevice?.serialMatches) {
      this.openDeviceConnection(false, true);
      return;
    }
    await this.discoverCameras(true);
  }

  private async discoverCameras(force: boolean): Promise<void> {
    const session = this.deviceSession.snapshot();
    if (!session.connected || !session.verifiedDevice?.serialMatches || this.cameraDiscoveryLoading) return;
    if (!force && this.cameraDiscoveryHost === session.host) return;
    this.cameraDiscoveryHost = session.host;
    this.cameraDiscoveryLoading = true;
    this.cameraDiscoveryError = '';
    this.discoveredCameras = [];
    this.render();
    try {
      this.discoveredCameras = await this.deviceSession.discoverCameraSources();
    } catch (error) {
      this.cameraDiscoveryError = error instanceof Error ? error.message : String(error);
    } finally {
      this.cameraDiscoveryLoading = false;
      this.render();
    }
  }

  private clearCameraDiscovery(): void {
    this.discoveredCameras = [];
    this.cameraDiscoveryHost = undefined;
    this.cameraDiscoveryLoading = false;
    this.cameraDiscoveryScheduled = false;
    this.cameraDiscoveryError = '';
  }

  private downloadConfiguredMacro(): void {
    if (!this.sources || !this.hasSupportedTarget()) return;
    try {
      const configured = generateConfiguredMacro(this.sources.macroTemplate, this.state);
      downloadText(this.sources.release.macro.fileName, configured);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.render();
    }
  }

  private async downloadOperatorGuide(): Promise<void> {
    try {
      const guide = await generateConfiguredOperatorGuide(this.state);
      downloadBinary(guide.fileName, guide.bytes, guide.mimeType);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.render();
    }
  }

  private openDeviceConnection(fetchMacro: boolean, discoverCameras = false): void {
    this.workflow.markProgress();
    this.pendingDeviceAction = discoverCameras ? 'discover-cameras' : fetchMacro ? 'fetch-macro' : 'install';
    this.deviceConnectionOpen = true;
    this.errorMessage = '';
    this.statusMessage = '';
    this.render();
  }

  private closeDeviceConnection(): void {
    this.captureDeviceFields();
    this.credentials.password = '';
    this.deviceConnectionOpen = false;
    this.pendingDeviceAction = undefined;
    const dialog = this.byId('device-connection-dialog') as HTMLDialogElement | null;
    if (dialog?.open) dialog.close();
  }

  private captureDeviceFields(): void {
    const host = this.byId('device-host') as HTMLInputElement | null;
    const username = this.byId('device-username') as HTMLInputElement | null;
    const password = this.byId('device-password') as HTMLInputElement | null;
    const serial = this.byId('expected-serial') as HTMLInputElement | null;
    this.credentials = {
      host: host?.value.trim() ?? this.credentials.host,
      username: username?.value.trim() ?? this.credentials.username,
      password: password?.value ?? '',
    };
    this.expectedSerial = serial?.value.trim() ?? this.expectedSerial;
    this.persistDeviceIdentity();
  }

  private persistDeviceIdentity(): void {
    try {
      window.localStorage.setItem(DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify({
        host: this.credentials.host,
        username: this.credentials.username,
      }));
    } catch {
      // Connection can continue even when durable browser storage is unavailable.
    }
  }

  private openCertificatePage(): void {
    this.captureDeviceFields();
    try {
      const host = normalizeDeviceHost(this.credentials.host);
      window.open(`https://${host}/`, '_blank', 'noopener,noreferrer');
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.render();
    }
  }

  private async connectDevice(): Promise<void> {
    this.captureDeviceFields();
    this.errorMessage = '';
    let actionAfterConnect: PendingDeviceAction | undefined;
    try {
      this.busy = true;
      this.statusMessage = 'Connecting to the RoomOS device.';
      this.render();
      this.clearCameraDiscovery();
      const session = await this.deviceSession.connect(this.credentials, this.expectedSerial);
      this.credentials.host = session.host ?? this.credentials.host;
      this.persistDeviceIdentity();
      actionAfterConnect = this.pendingDeviceAction;
      this.pendingDeviceAction = undefined;
      this.statusMessage = actionAfterConnect === 'fetch-macro'
        ? 'Connected and verified. Reading the installed macro.'
        : actionAfterConnect === 'discover-cameras'
          ? 'Connected and verified. Discovering cameras.'
          : 'Connected and verified. Starting installation.';
      this.deviceConnectionOpen = false;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.credentials.password = '';
      this.busy = false;
      this.render();
    }
    if (actionAfterConnect === 'fetch-macro') await this.fetchInstalledMacro();
    if (actionAfterConnect === 'discover-cameras') await this.discoverCameras(true);
    if (actionAfterConnect === 'install') await this.installDevice();
  }

  private disconnectDevice(): void {
    this.deviceSession.disconnect();
    this.clearCameraDiscovery();
    this.credentials.password = '';
    this.statusMessage = 'Disconnected. Credentials were cleared from the active connection.';
    this.pendingDeviceAction = undefined;
    this.deviceConnectionOpen = false;
    this.render();
  }

  private async openInstallConfirmation(): Promise<void> {
    const session = this.deviceSession.snapshot();
    if (!session.connected || !this.sources || !this.hasSupportedTarget() || !session.verifiedDevice?.serialMatches || this.busy) return;
    this.errorMessage = '';
    this.installConfirmationOpen = false;
    this.busy = true;
    this.statusMessage = 'Checking the device for active calls before confirmation.';
    this.render();
    try {
      const refreshed = await this.deviceSession.recheck();
      this.statusMessage = (refreshed.verifiedDevice?.activeCalls ?? 0) > 0
        ? 'An active call was detected. Installation remains blocked.'
        : 'Device status refreshed. Review the confirmation prompt.';
      this.installConfirmationOpen = true;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private closeInstallConfirmation(): void {
    this.installConfirmationOpen = false;
    const dialog = this.byId('install-confirm-dialog') as HTMLDialogElement | null;
    if (dialog?.open) dialog.close();
  }

  private recordInstallationProgress(message: string): void {
    this.statusMessage = message;
    if (this.installationProgressMessages.at(-1) !== message) {
      this.installationProgressMessages.push(message);
    }
  }

  private closeInstallationProgress(): void {
    if (this.busy) return;
    this.installationProgressOpen = false;
    const dialog = this.byId('installation-progress-dialog') as HTMLDialogElement | null;
    if (dialog?.open) dialog.close();
  }

  private async installDevice(): Promise<void> {
    const session = this.deviceSession.snapshot();
    if (!session.connected || !this.sources || !this.hasSupportedTarget() || !session.verifiedDevice?.serialMatches) return;
    if (session.verifiedDevice.activeCalls !== 0) {
      this.errorMessage = 'Installation is blocked while the device has an active call.';
      this.statusMessage = 'Connected and verified, but no device changes were made.';
      this.render();
      return;
    }
    this.errorMessage = '';
    this.installationProgressMessages = [];
    this.installationProgressMode = this.installationMode;
    this.installationProgressOpen = true;
    this.busy = true;
    this.recordInstallationProgress('Rechecking the device immediately before making changes.');
    this.render();
    try {
      this.recordInstallationProgress('Loading the verified packaged dependency before making device changes.');
      this.render();
      const macroSource = generateConfiguredMacro(this.sources.macroTemplate, this.state);
      const result = await this.deviceSession.install(
        {
          dependencies: this.sources.dependencies.map((dependency) => ({
            name: dependency.manifest.macroName,
            source: dependency.source,
          })),
          macroName: this.sources.release.macro.macroName,
          macroSource,
        },
        (message) => {
          this.recordInstallationProgress(message);
          this.render();
        },
      );
      this.installationMode = 'update';
      this.recordInstallationProgress(result.kind === 'ready'
        ? 'Installation commands were accepted and macro readiness was observed.'
        : 'Installation commands were accepted; review the initialization result below.');
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.recordInstallationProgress(this.errorMessage);
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
