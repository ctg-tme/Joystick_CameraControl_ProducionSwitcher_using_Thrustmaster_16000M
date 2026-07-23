import { describe, expect, it } from 'vitest';
import { buildMacroConfig, generateConfiguredMacro, validateConfiguratorState } from './config';
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
    expect(config.controls[12]).toBe('SelectQuadCamera');
    expect(config.cameras[0].ButtonAction).toBe('SelectQuadCamera');
    expect(config.joystick.DefaultCameraAction).toBe('SelectQuadCamera');
  });

  it('keeps numbered physical assignments unchanged when handedness changes', () => {
    const state = createDefaultState();
    state.handedness = 'left';
    const config = buildMacroConfig(state);

    expect(config.controls[5]).toBe('ControlMain');
    expect(config.controls[11]).toBe('SelectRvptzLeft');
  });

  it('allows built-in actions to be unused while cameras remain exactly once', () => {
    const state = createDefaultState();
    state.assignments[9] = builtInAssignment('');

    expect(validateConfiguratorState(state)).toEqual([]);
  });

  it('rejects a camera that appears on more than one button', () => {
    const state = createDefaultState();
    state.assignments[13] = cameraAssignment('camera-1');

    expect(validateConfiguratorState(state)).toContain('Quad Camera must be assigned to exactly one button.');
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

    expect(generated).toContain('DefaultCameraAction: "SelectQuadCamera"');
    expect(generated).not.toContain('stale: true');
    expect(generated.startsWith('before')).toBe(true);
    expect(generated.endsWith('after')).toBe(true);
  });
});
