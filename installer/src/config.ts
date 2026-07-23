import {
  BUILT_IN_ACTIONS,
  PHYSICAL_BUTTONS,
  assignmentActionId,
  assignmentCameraId,
  cameraButtonActions,
  logicalButtonId,
  type ConfiguratorState,
} from './model';

const CONFIG_START = '/* JOYSTICK_CONFIG_START */';
const CONFIG_END = '/* JOYSTICK_CONFIG_END */';

export interface GeneratedCamera {
  ButtonAction: string;
  Name: string;
  ConnectorId: string;
  ControlId: string;
}

export interface GeneratedMacroConfig {
  displays: {
    right: number;
  };
  joystick: {
    StartingHand: 'right' | 'left';
    DefaultCameraAction: string;
    Camera: {
      BaseRampSpeed: number;
      SlowModeDivisor: number;
    };
  };
  controls: Record<string, string>;
  cameras: GeneratedCamera[];
}

export function validateConfiguratorState(state: ConfiguratorState): string[] {
  const errors: string[] = [];
  const actionIds = new Set(BUILT_IN_ACTIONS.map((action) => action.id));
  const cameraIds = new Set(state.cameras.map((camera) => camera.id));

  if (state.cameras.length < 1 || state.cameras.length > 4) {
    errors.push('Configure between one and four cameras.');
  }
  if (!cameraIds.has(state.defaultCameraId)) {
    errors.push('Choose a configured default camera.');
  }
  if (!Number.isInteger(state.previewOutput) || state.previewOutput < 1) {
    errors.push('Preview output must be a positive whole number.');
  }
  if (!Number.isInteger(state.baseRampSpeed) || state.baseRampSpeed < 1 || state.baseRampSpeed > 15) {
    errors.push('Base ramp speed must be between 1 and 15.');
  }
  if (!Number.isFinite(state.slowModeDivisor) || state.slowModeDivisor <= 0) {
    errors.push('Precision divisor must be greater than zero.');
  }

  const cameraActions = cameraButtonActions(state.cameras);
  if (new Set(cameraActions.values()).size !== state.cameras.length) {
    errors.push('Camera ButtonAction values must be unique.');
  }

  for (const camera of state.cameras) {
    if (!camera.Name.trim()) errors.push('Every camera requires a name.');
    if (!camera.ConnectorId.trim()) errors.push(`${camera.Name || 'Camera'} requires a video ConnectorId.`);
    if (!camera.ControlId.trim()) errors.push(`${camera.Name || 'Camera'} requires a camera ControlId.`);
  }

  const cameraBindingCounts = new Map<string, number>();
  for (const button of PHYSICAL_BUTTONS) {
    const assignment = state.assignments[button.number];
    if (!assignment) {
      errors.push(`Button ${button.number} must be listed, even when it is Unassigned.`);
      continue;
    }
    const actionId = assignmentActionId(assignment);
    const cameraId = assignmentCameraId(assignment);
    if (actionId && !actionIds.has(actionId)) {
      errors.push(`Button ${button.number} references unknown action ${actionId}.`);
    } else if (cameraId && !cameraIds.has(cameraId)) {
      errors.push(`Button ${button.number} references a camera that no longer exists.`);
    } else if (!actionId && !cameraId) {
      errors.push(`Button ${button.number} has an invalid assignment.`);
    }
    if (cameraId) cameraBindingCounts.set(cameraId, (cameraBindingCounts.get(cameraId) ?? 0) + 1);
  }

  for (const camera of state.cameras) {
    const count = cameraBindingCounts.get(camera.id) ?? 0;
    if (count !== 1) errors.push(`${camera.Name || 'Camera'} must be assigned to exactly one button.`);
  }

  return [...new Set(errors)];
}

export function buildMacroConfig(state: ConfiguratorState): GeneratedMacroConfig {
  const errors = validateConfiguratorState(state);
  if (errors.length) throw new Error(errors.join(' '));

  const cameraActions = cameraButtonActions(state.cameras);
  const controls: Record<string, string> = {};

  for (const button of PHYSICAL_BUTTONS) {
    const assignment = state.assignments[button.number];
    const actionId = assignmentActionId(assignment);
    const cameraId = assignmentCameraId(assignment);
    const buttonAction = actionId ?? (cameraId ? cameraActions.get(cameraId) : undefined);
    if (!buttonAction) throw new Error(`Unable to resolve ButtonAction for button ${button.number}.`);
    controls[logicalButtonId(button, state.handedness)] = buttonAction;
  }

  const defaultCameraAction = cameraActions.get(state.defaultCameraId);
  if (!defaultCameraAction) throw new Error('Unable to resolve the default camera ButtonAction.');

  return {
    displays: {
      right: state.previewOutput,
    },
    joystick: {
      StartingHand: state.handedness,
      DefaultCameraAction: defaultCameraAction,
      Camera: {
        BaseRampSpeed: state.baseRampSpeed,
        SlowModeDivisor: state.slowModeDivisor,
      },
    },
    controls,
    cameras: state.cameras.map((camera) => ({
      ButtonAction: cameraActions.get(camera.id)!,
      Name: camera.Name.trim(),
      ConnectorId: camera.ConnectorId.trim(),
      ControlId: camera.ControlId.trim(),
    })),
  };
}

function javascriptObject(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /^(\s*)"([A-Za-z_$][A-Za-z0-9_$]*)":/gm,
    '$1$2:',
  );
}

export function generateConfigSource(state: ConfiguratorState): string {
  return `const config = ${javascriptObject(buildMacroConfig(state))};`;
}

export function generateConfiguredMacro(templateSource: string, state: ConfiguratorState): string {
  const start = templateSource.indexOf(CONFIG_START);
  const end = templateSource.indexOf(CONFIG_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('The macro template does not contain the required configuration markers.');
  }

  const replacement = `${CONFIG_START}\n${generateConfigSource(state)}\n${CONFIG_END}`;
  return `${templateSource.slice(0, start)}${replacement}${templateSource.slice(end + CONFIG_END.length)}`;
}
