import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('configurator workflow presentation', () => {
  it('renders the requested four-page order with return navigation', async () => {
    const [source, navigationSource] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./workflow.ts', import.meta.url), 'utf8'),
    ]);
    const pageNames = [
      'Introduction',
      'Macro Settings',
      'Button Assignments',
      'Review and Installation',
    ];

    const positions = pageNames.map((pageName) => navigationSource.indexOf(`title: '${pageName}'`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(source).toContain('data-workflow-step');
    expect(navigationSource).toContain('this.browserWindow.history.pushState');
    expect(navigationSource).toContain("this.browserWindow.addEventListener('popstate'");
  });

  it('keeps stable page numbers in the workflow rail without completion marks', async () => {
    const [source, styles] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./styles.css', import.meta.url), 'utf8'),
    ]);

    expect(source).toContain('<span class="workflow-step-status" aria-hidden="true">${number}</span>');
    expect(source).not.toContain('visitedSteps');
    expect(source).not.toContain("workflow-step${current ? ' current' : ''}${complete ? ' complete' : ''}");
    expect(styles).not.toContain('.workflow-step.complete');
  });

  it('keeps the product and joystick model left-aligned in the shared header', async () => {
    const [source, styles] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./styles.css', import.meta.url), 'utf8'),
    ]);

    expect(source).toContain("const JOYSTICK_MODEL = 'Thrustmaster T.16000M';");
    expect(source).toContain('<span class="wordmark-copy"><strong>Joystick Camera Control</strong><small>${JOYSTICK_MODEL}</small></span>');
    expect(styles).toMatch(/\.wordmark \{[^}]*justify-content: flex-start;[^}]*text-align: left;/s);
    expect(styles).toMatch(/\.wordmark-copy \{[^}]*justify-items: start;[^}]*text-align: left;/s);
  });

  it('aligns the Introduction purpose with the README and offers all three starting paths', async () => {
    const [source, readme] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../README.md', import.meta.url), 'utf8'),
    ]);

    expect(source).toContain('<h1>Joystick Camera Control Production Switcher</h1>');
    expect(source).toContain('without a separate control computer');
    expect(source).toContain('not generic USB controllers');
    expect(source).toContain('id="project-readme-link"');
    expect(source).toContain('Read the project README');
    expect(source).toContain('infocomm-2026-joystick-demo.png');
    expect(readme).toContain('# Joystick Camera Control Production Switcher');
    expect(readme).toContain('without a separate control computer');
    expect(readme).toContain('not a generic USB-joystick integration');
    expect(source).toContain('<strong>Fresh Installation</strong>');
    expect(source).toContain('<strong>Start from Macro</strong>');
    expect(source).toContain('<strong>Fetch Macro from Device</strong>');
    expect(source).toContain("this.openDeviceConnection(true);");
    expect(source).not.toContain('About this project');
    expect(source).not.toContain("if (currentStep === 1) return '';");
    expect(source).toContain('Continue to ${WORKFLOW_STEPS[next - 1].title}');
  });

  it('keeps the preflight context concise and links detailed requirements to the README', async () => {
    const [source, styles] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./styles.css', import.meta.url), 'utf8'),
    ]);

    expect(source).toContain('What to know before you begin');
    expect(source).toContain('T.16000M only');
    expect(source).toContain('Cisco certified cameras provide joystick PTZ control');
    expect(source).toContain('is not supported by Cisco TAC');
    expect(source).toContain('Review all requirements and limitations');
    expect(source).not.toContain('different HID profile that is incompatible with RoomOS');
    expect(styles).toContain('.purpose-checklist');
    expect(styles).toContain('.live-demo img');
  });

  it('places the solution highlight cards below the hero image', async () => {
    const [source, styles] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./styles.css', import.meta.url), 'utf8'),
    ]);
    const sidebar = source.indexOf('<div class="hero-sidebar">');
    const heroImage = source.indexOf('<figure class="live-demo">', sidebar);
    const highlights = source.indexOf('<ul class="solution-highlights"', sidebar);
    const checklist = source.indexOf('<aside class="purpose-checklist"', sidebar);

    expect(sidebar).toBeGreaterThan(-1);
    expect(heroImage).toBeGreaterThan(sidebar);
    expect(highlights).toBeGreaterThan(heroImage);
    expect(checklist).toBeGreaterThan(highlights);
    expect(styles).toMatch(/\.solution-highlights \{[^}]*margin: 0;/s);
  });

  it('opens device connection as a modal without navigating the workflow', async () => {
    const source = await readFile(new URL('./app.ts', import.meta.url), 'utf8');

    expect(source).toContain('id="device-connection-dialog"');
    expect(source).toContain('this.deviceConnectionOpen = true;');
    expect(source).toContain("session.connected ? 'data-open-install-confirmation' : 'data-open-device-connection'");
    expect(source).not.toContain('this.navigateToStep(4);');
  });

  it('merges cameras into Macro Settings and opens action definitions from assignments', async () => {
    const source = await readFile(new URL('./app.ts', import.meta.url), 'utf8');

    expect(source).toContain('${this.renderCameras()}');
    expect(source).toContain('data-open-action-definitions');
    expect(source).toContain('id="action-definitions-dialog"');
    expect(source).toContain('id="camera-actions-title">Configured cameras</h3>');
    expect(source).not.toContain('this.renderButtonMap()}${this.renderManifest()');
    expect(source).not.toContain('class="config-recovery"');
  });

  it('groups Macro Settings by the generated config hierarchy', async () => {
    const source = await readFile(new URL('./app.ts', import.meta.url), 'utf8');
    const settingsSource = source.slice(
      source.indexOf('private renderSettings()'),
      source.indexOf('private renderCameras()'),
    );

    for (const path of [
      'config.documentation',
      'config.previewDisplay',
      'config.userInterface',
      'config.joystick',
      'config.joystick.Camera',
    ]) {
      expect(settingsSource).toContain(`<code class="settings-path">${path}</code>`);
    }

    expect(settingsSource).toContain('class="settings-group settings-group-joystick"');
    expect(settingsSource).toContain('class="settings-subgroup"');
    expect(settingsSource.indexOf('config.joystick.Camera')).toBeGreaterThan(
      settingsSource.indexOf('class="settings-group settings-group-joystick"'),
    );
    expect(source).toContain("label: 'Ramp divisor'");
    expect(source).not.toContain("label: 'Precision divisor'");
  });

  it('uses bounded dropdowns for all numeric macro settings', async () => {
    const source = await readFile(new URL('./app.ts', import.meta.url), 'utf8');

    expect(source).toContain('<select data-setting="previewOutput">${integerOptions(1, 3, this.state.previewOutput)}</select>');
    expect(source).toContain('<select data-setting="panTiltRampSpeed">${integerOptions(1, 24, this.state.panTiltRampSpeed)}</select>');
    expect(source).toContain('<select data-setting="zoomRampSpeed">${integerOptions(1, 15, this.state.zoomRampSpeed)}</select>');
    expect(source).toContain('<select data-setting="slowModeDivisor">${integerOptions(1, 4, this.state.slowModeDivisor)}</select>');
    expect(source).not.toMatch(/<input[^>]+data-setting="(?:previewOutput|panTiltRampSpeed|zoomRampSpeed|slowModeDivisor)"/);
  });

  it('offers every supported Joystick Controls panel location', async () => {
    const [appSource, modelSource] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./model.ts', import.meta.url), 'utf8'),
    ]);

    expect(appSource).toContain('<select data-setting="panelLocation">');
    expect(appSource).toContain('PANEL_LOCATIONS.map');
    expect(modelSource).toContain("'HomeScreen'");
    expect(modelSource).toContain("'CallControls'");
    expect(modelSource).toContain("'HomeScreenAndCallControls'");
    expect(modelSource).toContain("'ControlPanel'");
  });

  it('starts every page load at Introduction and warns before discarding workflow progress', async () => {
    const source = await readFile(new URL('./workflow.ts', import.meta.url), 'utf8');

    expect(source).toContain('private step: WorkflowStep = 1;');
    expect(source).toContain("const initialHash = `#${WORKFLOW_STEPS[0].id}`;");
    expect(source).toContain("this.browserWindow.history.replaceState({ step: 1 }, '', initialHash);");
    expect(source).toContain("this.browserWindow.addEventListener('beforeunload'");
    expect(source).toContain('Refreshing restarts the installer from the Introduction page.');
  });

  it('caches only the device host and username for later page loads', async () => {
    const source = await readFile(new URL('./app.ts', import.meta.url), 'utf8');

    expect(source).toContain("const DEVICE_IDENTITY_STORAGE_KEY = 'joystick-configurator-device-identity';");
    expect(source).toContain('private credentials: DeviceCredentials = storedDeviceCredentials();');
    expect(source).toContain('host: this.credentials.host');
    expect(source).toContain('username: this.credentials.username');
    expect(source).toContain("password: ''");
    expect(source).toContain('The password and expected serial number are never cached.');
  });

  it('keeps grouped settings and button assignment fields in columns until the compact breakpoint', async () => {
    const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

    expect(styles).toContain('grid-template-columns: minmax(300px, 480px) minmax(420px, 1fr);');
    expect(styles).toContain('grid-template-columns: repeat(12, minmax(0, 1fr));');
    expect(styles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(styles).toContain('grid-template-columns: 34px minmax(72px, .6fr) minmax(128px, 1.1fr) minmax(112px, .9fr);');
    expect(styles).not.toContain('.button-assignment-page .map-layout');
    expect(styles).toContain('@media (max-width: 1199px)');
  });

  it('warns on every Preview-dependent button assignment when Preview display is Off', async () => {
    const [source, styles] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./styles.css', import.meta.url), 'utf8'),
    ]);

    expect(source).toContain("this.state.previewMode === 'Off' && isPreviewDependentAssignment(assignment)");
    expect(source).toContain('Preview display is Off');
    expect(source).toContain('This Control Preview action will be ignored while Preview Display mode is Off.');
    expect(source).not.toContain('The joystick will control the Main camera instead.');
    expect(source).toContain('This button action will be ignored.');
    expect(source).toContain('This warning appears because Preview display mode is set to Off in Macro Settings.');
    expect(source).toContain('aria-label="Why Button ${button.number} has a Preview warning"');
    expect(source).toContain('role="tooltip"');
    expect(styles).toContain('.assignment-row.preview-action-unavailable');
    expect(styles).toContain('.assignment-warning');
    expect(styles).toContain('.assignment-warning .field-info-trigger svg');
    expect(styles).toContain('background: var(--warning-bg-medium-default);');
    expect(styles).toContain('border-left: 4px solid var(--warning-border-default);');
  });

  it('keeps install versus update tied to the selected workflow and confirms connected updates against refreshed call status', async () => {
    const [source, deviceSource] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./device.ts', import.meta.url), 'utf8'),
    ]);

    expect(source).toContain('<h2>Download Macro</h2>');
    expect(source).toContain("const deviceAction = isUpdate ? 'Update Macro' : 'Install Macro';");
    expect(source).toContain('class="review-device-status');
    expect(source).toContain('class="review-install-result');
    expect(source).toContain('id="disconnect-device"');
    expect(source).not.toContain('private renderInstaller');
    expect(source).not.toContain('Installation plan');
    expect(source).toContain("private installationMode: InstallationMode = 'install';");
    expect(source).toContain("this.installationMode = 'update';");
    expect(source).toContain("if (actionAfterConnect === 'install') await this.installDevice();");
    expect(source).toContain('<h2>Download Operator Guide</h2>');
    expect(source).toContain('Download Operator Guide (PDF)');
    expect(source).toContain('<h2>Config object</h2>');
    expect(source).not.toContain('id="copy-config"');
    expect(source).toContain('id="install-confirm-dialog"');
    expect(source).toContain('Device is currently on a call');
    expect(source).toContain('await this.deviceSession.recheck()');
    expect(deviceSource).toContain('A call started after the confirmation prompt. Installation remains blocked.');
  });

  it('keeps live install and update progress visible in a modal through the final outcome', async () => {
    const [source, styles] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./styles.css', import.meta.url), 'utf8'),
    ]);

    expect(source).toContain('id="installation-progress-dialog"');
    expect(source).toContain('role="status" aria-live="polite"');
    expect(source).toContain('this.installationProgressOpen = true;');
    expect(source).toContain('this.recordInstallationProgress(message);');
    expect(source).toContain('data-close-installation-progress');
    expect(source).toContain('if (this.busy) event.preventDefault();');
    expect(styles).toContain('.installation-progress-status');
    expect(styles).toContain('@keyframes installation-progress-spin');
  });

  it('offers all three theme preferences and generates the configured PDF operator guide', async () => {
    const [appSource, manualSource] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./manual.ts', import.meta.url), 'utf8'),
    ]);

    expect(appSource).toContain('>System</option>');
    expect(appSource).toContain('>Light</option>');
    expect(appSource).toContain('>Dark</option>');
    expect(appSource).toContain('await generateConfiguredOperatorGuide(this.state)');
    expect(appSource).toContain('downloadBinary(guide.fileName, guide.bytes, guide.mimeType)');
    expect(manualSource).toContain('export async function generateConfiguredOperatorGuide(');
    expect(manualSource).toContain('joystickImageDataUrl');
    expect(manualSource).toContain('enablementImageDataUrl');
  });

  it('renders an accessible responsive Release selector and keeps the guide available for unknown sources', async () => {
    const [appSource, styles] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./styles.css', import.meta.url), 'utf8'),
    ]);

    expect(appSource).toContain('<label class="release-picker" for="base-macro-release">');
    expect(appSource.match(/<span>Choose Release<\/span>/g)).toHaveLength(2);
    expect(appSource).toContain('id="base-macro-release" ${this.busy ? \'disabled\' : \'\'}>');
    expect(appSource).not.toContain('<span>Base macro release</span>');
    expect(appSource).not.toContain('base-macro-release-help');
    expect(appSource).not.toContain('The selected base Release determines its exact dependency Release.');
    expect(appSource).toContain('Local Development · Macro Version');
    expect(appSource).toContain("isLocalDevelopmentHost(window.location?.hostname ?? '')");
    expect(appSource).toContain('Imported macro · Release unknown');
    expect(appSource).toContain('Migrate to latest release (${escapeHtml(catalog.latest)})');
    expect(appSource).toContain('const hasSupportedTarget = this.hasSupportedTarget();');
    expect(appSource).toContain('hasSupportedTarget && configurationIsValid');
    expect(appSource).toContain('id="download-operator-guide" type="button">');
    expect(styles).toMatch(/\.installer-introduction-heading \{[\s\S]*?justify-content: space-between;/);
    expect(styles).toMatch(/@media \(max-width: 720px\)[\s\S]*?\.installer-introduction-heading,[\s\S]*?flex-direction: column;/);
    expect(styles).toContain('border-color: var(--control-border-focus);');
  });

  it('uses only packaged dependency sources in the existing installation sequence', async () => {
    const [appSource, preparationSource] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('../scripts/prepare-assets.mjs', import.meta.url), 'utf8'),
    ]);

    expect(appSource).toContain('dependencies: this.sources.dependencies.map((dependency) => ({');
    expect(appSource).toContain('source: dependency.source,');
    expect(preparationSource).not.toContain('raw.githubusercontent.com');
    expect(preparationSource).not.toContain('/main/');
    expect(appSource).not.toContain('sourceUrl');
  });

  it('keeps About focused on current project details', async () => {
    const source = await readFile(new URL('./app.ts', import.meta.url), 'utf8');
    const aboutSource = source.slice(
      source.indexOf('private renderAboutModal()'),
      source.indexOf('private renderOutput()'),
    );

    expect(aboutSource).toContain("const macroVersion = this.catalog?.latest ?? 'Unavailable';");
    expect(aboutSource).toContain('<dt>Macro version</dt>');
    expect(aboutSource).toContain('<small>Latest published Release</small>');
    expect(aboutSource).toContain('<dt>Macro file</dt>');
    expect(aboutSource).toContain('<dt>Selected source</dt>');
    expect(aboutSource).toContain('<dt>Dependency Release</dt>');
    expect(aboutSource).toContain('<dt>Camera sources</dt>');
    expect(aboutSource).toContain('<p class="about-product-model">${JOYSTICK_MODEL}</p>');
    expect(aboutSource).toContain('Project repository');
    expect(aboutSource).not.toContain('BUILT_IN_ACTIONS');
    expect(aboutSource).not.toContain('this.state.cameras');
    expect(aboutSource).not.toContain('Thrustmaster documentation');
    expect(aboutSource).not.toContain('InputDevice class');
  });

  it('renders a current-year Cisco footer with the official Sample Code License link', async () => {
    const [source, styles] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./styles.css', import.meta.url), 'utf8'),
    ]);

    expect(source).toContain('const currentYear = new Date().getFullYear();');
    expect(source).toContain('Cisco Systems, Inc. <span aria-hidden="true">||</span> Created by the Collaboration TME team');
    expect(source).toContain("const CISCO_SAMPLE_CODE_LICENSE_URL = 'https://developer.cisco.com/docs/licenses/';");
    expect(source).toContain('>Cisco Sample Code License</a>');
    expect(styles).toContain('.site-footer');
    expect(styles).toContain('position: fixed;');
    expect(styles).toContain('bottom: var(--site-footer-height);');
    expect(styles).toContain('padding-bottom: var(--site-footer-height);');
    expect(styles).toContain('border-top: 1px solid var(--base-border-default);');
  });

  it('uses complete Magnetic dark tokens and inverse text tokens on the dark hero', async () => {
    const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

    expect(styles).toContain('--interact-border-weak-default: #656c75;');
    expect(styles).toContain('--overlay-bg-default: #000000bf;');
    expect(styles).toMatch(/\.hero-read-more a,[\s\S]*?color: var\(--inverse-text-default\);/);
    expect(styles).not.toMatch(/\.hero-read-more a,[^{]*\{[^}]*color: var\(--interact-bg-/s);
  });

  it('shows accessible configuration definitions from information icons', async () => {
    const [appSource, styles, readme] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./styles.css', import.meta.url), 'utf8'),
      readFile(new URL('../../README.md', import.meta.url), 'utf8'),
    ]);

    for (const key of [
      'projectName',
      'roomName',
      'handedness',
      'setDefaultCamera',
      'panelLocation',
      'previewMode',
      'previewOutput',
      'panTiltRampSpeed',
      'zoomRampSpeed',
      'slowModeDivisor',
      'cameraName',
      'videoConnectorId',
      'cameraControlId',
      'defaultCamera',
    ]) {
      expect(appSource).toContain(`renderConfigurationLabel('${key}'`);
    }

    expect(appSource).toContain("label: 'ZOOM Ramp Speed'");
    expect(appSource).toContain('class="field-info-trigger"');
    expect(appSource).toContain('role="tooltip"');
    expect(appSource).not.toContain('field-optional');
    expect(appSource).not.toContain('(optional)');
    expect(styles).not.toContain('.field-optional');
    expect(styles).toContain('.field-info:focus-within .field-tooltip');
    expect(styles).toContain('background: var(--inverse-bg-weak-default);');
    expect(readme).toContain('### Configuration reference');
    expect(readme).toContain('`config.joystick.Camera.SlowModeDivisor`');
  });

  it('presents read-only camera discovery beside manual camera configuration', async () => {
    const [source, styles] = await Promise.all([
      readFile(new URL('./app.ts', import.meta.url), 'utf8'),
      readFile(new URL('./styles.css', import.meta.url), 'utf8'),
    ]);

    expect(source).toContain('<h3>Configured cameras</h3>');
    expect(source).toContain('id="discovered-cameras-title">Discovered cameras</h3>');
    expect(source).toContain('id="discover-cameras"');
    expect(source).toContain('id="refresh-cameras"');
    expect(source).toContain('data-use-discovered-camera');
    expect(source).toContain('Disabled (USB/ThirdParty)');
    expect(source).toContain("type PendingDeviceAction = 'install' | 'fetch-macro' | 'discover-cameras'");
    expect(source).toContain("if (actionAfterConnect === 'discover-cameras') await this.discoverCameras(true);");
    expect(source).toContain('Four-camera limit reached');
    expect(source).toContain('class="discovered-camera-card discovered-camera-card-${source.connection}"');
    expect(source).toContain('class="discovered-camera-name"');
    expect(source).toContain('class="field-info discovered-camera-info"');
    expect(source).toContain('class="field-tooltip discovered-camera-tooltip"');
    expect(source).toContain('`ConnectorId: ${source.ConnectorId}`');
    expect(source).toContain("`ControlId: ${source.ControlId === null ? 'Disabled' : source.ControlId}`");
    expect(source).toContain("`Model: ${source.model ?? 'Model unavailable'}`");
    expect(source).toContain("const nextDisabled = currentStep === 2 && validateConfiguratorState(this.state).length > 0;");
    expect(styles).toContain('.camera-source-layout');
    expect(styles).toContain('.discovered-cameras-pane');
    expect(styles).toContain('.discovered-camera-card');
    expect(styles).toMatch(/\.discovered-camera-card \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto 20px;/s);
    expect(styles).toMatch(/\.discovered-camera-card-connected \{[^}]*border: 2px solid var\(--camera-connected-border\);/s);
    expect(styles).toMatch(/\.discovered-camera-card-disconnected \{[^}]*border: 2px dotted var\(--camera-disconnected-border\);/s);
    expect(styles).toMatch(/\.discovered-camera-card-unavailable \{[^}]*border: 2px dotted var\(--camera-unavailable-border\);/s);
    expect(styles).toMatch(/\.discovered-camera-name \{[^}]*white-space: nowrap;/s);
    expect(styles).toMatch(/\.configured-cameras-pane \.camera-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s);
    expect(styles).toMatch(/\.camera-fields \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s);
    expect(styles).toMatch(/\.camera-fields \.wide \{[^}]*grid-column: 1 \/ -1;/s);
  });

  it('allows camera-field tooltips to escape the camera card boundary', async () => {
    const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

    expect(styles).toMatch(/\.camera-card \{[^}]*overflow: visible;/s);
    expect(styles).toMatch(/\.camera-card::before \{[^}]*border-radius: 6px 6px 0 0;/s);
  });
});
