import {
  BUILT_IN_ACTIONS,
  PHYSICAL_BUTTONS,
  assignmentActionId,
  assignmentCameraId,
  builtInAssignment,
  cameraAssignment,
  cameraButtonActions,
  type ConfiguratorState,
  type PreviewDisplayMode,
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
  documentation: {
    ProjectName: string;
    RoomName: string;
  };
  previewDisplay: {
    mode: PreviewDisplayMode;
    output: number;
  };
  joystick: {
    StartingHand: 'right' | 'left';
    DefaultCameraAction: string;
    Camera: {
      BaseRampSpeed: number;
      SlowModeDivisor: number;
    };
  };
  controls: Record<number, string>;
  cameras: GeneratedCamera[];
}

export function validateConfiguratorState(state: ConfiguratorState): string[] {
  const errors: string[] = [];
  const actionIds = new Set(BUILT_IN_ACTIONS.map((action) => action.id));
  const cameraIds = new Set(state.cameras.map((camera) => camera.id));

  if (!state.projectName.trim()) {
    errors.push('Enter a project name.');
  }
  if (!state.roomName.trim()) {
    errors.push('Enter a room name.');
  }
  if (state.cameras.length < 1 || state.cameras.length > 4) {
    errors.push('Configure between one and four cameras.');
  }
  if (!cameraIds.has(state.defaultCameraId)) {
    errors.push('Choose a configured default camera.');
  }
  if (state.previewMode !== 'On' && state.previewMode !== 'Off') {
    errors.push('Preview display mode must be On or Off.');
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
    if (assignment === undefined) {
      errors.push(`Button ${button.number} must be listed, even when it has no action.`);
      continue;
    }
    const actionId = assignmentActionId(assignment);
    const cameraId = assignmentCameraId(assignment);
    if (actionId !== undefined && !actionIds.has(actionId)) {
      errors.push(`Button ${button.number} references unknown action ${actionId}.`);
    } else if (cameraId && !cameraIds.has(cameraId)) {
      errors.push(`Button ${button.number} references a camera that no longer exists.`);
    } else if (actionId === undefined && !cameraId) {
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
  const controls: Record<number, string> = {};

  for (const button of PHYSICAL_BUTTONS) {
    const assignment = state.assignments[button.number];
    const actionId = assignmentActionId(assignment);
    const cameraId = assignmentCameraId(assignment);
    const buttonAction = actionId ?? (cameraId ? cameraActions.get(cameraId) : undefined);
    if (buttonAction === undefined) throw new Error(`Unable to resolve ButtonAction for button ${button.number}.`);
    controls[button.number] = buttonAction;
  }

  const defaultCameraAction = cameraActions.get(state.defaultCameraId);
  if (!defaultCameraAction) throw new Error('Unable to resolve the default camera ButtonAction.');

  return {
    documentation: {
      ProjectName: state.projectName.trim(),
      RoomName: state.roomName.trim(),
    },
    previewDisplay: {
      mode: state.previewMode,
      output: state.previewOutput,
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
    /^(\s*)"([A-Za-z_$][A-Za-z0-9_$]*|\d+)":/gm,
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

class ObjectLiteralParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): unknown {
    const value = this.parseValue();
    this.skipSpaceAndComments();
    if (this.source[this.index] === ';') {
      this.index += 1;
      this.skipSpaceAndComments();
    }
    if (this.index !== this.source.length) {
      throw new Error('The configuration contains unsupported JavaScript after the config object.');
    }
    return value;
  }

  private parseValue(): unknown {
    this.skipSpaceAndComments();
    const character = this.source[this.index];
    if (character === '{') return this.parseObject();
    if (character === '[') return this.parseArray();
    if (character === '"' || character === "'") return this.parseString();
    if (character === '-' || /\d/.test(character ?? '')) return this.parseNumber();

    const identifier = this.parseIdentifier();
    if (identifier === 'true') return true;
    if (identifier === 'false') return false;
    if (identifier === 'null' || identifier === 'undefined') return undefined;
    throw new Error(`Unsupported configuration value "${identifier || character || 'end of file'}".`);
  }

  private parseObject(): Record<string, unknown> {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    this.expect('{');
    this.skipSpaceAndComments();
    while (this.source[this.index] !== '}') {
      if (this.index >= this.source.length) throw new Error('The configuration object is incomplete.');
      const character = this.source[this.index];
      const key = character === '"' || character === "'" ? this.parseString() : this.parseIdentifier(true);
      if (!key) throw new Error('The configuration contains an invalid object key.');
      this.skipSpaceAndComments();
      this.expect(':');
      result[key] = this.parseValue();
      this.skipSpaceAndComments();
      if (this.source[this.index] === ',') {
        this.index += 1;
        this.skipSpaceAndComments();
        if (this.source[this.index] === '}') break;
      } else if (this.source[this.index] !== '}') {
        throw new Error('The configuration object is missing a comma.');
      }
    }
    this.expect('}');
    return result;
  }

  private parseArray(): unknown[] {
    const result: unknown[] = [];
    this.expect('[');
    this.skipSpaceAndComments();
    while (this.source[this.index] !== ']') {
      if (this.index >= this.source.length) throw new Error('The configuration array is incomplete.');
      result.push(this.parseValue());
      this.skipSpaceAndComments();
      if (this.source[this.index] === ',') {
        this.index += 1;
        this.skipSpaceAndComments();
        if (this.source[this.index] === ']') break;
      } else if (this.source[this.index] !== ']') {
        throw new Error('The configuration array is missing a comma.');
      }
    }
    this.expect(']');
    return result;
  }

  private parseString(): string {
    const quote = this.source[this.index];
    this.index += 1;
    let result = '';
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      this.index += 1;
      if (character === quote) return result;
      if (character !== '\\') {
        result += character;
        continue;
      }
      if (this.index >= this.source.length) throw new Error('The configuration contains an incomplete string escape.');
      const escaped = this.source[this.index];
      this.index += 1;
      const simpleEscapes: Record<string, string> = {
        "'": "'",
        '"': '"',
        '\\': '\\',
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
        v: '\v',
        0: '\0',
      };
      if (escaped in simpleEscapes) {
        result += simpleEscapes[escaped];
      } else if (escaped === 'u') {
        result += this.parseCharacterEscape(4);
      } else if (escaped === 'x') {
        result += this.parseCharacterEscape(2);
      } else {
        result += escaped;
      }
    }
    throw new Error('The configuration contains an unterminated string.');
  }

  private parseCharacterEscape(length: number): string {
    const value = this.source.slice(this.index, this.index + length);
    if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(value)) {
      throw new Error('The configuration contains an invalid character escape.');
    }
    this.index += length;
    return String.fromCharCode(Number.parseInt(value, 16));
  }

  private parseNumber(): number {
    const match = this.source.slice(this.index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) throw new Error('The configuration contains an invalid number.');
    this.index += match[0].length;
    return Number(match[0]);
  }

  private parseIdentifier(allowNumber = false): string {
    const pattern = allowNumber ? /^[A-Za-z_$0-9][A-Za-z0-9_$]*/ : /^[A-Za-z_$][A-Za-z0-9_$]*/;
    const match = this.source.slice(this.index).match(pattern);
    if (!match) return '';
    this.index += match[0].length;
    return match[0];
  }

  private skipSpaceAndComments(): void {
    while (this.index < this.source.length) {
      const remaining = this.source.slice(this.index);
      const whitespace = remaining.match(/^\s+/);
      if (whitespace) {
        this.index += whitespace[0].length;
        continue;
      }
      if (remaining.startsWith('//')) {
        const newline = remaining.indexOf('\n');
        this.index += newline < 0 ? remaining.length : newline + 1;
        continue;
      }
      if (remaining.startsWith('/*')) {
        const end = remaining.indexOf('*/', 2);
        if (end < 0) throw new Error('The configuration contains an unterminated comment.');
        this.index += end + 2;
        continue;
      }
      break;
    }
  }

  private expect(character: string): void {
    this.skipSpaceAndComments();
    if (this.source[this.index] !== character) {
      throw new Error(`The configuration is missing "${character}".`);
    }
    this.index += 1;
  }
}

function configRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function configString(value: unknown, label: string): string {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${label} must be a string or number.`);
  }
  return String(value);
}

function configNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`);
  return number;
}

function extractConfigObjectSource(macroSource: string): string {
  const start = macroSource.indexOf(CONFIG_START);
  const end = macroSource.indexOf(CONFIG_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('This macro does not contain the supported joystick configuration markers.');
  }
  const block = macroSource.slice(start + CONFIG_START.length, end);
  const declaration = block.match(/\bconst\s+config\s*=/);
  if (!declaration || declaration.index === undefined) {
    throw new Error('The marked block does not contain a config object.');
  }
  return block.slice(declaration.index + declaration[0].length).trim();
}

export function parseConfiguratorStateFromMacro(macroSource: string): ConfiguratorState {
  const raw = configRecord(new ObjectLiteralParser(extractConfigObjectSource(macroSource)).parse(), 'config');
  const joystick = configRecord(raw.joystick, 'config.joystick');
  const cameraMotion = configRecord(joystick.Camera, 'config.joystick.Camera');
  const controls = configRecord(raw.controls, 'config.controls');
  if (!Array.isArray(raw.cameras)) throw new Error('config.cameras must be an array.');
  if (raw.cameras.length < 1 || raw.cameras.length > 4) {
    throw new Error('config.cameras must contain between one and four cameras.');
  }

  const cameraActionToId = new Map<string, string>();
  const cameras = raw.cameras.map((value, index) => {
    const camera = configRecord(value, `config.cameras[${index}]`);
    const id = `camera-${index + 1}`;
    const buttonAction = configString(camera.ButtonAction, `config.cameras[${index}].ButtonAction`);
    if (cameraActionToId.has(buttonAction)) throw new Error(`Camera ButtonAction "${buttonAction}" is duplicated.`);
    cameraActionToId.set(buttonAction, id);
    return {
      id,
      Name: configString(camera.Name, `config.cameras[${index}].Name`),
      ConnectorId: configString(camera.ConnectorId, `config.cameras[${index}].ConnectorId`),
      ControlId: configString(camera.ControlId, `config.cameras[${index}].ControlId`),
    };
  });

  const builtInIds = new Set(BUILT_IN_ACTIONS.map((action) => action.id));
  const assignments: Record<number, string> = {};
  for (const button of PHYSICAL_BUTTONS) {
    const value = controls[String(button.number)];
    const action = value == null ? '' : configString(value, `config.controls.${button.number}`);
    if (builtInIds.has(action)) {
      assignments[button.number] = builtInAssignment(action);
      continue;
    }
    const cameraId = cameraActionToId.get(action);
    if (!cameraId) throw new Error(`Button ${button.number} references unsupported ButtonAction "${action}".`);
    assignments[button.number] = cameraAssignment(cameraId);
  }

  const defaultCameraAction = configString(joystick.DefaultCameraAction, 'config.joystick.DefaultCameraAction');
  const defaultCameraId = cameraActionToId.get(defaultCameraAction);
  if (!defaultCameraId) throw new Error('DefaultCameraAction does not reference a configured camera.');
  const handedness = configString(joystick.StartingHand, 'config.joystick.StartingHand');
  if (handedness !== 'right' && handedness !== 'left') {
    throw new Error('StartingHand must be "right" or "left".');
  }

  const documentation = raw.documentation && typeof raw.documentation === 'object' && !Array.isArray(raw.documentation)
    ? raw.documentation as Record<string, unknown>
    : {};
  let previewMode: PreviewDisplayMode;
  let previewOutput: number;
  if (raw.previewDisplay !== undefined) {
    const previewDisplay = configRecord(raw.previewDisplay, 'config.previewDisplay');
    const parsedMode = configString(previewDisplay.mode, 'config.previewDisplay.mode');
    if (parsedMode !== 'On' && parsedMode !== 'Off') {
      throw new Error('config.previewDisplay.mode must be "On" or "Off".');
    }
    previewMode = parsedMode;
    previewOutput = configNumber(previewDisplay.output, 'config.previewDisplay.output');
  } else {
    const displays = configRecord(raw.displays, 'config.displays');
    previewMode = 'On';
    previewOutput = configNumber(displays.right, 'config.displays.right');
  }
  const state: ConfiguratorState = {
    projectName: typeof documentation.ProjectName === 'string' && documentation.ProjectName.trim()
      ? documentation.ProjectName
      : 'Joystick Camera Control',
    roomName: typeof documentation.RoomName === 'string' && documentation.RoomName.trim()
      ? documentation.RoomName
      : 'Room 1',
    handedness,
    previewMode,
    previewOutput,
    baseRampSpeed: configNumber(cameraMotion.BaseRampSpeed, 'config.joystick.Camera.BaseRampSpeed'),
    slowModeDivisor: configNumber(cameraMotion.SlowModeDivisor, 'config.joystick.Camera.SlowModeDivisor'),
    cameras,
    defaultCameraId,
    assignments,
  };

  const errors = validateConfiguratorState(state);
  if (errors.length) throw new Error(errors.join(' '));
  return state;
}
