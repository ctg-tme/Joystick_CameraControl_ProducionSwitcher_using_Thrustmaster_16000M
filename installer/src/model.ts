export type Handedness = 'right' | 'left';
export type PreviewDisplayMode = 'On' | 'Off';
export type ActionCategory = 'unused' | 'motion' | 'main' | 'preview' | 'selfview' | 'camera';

export interface BuiltInAction {
  id: string;
  label: string;
  description: string;
  category: ActionCategory;
}

export interface PhysicalButton {
  number: number;
  label: string;
  rightLogicalId: string;
  leftLogicalId: string;
  x: number;
  y: number;
}

export interface CameraDefinition {
  id: string;
  Name: string;
  ConnectorId: string;
  ControlId: string;
}

export interface ConfiguratorState {
  projectName: string;
  roomName: string;
  handedness: Handedness;
  previewMode: PreviewDisplayMode;
  previewOutput: number;
  panTiltRampSpeed: number;
  zoomRampSpeed: number;
  slowModeDivisor: number;
  cameras: CameraDefinition[];
  defaultCameraId: string;
  assignments: Record<number, string>;
}

export const BUILT_IN_ACTIONS: BuiltInAction[] = [
  {
    id: '',
    label: 'No action',
    description: 'Leaves this button blank so it performs no operator action.',
    category: 'unused',
  },
  {
    id: 'PrecisionMode',
    label: 'Precision mode',
    description: 'Reduces camera movement speed while the button is held.',
    category: 'motion',
  },
  {
    id: 'SwapMainPreview',
    label: 'Swap Main and Preview',
    description: 'Swaps the Main and Preview camera sources.',
    category: 'motion',
  },
  {
    id: 'ControlMain',
    label: 'Control Main',
    description: 'Assigns joystick movement to the camera currently on Main.',
    category: 'main',
  },
  {
    id: 'ControlPreview',
    label: 'Control Preview',
    description: 'Assigns joystick movement to the camera currently on Preview.',
    category: 'preview',
  },
  {
    id: 'SelfviewWindowed',
    label: 'Selfview windowed',
    description: 'Shows selfview as an inset on the first monitor.',
    category: 'selfview',
  },
  {
    id: 'SelfviewFullscreen',
    label: 'Selfview fullscreen',
    description: 'Shows fullscreen selfview on the first monitor.',
    category: 'selfview',
  },
  {
    id: 'SelfviewOff',
    label: 'Selfview off',
    description: 'Hides selfview.',
    category: 'selfview',
  },
];

export const PHYSICAL_BUTTONS: PhysicalButton[] = [
  { number: 1, label: 'Trigger', rightLogicalId: 'STICK_TRIGGER', leftLogicalId: 'STICK_TRIGGER', x: 40.5, y: 28.6 },
  { number: 2, label: 'Lower center stick button', rightLogicalId: 'STICK_SOUTH', leftLogicalId: 'STICK_SOUTH', x: 40.8, y: 53.2 },
  { number: 3, label: 'Left stick-side button', rightLogicalId: 'STICK_EAST', leftLogicalId: 'STICK_EAST', x: 29.1, y: 45.6 },
  { number: 4, label: 'Right stick-side button', rightLogicalId: 'STICK_WEST', leftLogicalId: 'STICK_WEST', x: 55, y: 45.6 },
  { number: 5, label: 'Left base top button', rightLogicalId: 'BASE_LEFT_1', leftLogicalId: 'BASE_RIGHT_3', x: 13.8, y: 44.7 },
  { number: 6, label: 'Left base upper middle button', rightLogicalId: 'BASE_LEFT_2', leftLogicalId: 'BASE_RIGHT_2', x: 17.2, y: 47.7 },
  { number: 7, label: 'Left base middle button', rightLogicalId: 'BASE_LEFT_3', leftLogicalId: 'BASE_RIGHT_1', x: 22.1, y: 51.7 },
  { number: 8, label: 'Left base lower button', rightLogicalId: 'BASE_LEFT_6', leftLogicalId: 'BASE_RIGHT_4', x: 21.4, y: 60.1 },
  { number: 9, label: 'Left base lower middle button', rightLogicalId: 'BASE_LEFT_5', leftLogicalId: 'BASE_RIGHT_5', x: 17.8, y: 57.4 },
  { number: 10, label: 'Left base inner button', rightLogicalId: 'BASE_LEFT_4', leftLogicalId: 'BASE_RIGHT_6', x: 13.4, y: 52.2 },
  { number: 11, label: 'Right base top button', rightLogicalId: 'BASE_RIGHT_3', leftLogicalId: 'BASE_LEFT_1', x: 72, y: 45.3 },
  { number: 12, label: 'Right base upper middle button', rightLogicalId: 'BASE_RIGHT_2', leftLogicalId: 'BASE_LEFT_2', x: 66, y: 47.4 },
  { number: 13, label: 'Right base inner top button', rightLogicalId: 'BASE_RIGHT_1', leftLogicalId: 'BASE_LEFT_3', x: 60.2, y: 51.4 },
  { number: 14, label: 'Right base inner lower button', rightLogicalId: 'BASE_RIGHT_4', leftLogicalId: 'BASE_LEFT_6', x: 61.1, y: 59.1 },
  { number: 15, label: 'Right base lower middle button', rightLogicalId: 'BASE_RIGHT_5', leftLogicalId: 'BASE_LEFT_5', x: 66.2, y: 55.6 },
  { number: 16, label: 'Right base lower button', rightLogicalId: 'BASE_RIGHT_6', leftLogicalId: 'BASE_LEFT_4', x: 70.2, y: 51.5 },
];

export function builtInAssignment(actionId: string): string {
  return `action:${actionId}`;
}

export function cameraAssignment(cameraId: string): string {
  return `camera:${cameraId}`;
}

export function assignmentCameraId(assignment: string): string | undefined {
  return assignment.startsWith('camera:') ? assignment.slice('camera:'.length) : undefined;
}

export function assignmentActionId(assignment: string): string | undefined {
  return assignment.startsWith('action:') ? assignment.slice('action:'.length) : undefined;
}

const PREVIEW_DEPENDENT_ACTION_IDS: ReadonlySet<string> = new Set([
  'SwapMainPreview',
  'ControlPreview',
]);

export function isPreviewDependentAssignment(assignment: string): boolean {
  const actionId = assignmentActionId(assignment);
  return actionId !== undefined && PREVIEW_DEPENDENT_ACTION_IDS.has(actionId);
}

export function logicalButtonId(button: PhysicalButton, handedness: Handedness): string {
  return handedness === 'left' ? button.leftLogicalId : button.rightLogicalId;
}

function pascalCase(value: string): string {
  const words = value.match(/[A-Za-z0-9]+/g) ?? [];
  const joined = words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`).join('');
  if (!joined) return 'Camera';
  return /^\d/.test(joined) ? `Camera${joined}` : joined;
}

export function cameraButtonActions(cameras: CameraDefinition[]): Map<string, string> {
  const counts = new Map<string, number>();
  const actions = new Map<string, string>();

  for (const camera of cameras) {
    const base = `Select${pascalCase(camera.Name)}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    actions.set(camera.id, count === 1 ? base : `${base}${count}`);
  }

  return actions;
}

export const DEFAULT_ASSIGNMENTS: Readonly<Record<number, string>> = {
  1: builtInAssignment('PrecisionMode'),
  2: builtInAssignment(''),
  3: builtInAssignment('SwapMainPreview'),
  4: builtInAssignment('SwapMainPreview'),
  5: builtInAssignment('ControlMain'),
  6: builtInAssignment('SelfviewWindowed'),
  7: builtInAssignment('SelfviewFullscreen'),
  8: builtInAssignment(''),
  9: builtInAssignment('SelfviewOff'),
  10: builtInAssignment('ControlPreview'),
  11: cameraAssignment('camera-2'),
  12: cameraAssignment('camera-1'),
  13: builtInAssignment(''),
  14: builtInAssignment(''),
  15: cameraAssignment('camera-3'),
  16: cameraAssignment('camera-4'),
};

export function createDefaultAssignments(): Record<number, string> {
  return { ...DEFAULT_ASSIGNMENTS };
}

export function createDefaultState(): ConfiguratorState {
  const cameras: CameraDefinition[] = [
    { id: 'camera-1', Name: 'Camera 1', ConnectorId: '1', ControlId: '1' },
  ];
  const assignments = createDefaultAssignments();

  for (const button of PHYSICAL_BUTTONS) {
    const cameraId = assignmentCameraId(assignments[button.number]);
    if (cameraId && !cameras.some((camera) => camera.id === cameraId)) {
      assignments[button.number] = builtInAssignment('');
    }
  }

  return {
    projectName: 'Joystick Camera Control',
    roomName: 'Room 1',
    handedness: 'right',
    previewMode: 'On',
    previewOutput: 2,
    panTiltRampSpeed: 12,
    zoomRampSpeed: 12,
    slowModeDivisor: 2,
    cameras,
    defaultCameraId: 'camera-1',
    assignments,
  };
}
