import { generateConfigSource, generateConfiguredMacro, validateConfiguratorState } from './config';
import {
  connectToDevice,
  installAndVerify,
  normalizeDeviceHost,
  verifyConnectedDevice,
  type DeviceCredentials,
  type DeviceXapi,
  type InitializationResult,
  type VerifiedDevice,
} from './device';
import {
  BUILT_IN_ACTIONS,
  PHYSICAL_BUTTONS,
  assignmentActionId,
  assignmentCameraId,
  builtInAssignment,
  cameraAssignment,
  cameraButtonActions,
  createDefaultState,
  logicalButtonId,
  type ActionCategory,
  type CameraDefinition,
  type ConfiguratorState,
} from './model';
import { loadDependencySource, loadInstallerSources, type InstallerSources } from './source';

const UNUSED_ASSIGNMENT = builtInAssignment('Unassigned');

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function downloadText(fileName: string, content: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/javascript;charset=utf-8' }));
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
  private sources?: InstallerSources;
  private sourceError = '';
  private device?: DeviceXapi;
  private credentials: DeviceCredentials = { host: '', username: '', password: '' };
  private expectedSerial = '';
  private verifiedDevice?: VerifiedDevice;
  private restartAcknowledged = false;
  private busy = false;
  private statusMessage = '';
  private errorMessage = '';
  private installResult?: InitializationResult;

  constructor(private readonly root: HTMLElement) {}

  async initialize(): Promise<void> {
    this.render();
    try {
      this.sources = await loadInstallerSources();
    } catch (error) {
      this.sourceError = error instanceof Error ? error.message : String(error);
    }
    this.render();
  }

  private cameraById(cameraId: string | undefined): CameraDefinition | undefined {
    return this.state.cameras.find((camera) => camera.id === cameraId);
  }

  private assignmentInfo(assignment: string): AssignmentInfo {
    const actionId = assignmentActionId(assignment);
    if (actionId) {
      const action = BUILT_IN_ACTIONS.find((candidate) => candidate.id === actionId);
      if (action) {
        return {
          label: action.label,
          description: action.description,
          category: action.category,
          code: action.id,
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

  private actionOptions(selected: string): string {
    const actionOptions = BUILT_IN_ACTIONS.map((action) =>
      `<option value="${escapeHtml(builtInAssignment(action.id))}" ${selected === builtInAssignment(action.id) ? 'selected' : ''}>${escapeHtml(action.label)}</option>`
    ).join('');
    const cameraOptions = this.state.cameras.map((camera) =>
      `<option value="${escapeHtml(cameraAssignment(camera.id))}" ${selected === cameraAssignment(camera.id) ? 'selected' : ''}>Camera · ${escapeHtml(camera.Name || 'Unnamed camera')}</option>`
    ).join('');
    return `
      <optgroup label="Built-in actions">${actionOptions}</optgroup>
      <optgroup label="Configured cameras">${cameraOptions}</optgroup>`;
  }

  private assignedButtons(actionId: string): number[] {
    const target = builtInAssignment(actionId);
    return PHYSICAL_BUTTONS
      .filter((button) => this.state.assignments[button.number] === target)
      .map((button) => button.number);
  }

  private buttonChips(numbers: number[], category: ActionCategory): string {
    if (!numbers.length) return '<span class="chip unused">Not assigned</span>';
    return numbers.map((number) => `<span class="chip ${category}">${number}</span>`).join('');
  }

  private renderHeader(): string {
    return `
      <header class="hero">
        <div class="hero-copy">
          <span class="eyebrow">RoomOS · Thrustmaster T.16000M</span>
          <h1>Configure the controls.<br><span>Install with confidence.</span></h1>
          <p>Build a complete 16-button map, add up to four cameras, install the configured macro directly on a RoomOS device, and print the same mapping as an operator guide.</p>
          <div class="hero-actions no-print">
            <a class="button primary" href="#configure">Start configuring</a>
            <button class="button secondary" id="print-guide" type="button">Print operator guide</button>
          </div>
        </div>
        <div class="hero-summary">
          <div><strong>16</strong><span>buttons explicitly mapped</span></div>
          <div><strong>4</strong><span>camera maximum</span></div>
          <div><strong>1</strong><span>configured macro</span></div>
        </div>
      </header>`;
  }

  private renderSettings(): string {
    return `
      <section class="panel section no-print" id="configure">
        <div class="section-heading">
          <div><span class="section-kicker">01 · Setup</span><h2>Solution settings</h2></div>
          <p>These values drive the macro and the printable guide.</p>
        </div>
        <div class="settings-grid">
          <label class="field wide"><span>Guide title</span><input data-setting="documentTitle" value="${escapeHtml(this.state.documentTitle)}"></label>
          <label class="field"><span>Physical handedness switch</span>
            <select data-setting="handedness">
              <option value="right" ${this.state.handedness === 'right' ? 'selected' : ''}>Right-handed</option>
              <option value="left" ${this.state.handedness === 'left' ? 'selected' : ''}>Left-handed</option>
            </select>
          </label>
          <label class="field"><span>Preview matrix output</span><input type="number" min="1" step="1" data-setting="previewOutput" value="${this.state.previewOutput}"></label>
          <label class="field"><span>Camera ramp speed</span><input type="number" min="1" max="15" step="1" data-setting="baseRampSpeed" value="${this.state.baseRampSpeed}"></label>
          <label class="field"><span>Precision divisor</span><input type="number" min="0.1" step="0.1" data-setting="slowModeDivisor" value="${this.state.slowModeDivisor}"></label>
        </div>
      </section>`;
  }

  private renderCameras(): string {
    const cameraActions = cameraButtonActions(this.state.cameras);
    return `
      <section class="panel section no-print" id="cameras">
        <div class="section-heading">
          <div><span class="section-kicker">02 · Sources</span><h2>Cameras</h2></div>
          <p>Camera ButtonAction names are generated automatically and become choices in every button dropdown.</p>
        </div>
        <div class="camera-grid">
          ${this.state.cameras.map((camera, index) => `
            <article class="camera-card">
              <div class="camera-card-header">
                <span class="camera-number">${index + 1}</span>
                <div><strong>${escapeHtml(camera.Name || `Camera ${index + 1}`)}</strong><code>${escapeHtml(cameraActions.get(camera.id) ?? '')}</code></div>
                <button class="icon-button" type="button" data-remove-camera="${escapeHtml(camera.id)}" ${this.state.cameras.length === 1 ? 'disabled' : ''} aria-label="Remove ${escapeHtml(camera.Name || 'camera')}">×</button>
              </div>
              <div class="camera-fields">
                <label class="field wide"><span>Camera name</span><input data-camera-id="${escapeHtml(camera.id)}" data-camera-field="Name" value="${escapeHtml(camera.Name)}"></label>
                <label class="field"><span>Video ConnectorId</span><input data-camera-id="${escapeHtml(camera.id)}" data-camera-field="ConnectorId" inputmode="numeric" value="${escapeHtml(camera.ConnectorId)}"></label>
                <label class="field"><span>Camera ControlId</span><input data-camera-id="${escapeHtml(camera.id)}" data-camera-field="ControlId" inputmode="numeric" value="${escapeHtml(camera.ControlId)}"></label>
              </div>
            </article>`).join('')}
        </div>
        <div class="camera-actions">
          <button class="button secondary" id="add-camera" type="button" ${this.state.cameras.length >= 4 ? 'disabled' : ''}>Add camera</button>
          <label class="field default-camera"><span>Default camera</span>
            <select id="default-camera">
              ${this.state.cameras.map((camera) => `<option value="${escapeHtml(camera.id)}" ${camera.id === this.state.defaultCameraId ? 'selected' : ''}>${escapeHtml(camera.Name || 'Unnamed camera')}</option>`).join('')}
            </select>
          </label>
        </div>
      </section>`;
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
          <div><span class="section-kicker">03 · Controls</span><h2>Complete button map</h2></div>
          <p class="no-print">Click a numbered pin to jump to its assignment. Camera selections move automatically if selected on another button.</p>
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
                ['unused', 'Unassigned'],
              ].map(([category, label]) => `<span><i class="${category}"></i>${label}</span>`).join('')}
            </div>
          </div>
          <div class="assignment-list">
            ${PHYSICAL_BUTTONS.map((button) => {
              const assignment = this.state.assignments[button.number];
              const info = this.assignmentInfo(assignment);
              return `
                <article class="assignment-row" id="button-row-${button.number}">
                  <span class="chip ${info.category}">${button.number}</span>
                  <div class="assignment-name"><strong>${escapeHtml(button.label)}</strong><code>${escapeHtml(logicalButtonId(button, this.state.handedness))}</code></div>
                  <label class="field compact no-print"><span>ButtonAction</span><select data-button-number="${button.number}">${this.actionOptions(assignment)}</select></label>
                  <div class="assignment-result"><strong>${escapeHtml(info.label)}</strong><span>${escapeHtml(info.description)}</span></div>
                </article>`;
            }).join('')}
          </div>
        </div>
      </section>`;
  }

  private renderManifest(): string {
    return `
      <section class="panel section manifest-section" id="manifest">
        <div class="section-heading">
          <div><span class="section-kicker">Control manifest</span><h2>Available built-in actions</h2></div>
          <p>Camera ButtonActions are generated from the camera list and appear separately in the button dropdowns.</p>
        </div>
        <div class="manifest-grid">
          ${BUILT_IN_ACTIONS.map((action) => `
            <article class="manifest-item">
              <span class="manifest-mark ${action.category}"></span>
              <div><code>${escapeHtml(action.id)}</code><strong>${escapeHtml(action.label)}</strong><p>${escapeHtml(action.description)}</p></div>
            </article>`).join('')}
        </div>
      </section>`;
  }

  private renderOutput(): string {
    const errors = validateConfiguratorState(this.state);
    let configSource = '';
    if (!errors.length) configSource = generateConfigSource(this.state);
    return `
      <section class="panel section no-print" id="output">
        <div class="section-heading">
          <div><span class="section-kicker">04 · Output</span><h2>Generated configuration</h2></div>
          <p>The installer injects this exact configuration into the packaged macro.</p>
        </div>
        ${errors.length ? `<div class="callout error"><strong>Configuration needs attention</strong><ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul></div>` : `
          <div class="output-actions">
            <button class="button primary" id="download-macro" type="button" ${this.sources ? '' : 'disabled'}>Download configured macro</button>
            <button class="button secondary" id="copy-config" type="button">Copy configuration</button>
            <button class="button secondary" id="print-guide-output" type="button">Print guide</button>
          </div>
          <pre class="code-preview"><code>${escapeHtml(configSource)}</code></pre>`}
        ${this.sourceError ? `<div class="callout error"><strong>Packaged source unavailable</strong><p>${escapeHtml(this.sourceError)}</p></div>` : ''}
      </section>`;
  }

  private renderInstaller(): string {
    const canInstall = Boolean(
      this.device &&
      this.verifiedDevice?.serialMatches &&
      this.verifiedDevice.activeCalls === 0 &&
      this.restartAcknowledged &&
      this.sources &&
      !validateConfiguratorState(this.state).length &&
      !this.busy,
    );
    return `
      <section class="panel section no-print installer-section" id="install">
        <div class="section-heading">
          <div><span class="section-kicker">05 · Device</span><h2>Install on RoomOS</h2></div>
          <p>Credentials stay in this browser session. The page connects directly to the device over secure WebSocket.</p>
        </div>
        <div class="install-layout">
          <div class="device-form">
            <label class="field wide"><span>Device address</span><input id="device-host" placeholder="room-device.example.com" value="${escapeHtml(this.credentials.host)}"></label>
            <label class="field"><span>Administrator username</span><input id="device-username" autocomplete="username" value="${escapeHtml(this.credentials.username)}"></label>
            <label class="field"><span>Administrator password</span><input id="device-password" type="password" autocomplete="current-password"></label>
            <label class="field wide"><span>Expected serial number</span><input id="expected-serial" value="${escapeHtml(this.expectedSerial)}"><small>The observed serial is never displayed or logged.</small></label>
            <div class="install-buttons">
              <button class="button secondary" id="trust-certificate" type="button">Open certificate page</button>
              ${this.device
                ? '<button class="button secondary" id="disconnect-device" type="button">Disconnect</button>'
                : `<button class="button primary" id="connect-device" type="button" ${this.busy ? 'disabled' : ''}>${this.busy ? 'Connecting…' : 'Connect and verify'}</button>`}
            </div>
          </div>
          <div class="install-review">
            <h3>Installation plan</h3>
            <ol class="install-plan">
              <li><span>1</span><div><strong>Install dependency</strong><code>Thrustmaster_16000M-Class</code><small>Saved inactive from its separate GitHub repository.</small></div></li>
              <li><span>2</span><div><strong>Install configured macro</strong><code>Joystick_CameraControl_ProductionSwitcher</code><small>Saved and activated with the mapping shown above.</small></div></li>
              <li><span>3</span><div><strong>Restart macro runtime</strong><small>Every active macro on the device restarts. The macro then installs its UI panel.</small></div></li>
            </ol>
            ${this.verifiedDevice ? `
              <div class="device-result ${this.verifiedDevice.serialMatches && this.verifiedDevice.activeCalls === 0 ? 'success' : 'error'}">
                <strong>${this.verifiedDevice.serialMatches ? 'Serial confirmed' : 'Serial mismatch — installation blocked'}</strong>
                <span>${escapeHtml(this.verifiedDevice.productPlatform)} · RoomOS ${escapeHtml(this.verifiedDevice.roomOsVersion)}</span>
                <span>${this.verifiedDevice.activeCalls === 0 ? 'No active calls' : `${this.verifiedDevice.activeCalls} active call(s) — installation blocked`}</span>
              </div>` : '<div class="device-result neutral"><strong>Not connected</strong><span>Trust the certificate, then connect and verify the exact device.</span></div>'}
            <label class="acknowledgement"><input id="restart-ack" type="checkbox" ${this.restartAcknowledged ? 'checked' : ''}><span>I understand that installation restarts every active macro on this device.</span></label>
            <button class="button install-button" id="install-device" type="button" ${canInstall ? '' : 'disabled'}>Install configured solution</button>
          </div>
        </div>
        ${this.statusMessage ? `<div class="callout progress"><strong>Installation progress</strong><p>${escapeHtml(this.statusMessage)}</p></div>` : ''}
        ${this.errorMessage ? `<div class="callout error"><strong>Unable to continue</strong><p>${escapeHtml(this.errorMessage)}</p></div>` : ''}
        ${this.installResult ? `<div class="callout ${this.installResult.kind === 'ready' ? 'success' : this.installResult.kind === 'failed' ? 'error' : 'warning'}"><strong>${this.installResult.kind === 'ready' ? 'Installation ready' : this.installResult.kind === 'failed' ? 'Initialization failed' : 'Initialization not confirmed'}</strong><p>${escapeHtml(this.installResult.message)}</p></div>` : ''}
      </section>`;
  }

  private renderOperatorGuide(): string {
    const precisionButtons = this.assignedButtons('PrecisionMode');
    const swapButtons = this.assignedButtons('SwapMainPreview');
    const mainButtons = this.assignedButtons('ControlMain');
    const previewButtons = this.assignedButtons('ControlPreview');
    const cameraActions = cameraButtonActions(this.state.cameras);
    return `
      <section class="operator-guide" id="operator-guide">
        <div class="guide-header">
          <span class="section-kicker">Printable operator documentation</span>
          <h2>${escapeHtml(this.state.documentTitle || 'Joystick Camera Control')}</h2>
          <p>Thrustmaster T.16000M camera operation · ${this.state.handedness === 'right' ? 'Right' : 'Left'}-handed hardware switch</p>
        </div>
        <div class="workflow-grid">
          <article><span>1</span><strong>Choose the target</strong><p>${this.buttonChips(mainButtons, 'main')} controls Main. ${this.buttonChips(previewButtons, 'preview')} controls Preview.</p></article>
          <article><span>2</span><strong>Choose a camera</strong><p>${this.state.cameras.map((camera) => {
            const numbers = PHYSICAL_BUTTONS.filter((button) => this.state.assignments[button.number] === cameraAssignment(camera.id)).map((button) => button.number);
            return `${this.buttonChips(numbers, 'camera')} ${escapeHtml(camera.Name)}`;
          }).join(' · ')}</p></article>
          <article><span>3</span><strong>Frame the shot</strong><p>Main stick pitch tilts, stick twist pans, and mini pitch zooms.</p></article>
          <article><span>4</span><strong>Refine and take live</strong><p>${this.buttonChips(precisionButtons, 'motion')} holds Precision mode. ${this.buttonChips(swapButtons, 'motion')} swaps Main and Preview.</p></article>
        </div>
        <div class="guide-tables">
          <div class="table-wrap">
            <h3>Button reference</h3>
            <table>
              <thead><tr><th>Button</th><th>Physical control</th><th>ButtonAction</th><th>What it does</th></tr></thead>
              <tbody>
                ${PHYSICAL_BUTTONS.map((button) => {
                  const info = this.assignmentInfo(this.state.assignments[button.number]);
                  return `<tr><td><span class="chip ${info.category}">${button.number}</span></td><td>${escapeHtml(button.label)}<code>${escapeHtml(logicalButtonId(button, this.state.handedness))}</code></td><td>${escapeHtml(info.label)}<code>${escapeHtml(info.code)}</code></td><td>${escapeHtml(info.description)}</td></tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="table-wrap camera-reference">
            <h3>Camera reference</h3>
            <table>
              <thead><tr><th>Camera</th><th>Button</th><th>ButtonAction</th><th>Video / control</th></tr></thead>
              <tbody>
                ${this.state.cameras.map((camera) => {
                  const button = PHYSICAL_BUTTONS.find((candidate) => this.state.assignments[candidate.number] === cameraAssignment(camera.id));
                  return `<tr><td>${escapeHtml(camera.Name)}</td><td>${button ? `<span class="chip camera">${button.number}</span>` : 'Not assigned'}</td><td><code>${escapeHtml(cameraActions.get(camera.id) ?? '')}</code></td><td>Connector ${escapeHtml(camera.ConnectorId)} · Camera ${escapeHtml(camera.ControlId)}</td></tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="guide-note"><strong>Operating habit</strong><p>Prepare the next camera in Preview, frame it with the joystick, then use Swap Main and Preview to take it live. Use Control Main only when the live shot needs an immediate correction.</p></div>
      </section>`;
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="site-shell">
        <nav class="topbar no-print">
          <a href="#" class="wordmark"><span>JC</span><strong>Joystick Camera Control</strong></a>
          <div><a href="#configure">Configure</a><a href="#button-map">Button map</a><a href="#install">Install</a><a href="#operator-guide">Guide</a></div>
        </nav>
        <main>
          ${this.renderHeader()}
          <div class="content-shell">
            ${this.renderSettings()}
            ${this.renderCameras()}
            ${this.renderButtonMap()}
            ${this.renderManifest()}
            ${this.renderOutput()}
            ${this.renderInstaller()}
            ${this.renderOperatorGuide()}
          </div>
        </main>
        <footer class="site-footer no-print">Cisco Sample Code · Configuration and credentials remain in this browser session.</footer>
      </div>`;
    this.bindEvents();
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.setting as keyof ConfiguratorState;
        if (key === 'documentTitle') this.state.documentTitle = input.value;
        if (key === 'handedness') this.state.handedness = input.value as ConfiguratorState['handedness'];
        if (key === 'previewOutput') this.state.previewOutput = Number(input.value);
        if (key === 'baseRampSpeed') this.state.baseRampSpeed = Number(input.value);
        if (key === 'slowModeDivisor') this.state.slowModeDivisor = Number(input.value);
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLInputElement>('[data-camera-id]').forEach((input) => {
      input.addEventListener('change', () => {
        const camera = this.cameraById(input.dataset.cameraId);
        const field = input.dataset.cameraField as 'Name' | 'ConnectorId' | 'ControlId';
        if (camera && field) camera[field] = input.value;
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
    this.byId('default-camera')?.addEventListener('change', (event) => {
      this.state.defaultCameraId = (event.currentTarget as HTMLSelectElement).value;
      this.render();
    });
    this.byId('download-macro')?.addEventListener('click', () => this.downloadConfiguredMacro());
    this.byId('copy-config')?.addEventListener('click', () => void this.copyConfiguration());
    this.byId('print-guide')?.addEventListener('click', () => window.print());
    this.byId('print-guide-output')?.addEventListener('click', () => window.print());
    this.byId('trust-certificate')?.addEventListener('click', () => this.openCertificatePage());
    this.byId('connect-device')?.addEventListener('click', () => void this.connectDevice());
    this.byId('disconnect-device')?.addEventListener('click', () => this.disconnectDevice());
    this.byId('restart-ack')?.addEventListener('change', (event) => {
      this.restartAcknowledged = (event.currentTarget as HTMLInputElement).checked;
      this.render();
    });
    this.byId('install-device')?.addEventListener('click', () => void this.installDevice());
  }

  private byId(id: string): HTMLElement | null {
    return this.root.querySelector(`#${id}`);
  }

  private addCamera(): void {
    if (this.state.cameras.length >= 4) return;
    const id = `camera-${Date.now()}`;
    const number = this.state.cameras.length + 1;
    this.state.cameras.push({
      id,
      Name: `Camera ${number}`,
      ConnectorId: String(number),
      ControlId: String(number),
    });
    const preferredButtons = [13, 14, 8, 2, 11, 12, 15, 16, 5, 6, 7, 9, 10, 3, 4, 1];
    const available = preferredButtons.find((button) => this.state.assignments[button] === UNUSED_ASSIGNMENT);
    if (available) this.state.assignments[available] = cameraAssignment(id);
    this.render();
  }

  private downloadConfiguredMacro(): void {
    if (!this.sources) return;
    try {
      const configured = generateConfiguredMacro(this.sources.macroTemplate, this.state);
      downloadText(this.sources.manifest.macro.fileName, configured);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.render();
    }
  }

  private async copyConfiguration(): Promise<void> {
    try {
      await navigator.clipboard.writeText(generateConfigSource(this.state));
      this.statusMessage = 'Configuration copied to the clipboard.';
    } catch {
      this.errorMessage = 'Unable to copy the configuration. Download the configured macro instead.';
    }
    this.render();
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
    this.installResult = undefined;
    try {
      if (!this.credentials.username || !this.credentials.password) throw new Error('Enter administrator credentials.');
      if (!this.expectedSerial) throw new Error('Enter the expected device serial number.');
      this.credentials.host = normalizeDeviceHost(this.credentials.host);
      this.busy = true;
      this.statusMessage = 'Connecting to the RoomOS device.';
      this.render();
      this.device = await connectToDevice(this.credentials);
      this.verifiedDevice = await verifyConnectedDevice(this.device, this.expectedSerial);
      if (!this.verifiedDevice.serialMatches) {
        this.device.close();
        this.device = undefined;
        throw new Error('The connected device did not match the expected serial number.');
      }
      this.statusMessage = 'Connected and verified. Review the installation plan.';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.verifiedDevice = undefined;
    } finally {
      this.credentials.password = '';
      this.busy = false;
      this.render();
    }
  }

  private disconnectDevice(): void {
    this.device?.close();
    this.device = undefined;
    this.verifiedDevice = undefined;
    this.credentials.password = '';
    this.statusMessage = 'Disconnected. Credentials were cleared from the active connection.';
    this.installResult = undefined;
    this.render();
  }

  private async installDevice(): Promise<void> {
    if (!this.device || !this.sources || !this.verifiedDevice?.serialMatches || this.verifiedDevice.activeCalls !== 0) return;
    this.errorMessage = '';
    this.installResult = undefined;
    this.busy = true;
    this.statusMessage = 'Loading the external Thrustmaster class before making device changes.';
    this.render();
    try {
      const [dependencySource, macroSource] = await Promise.all([
        loadDependencySource(this.sources.manifest),
        Promise.resolve(generateConfiguredMacro(this.sources.macroTemplate, this.state)),
      ]);
      this.installResult = await installAndVerify(
        this.device,
        {
          dependencyName: this.sources.manifest.dependency.macroName,
          dependencySource,
          macroName: this.sources.manifest.macro.macroName,
          macroSource,
        },
        (message) => {
          this.statusMessage = message;
          this.render();
        },
      );
      this.statusMessage = this.installResult.kind === 'ready'
        ? 'Installation commands were accepted and macro readiness was observed.'
        : 'Installation commands were accepted; review the initialization result below.';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
