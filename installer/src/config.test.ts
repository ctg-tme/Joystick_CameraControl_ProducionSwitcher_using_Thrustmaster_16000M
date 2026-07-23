import { describe, expect, it } from 'vitest';
import {
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
} from './model';

describe('joystick configuration generation', () => {
  it('emits all 16 buttons and generated camera ButtonActions', () => {
    const state = createDefaultState();
    const config = buildMacroConfig(state);

    expect(Object.keys(config.controls)).toHaveLength(PHYSICAL_BUTTONS.length);
    expect(Object.keys(config.controls)).toEqual(PHYSICAL_BUTTONS.map((button) => String(button.number)));
    expect(config.controls[2]).toBe('');
    expect(config.controls[8]).toBe('');
    expect(config.controls[13]).toBe('');
    expect(config.controls[14]).toBe('');
    expect(config.controls[12]).toBe('SelectCamera1');
    expect(config.cameras[0].ButtonAction).toBe('SelectCamera1');
    expect(config.joystick.DefaultCameraAction).toBe('SelectCamera1');
    expect(config.previewDisplay).toEqual({
      mode: 'On',
      output: 2,
    });
    expect(config.documentation).toEqual({
      ProjectName: 'Joystick Camera Control',
      RoomName: 'Room 1',
    });
  });

  it('keeps numbered physical assignments unchanged when handedness changes', () => {
    const state = createDefaultState();
    state.handedness = 'left';
    const config = buildMacroConfig(state);

    expect(config.controls[5]).toBe('ControlMain');
    expect(config.controls[11]).toBe('SelectCamera2');
  });

  it('allows built-in actions to be unused while cameras remain exactly once', () => {
    const state = createDefaultState();
    state.assignments[9] = builtInAssignment('');

    expect(validateConfiguratorState(state)).toEqual([]);
  });

  it('rejects an unsupported Preview display mode', () => {
    const state = createDefaultState();
    state.previewMode = 'Standby' as typeof state.previewMode;

    expect(validateConfiguratorState(state)).toContain('Preview display mode must be On or Off.');
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
    state.previewMode = 'Off';
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
    expect(recovered.previewMode).toBe('Off');
    expect(recovered.previewOutput).toBe(2);
    expect(recovered.cameras.map((camera) => camera.Name)).toEqual(['Camera 1', 'Camera 2', 'Camera 3', 'Camera 4']);
    expect(recovered.assignments[2]).toBe(builtInAssignment('SelfviewOff'));
    expect(recovered.assignments[12]).toBe(cameraAssignment('camera-1'));
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
    expect(recovered.previewMode).toBe('On');
    expect(recovered.previewOutput).toBe(2);
    expect(recovered.cameras[0].Name).toBe('Legacy Camera');
    expect(recovered.assignments[12]).toBe(cameraAssignment('camera-1'));
    expect(recovered.assignments[2]).toBe(builtInAssignment(''));
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
