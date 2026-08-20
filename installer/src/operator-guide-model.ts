import {
  BUILT_IN_ACTIONS,
  PHYSICAL_BUTTONS,
  assignmentActionId,
  assignmentCameraId,
  cameraAssignment,
  isPreviewDependentAssignment,
  type ActionCategory,
  type ConfiguratorState,
} from './model';

export interface OperatorGuideButton {
  number: number;
  physicalControl: string;
  action: string;
  category: ActionCategory;
  available: boolean;
}

export interface OperatorGuideCamera {
  name: string;
  buttonNumbers: number[];
  isDefault: boolean;
}

export interface OperatorGuideModel {
  projectName: string;
  roomName: string;
  handedness: 'Right-handed' | 'Left-handed';
  previewStatus: string;
  previewEnabled: boolean;
  buttons: OperatorGuideButton[];
  cameras: OperatorGuideCamera[];
  enablement: {
    heading: 'Enable Joystick Controls';
    imageDescription: string;
    steps: [string, string, string];
    trackingWarning: string;
    enableResult: string;
  };
  workflow: string[];
  motion: {
    pan: string;
    tilt: string;
    zoom: string;
    panTiltRampSpeed: number;
    zoomRampSpeed: number;
    precisionDivisor: number;
  };
}

function resolvedButtonAction(
  state: ConfiguratorState,
  assignment: string,
): Pick<OperatorGuideButton, 'action' | 'category' | 'available'> {
  const actionId = assignmentActionId(assignment);
  if (actionId !== undefined) {
    const action = BUILT_IN_ACTIONS.find((candidate) => candidate.id === actionId);
    if (!action) return { action: 'No action', category: 'unused', available: true };
    const available = state.previewMode === 'On' || !isPreviewDependentAssignment(assignment);
    return {
      action: available ? action.label : `${action.label} - unavailable`,
      category: action.category,
      available,
    };
  }

  const camera = state.cameras.find((candidate) => candidate.id === assignmentCameraId(assignment));
  if (camera) {
    return {
      action: camera.Name.trim() || 'Unnamed camera',
      category: 'camera',
      available: true,
    };
  }

  return { action: 'No action', category: 'unused', available: true };
}

function workflowFor(state: ConfiguratorState): string[] {
  if (state.previewMode === 'Off') {
    return [
      'Choose the Main target.',
      'Choose a camera.',
      'Frame with pan, tilt, and zoom.',
      'Hold Precision mode for fine movement.',
    ];
  }

  return [
    'Choose Main or Preview as the target.',
    'Choose a camera.',
    'Frame with pan, tilt, and zoom.',
    'Hold Precision mode for fine movement.',
    'Use Swap Main and Preview when ready.',
  ];
}

export function operatorGuideFileName(state: ConfiguratorState): string {
  const identity = [state.projectName, state.roomName]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('-') || 'Joystick-Camera-Control';
  const safeIdentity = identity
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'Joystick-Camera-Control';
  return `${safeIdentity}-Operator-Guide.pdf`;
}

/** Builds the operator-facing content independently from PDF placement. */
export function createOperatorGuideModel(state: ConfiguratorState): OperatorGuideModel {
  const projectName = state.projectName.trim() || 'Joystick Camera Control';
  const roomName = state.roomName.trim() || 'Room';
  const handedness = state.handedness === 'right' ? 'Right-handed' : 'Left-handed';
  const defaultCamera = state.cameras.find((camera) => camera.id === state.defaultCameraId);

  return {
    projectName,
    roomName,
    handedness,
    previewStatus: state.previewMode === 'On'
      ? `On - output ${state.previewOutput}`
      : 'Off - Preview and Swap unavailable',
    previewEnabled: state.previewMode === 'On',
    buttons: PHYSICAL_BUTTONS.map((button) => ({
      number: button.number,
      physicalControl: button.label,
      ...resolvedButtonAction(state, state.assignments[button.number]),
    })),
    cameras: state.cameras.map((camera) => ({
      name: camera.Name.trim() || 'Unnamed camera',
      buttonNumbers: PHYSICAL_BUTTONS
        .filter((button) => state.assignments[button.number] === cameraAssignment(camera.id))
        .map((button) => button.number),
      isDefault: camera.id === state.defaultCameraId,
    })),
    enablement: {
      heading: 'Enable Joystick Controls',
      imageDescription: 'Joystick Controls touch-panel screen focused on the Enabled control',
      steps: [
        'Open Joystick Controls.',
        'Select Enabled.',
        'Match the on-screen handedness to the switch under the joystick.',
      ],
      trackingWarning: 'Enabling manual control disables tracking modes. Disabling it does not automatically restore them.',
      enableResult: state.setDefaultCamera
        ? `Enabling selects ${defaultCamera?.Name.trim() || 'the default camera'} on Main.`
        : 'Enabling leaves the current Main camera unchanged.',
    },
    workflow: workflowFor(state),
    motion: {
      pan: 'Twist stick',
      tilt: 'Move stick forward / back',
      zoom: 'Move mini-stick forward / back',
      panTiltRampSpeed: state.panTiltRampSpeed,
      zoomRampSpeed: state.zoomRampSpeed,
      precisionDivisor: state.slowModeDivisor,
    },
  };
}
