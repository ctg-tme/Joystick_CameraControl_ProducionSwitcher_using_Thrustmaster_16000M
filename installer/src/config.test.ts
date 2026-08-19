import { describe, expect, it } from 'vitest';
import {
  PROJECT_INSTALLER_URL,
  PROJECT_REPOSITORY_URL,
  buildMacroConfig,
  generateConfiguredMacro,
  parseConfiguratorStateFromMacro,
  validateConfiguratorState,
} from './config';
import {
  PHYSICAL_BUTTONS,
  builtInAssignment,
  cameraAssignment,
  createDefaultState,
  logicalButtonId,
} from './model';

describe('joystick configuration generation', () => {
  it('emits all 16 buttons and generated camera ButtonActions', () => {
    const state = createDefaultState();
    const config = buildMacroConfig(state);

    expect(Object.keys(config.controls)).toHaveLength(PHYSICAL_BUTTONS.length);
    expect(Object.keys(config.controls)).toEqual(
      PHYSICAL_BUTTONS.map((button) => logicalButtonId(button, state.handedness)),
    );
    expect(config.controls.STICK_SOUTH).toBe('');
    expect(config.controls.BASE_LEFT_6).toBe('');
    expect(config.controls.BASE_RIGHT_1).toBe('');
    expect(config.controls.BASE_RIGHT_4).toBe('');
    expect(config.controls.BASE_RIGHT_2).toBe('SelectCamera1');
    expect(config.cameras).toHaveLength(1);
    expect(config.cameras[0].ButtonAction).toBe('SelectCamera1');
    expect(config.joystick.SetDefaultCamera).toBe(true);
    expect(config.joystick.DefaultCameraAction).toBe('SelectCamera1');
    expect(config.joystick.Camera).toEqual({
      PanTiltRampSpeed: 12,
      ZoomRampSpeed: 12,
      SlowModeDivisor: 2,
    });
    expect(config.previewDisplay).toEqual({
      mode: 'On',
      output: 2,
    });
    expect(config.userInterface).toEqual({
      panelLocation: 'HomeScreenAndCallControls',
    });
    expect(config.documentation).toEqual({
      ProjectName: 'Joystick Camera Control',
      RoomName: 'Room 1',
      InstallerUrl: PROJECT_INSTALLER_URL,
      RepositoryUrl: PROJECT_REPOSITORY_URL,
    });
  });

  it('uses handedness-aware named IDs while keeping physical assignments unchanged', () => {
    const state = createDefaultState();
    state.handedness = 'left';
    const config = buildMacroConfig(state);

    expect(config.controls.BASE_RIGHT_3).toBe('ControlMain');
    expect(config.controls.BASE_LEFT_2).toBe('SelectCamera1');
  });

  it('allows built-in actions to be unused while cameras remain exactly once', () => {
    const state = createDefaultState();
    state.assignments[9] = builtInAssignment('');

    expect(validateConfiguratorState(state)).toEqual([]);
  });

  it('allows optional project and room names to be blank and preserves them on import', () => {
    const state = createDefaultState();
    state.projectName = '';
    state.roomName = '';
    const template = [
      '/* JOYSTICK_CONFIG_START */',
      'const config = {};',
      '/* JOYSTICK_CONFIG_END */',
    ].join('\n');

    expect(validateConfiguratorState(state)).toEqual([]);

    const recovered = parseConfiguratorStateFromMacro(generateConfiguredMacro(template, state));
    expect(recovered.projectName).toBe('');
    expect(recovered.roomName).toBe('');
  });

  it('rejects an unsupported Preview display mode', () => {
    const state = createDefaultState();
    state.previewMode = 'Standby' as typeof state.previewMode;

    expect(validateConfiguratorState(state)).toContain('Preview display mode must be On or Off.');
  });

  it('supports exactly the four RoomOS panel locations', () => {
    const state = createDefaultState();
    const locations = [
      'HomeScreen',
      'CallControls',
      'HomeScreenAndCallControls',
      'ControlPanel',
    ] as const;

    for (const panelLocation of locations) {
      state.panelLocation = panelLocation;
      expect(validateConfiguratorState(state)).toEqual([]);
      expect(buildMacroConfig(state).userInterface.panelLocation).toBe(panelLocation);
    }

    state.panelLocation = 'Everywhere' as typeof state.panelLocation;
    expect(validateConfiguratorState(state)).toContain(
      'Panel location must be one of: HomeScreen, CallControls, HomeScreenAndCallControls, ControlPanel.',
    );
  });

  it('validates the independent RoomOS pan/tilt and zoom speed ranges', () => {
    const state = createDefaultState();
    state.panTiltRampSpeed = 24;
    state.zoomRampSpeed = 15;

    expect(validateConfiguratorState(state)).toEqual([]);

    state.panTiltRampSpeed = 25;
    state.zoomRampSpeed = 16;
    expect(validateConfiguratorState(state)).toEqual(expect.arrayContaining([
      'Pan/tilt ramp speed must be between 1 and 24.',
      'Zoom ramp speed must be between 1 and 15.',
    ]));
  });

  it('limits Preview output and Precision divisor to the WebUI options', () => {
    const state = createDefaultState();
    state.previewOutput = 3;
    state.slowModeDivisor = 4;

    expect(validateConfiguratorState(state)).toEqual([]);

    state.previewOutput = 4;
    state.slowModeDivisor = 5;
    expect(validateConfiguratorState(state)).toEqual(expect.arrayContaining([
      'Preview output must be between 1 and 3.',
      'Precision divisor must be between 1 and 4.',
    ]));
  });

  it('rejects a camera that appears on more than one button', () => {
    const state = createDefaultState();
    state.assignments[13] = cameraAssignment('camera-1');

    expect(validateConfiguratorState(state)).toContain('Camera 1 must be assigned to exactly one button.');
  });

  it('replaces only the marked configuration block', () => {
    const state = createDefaultState();
    const template = [
      'before',
      '/* JOYSTICK_CONFIG_START */',
      'const config = { stale: true };',
      '/* JOYSTICK_CONFIG_END */',
      'after',
    ].join('\n');
    const generated = generateConfiguredMacro(template, state);

    expect(generated).toContain('DefaultCameraAction: "SelectCamera1"');
    expect(generated).not.toContain('stale: true');
    expect(generated.startsWith('before')).toBe(true);
    expect(generated.endsWith('after')).toBe(true);
  });

  it('recovers project, room, cameras, and controls from a generated macro without executing it', () => {
    const state = createDefaultState();
    state.projectName = 'Executive Briefing Controls';
    state.roomName = 'New York EBC';
    state.panelLocation = 'ControlPanel';
    state.previewMode = 'Off';
    state.setDefaultCamera = false;
    state.assignments[2] = builtInAssignment('SelfviewOff');
    const template = [
      'const unrelatedCode = () => "not evaluated";',
      '/* JOYSTICK_CONFIG_START */',
      'const config = {};',
      '/* JOYSTICK_CONFIG_END */',
    ].join('\n');

    const recovered = parseConfiguratorStateFromMacro(generateConfiguredMacro(template, state));

    expect(recovered.projectName).toBe('Executive Briefing Controls');
    expect(recovered.roomName).toBe('New York EBC');
    expect(recovered.panelLocation).toBe('ControlPanel');
    expect(recovered.previewMode).toBe('Off');
    expect(recovered.setDefaultCamera).toBe(false);
    expect(recovered.previewOutput).toBe(2);
    expect(recovered.panTiltRampSpeed).toBe(12);
    expect(recovered.zoomRampSpeed).toBe(12);
    expect(recovered.cameras.map((camera) => camera.Name)).toEqual(['Camera 1']);
    expect(recovered.assignments[2]).toBe(builtInAssignment('SelfviewOff'));
    expect(recovered.assignments[12]).toBe(cameraAssignment('camera-1'));
  });

  it('rejects a current named-control import with a missing logical ButtonId', () => {
    const template = [
      '/* JOYSTICK_CONFIG_START */',
      'const config = {};',
      '/* JOYSTICK_CONFIG_END */',
    ].join('\n');
    const source = generateConfiguredMacro(template, createDefaultState())
      .replace(/^\s*STICK_SOUTH: "",\n/m, '');

    expect(() => parseConfiguratorStateFromMacro(source)).toThrow(
      'config.controls is missing required ButtonIds: "STICK_SOUTH".',
    );
  });

  it('rejects an unknown logical ButtonId in a current named-control import', () => {
    const template = [
      '/* JOYSTICK_CONFIG_START */',
      'const config = {};',
      '/* JOYSTICK_CONFIG_END */',
    ].join('\n');
    const source = generateConfiguredMacro(template, createDefaultState())
      .replace('controls: {', 'controls: {\n    STICK_SOTUH: "",');

    expect(() => parseConfiguratorStateFromMacro(source)).toThrow(
      'config.controls contains unknown ButtonIds: "STICK_SOTUH".',
    );
  });

  it('accepts an explicitly present undefined value in a current named-control import', () => {
    const template = [
      '/* JOYSTICK_CONFIG_START */',
      'const config = {};',
      '/* JOYSTICK_CONFIG_END */',
    ].join('\n');
    const source = generateConfiguredMacro(template, createDefaultState())
      .replace('STICK_SOUTH: ""', 'STICK_SOUTH: undefined');

    const recovered = parseConfiguratorStateFromMacro(source);

    expect(recovered.assignments[2]).toBe(builtInAssignment(''));
  });

  it('recovers the legacy single-quoted config format and defaults missing print metadata', () => {
    const controls = PHYSICAL_BUTTONS.map((button) =>
      `${button.number}: ${button.number === 12 ? "'SelectLegacyCamera'" : 'undefined'}`
    ).join(',\n');
    const source = `
      /* JOYSTICK_CONFIG_START */
      const config = {
        // Existing macros did not include documentation metadata.
        displays: { right: 2 },
        joystick: {
          StartingHand: 'right',
          DefaultCameraAction: 'SelectLegacyCamera',
          Camera: { BaseRampSpeed: 12, SlowModeDivisor: 2 }
        },
        controls: { ${controls} },
        cameras: [{
          ButtonAction: 'SelectLegacyCamera',
          Name: 'Legacy Camera',
          ConnectorId: '1',
          ControlId: '1'
        }]
      };
      /* JOYSTICK_CONFIG_END */
    `;

    const recovered = parseConfiguratorStateFromMacro(source);

    expect(recovered.projectName).toBe('Joystick Camera Control');
    expect(recovered.roomName).toBe('Room 1');
    expect(recovered.panelLocation).toBe('HomeScreenAndCallControls');
    expect(recovered.setDefaultCamera).toBe(true);
    expect(recovered.previewMode).toBe('On');
    expect(recovered.previewOutput).toBe(2);
    expect(recovered.panTiltRampSpeed).toBe(12);
    expect(recovered.zoomRampSpeed).toBe(12);
    expect(recovered.cameras[0].Name).toBe('Legacy Camera');
    expect(recovered.assignments[12]).toBe(cameraAssignment('camera-1'));
    expect(recovered.assignments[2]).toBe(builtInAssignment(''));
  });

  it('rejects an unsupported panel location in an imported macro', () => {
    const template = [
      '/* JOYSTICK_CONFIG_START */',
      'const config = {};',
      '/* JOYSTICK_CONFIG_END */',
    ].join('\n');
    const source = generateConfiguredMacro(template, createDefaultState())
      .replace('panelLocation: "HomeScreenAndCallControls"', 'panelLocation: "Everywhere"');

    expect(() => parseConfiguratorStateFromMacro(source)).toThrow(
      'config.userInterface.panelLocation must be one of: HomeScreen, CallControls, HomeScreenAndCallControls, ControlPanel.',
    );
  });

  it('rejects a non-boolean SetDefaultCamera value in an imported macro', () => {
    const template = [
      '/* JOYSTICK_CONFIG_START */',
      'const config = {};',
      '/* JOYSTICK_CONFIG_END */',
    ].join('\n');
    const source = generateConfiguredMacro(template, createDefaultState())
      .replace('SetDefaultCamera: true', 'SetDefaultCamera: "yes"');

    expect(() => parseConfiguratorStateFromMacro(source)).toThrow(
      'config.joystick.SetDefaultCamera must be true or false.',
    );
  });

  it('rejects executable expressions in an imported configuration', () => {
    const source = [
      '/* JOYSTICK_CONFIG_START */',
      'const config = { displays: getDisplays() };',
      '/* JOYSTICK_CONFIG_END */',
    ].join('\n');

    expect(() => parseConfiguratorStateFromMacro(source)).toThrow(/Unsupported configuration value/);
  });
});
