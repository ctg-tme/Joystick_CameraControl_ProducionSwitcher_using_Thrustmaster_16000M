import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const installerRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(installerRoot, '..');
const fixtureDirectory = resolve(projectRoot, 'tmp/pdfs/operator-guide-fixtures');
const representativePath = resolve(projectRoot, 'output/pdf/Joystick_CameraControl_User_Manual.pdf');

const server = await createServer({
  root: installerRoot,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
});

try {
  const [{ generateConfiguredOperatorGuide }, model] = await Promise.all([
    server.ssrLoadModule('/src/manual.ts'),
    server.ssrLoadModule('/src/model.ts'),
  ]);
  const { PHYSICAL_BUTTONS, builtInAssignment, cameraAssignment, createDefaultState } = model;

  function fourCameraState() {
    const state = createDefaultState();
    state.projectName = 'Executive Broadcast Center';
    state.roomName = 'Production Studio A';
    state.cameras = [
      { id: 'wide', Name: 'Room Wide', ConnectorId: '1', ControlId: '1' },
      { id: 'presenter', Name: 'Presenter Closeup', ConnectorId: '2', ControlId: '2' },
      { id: 'audience', Name: 'Audience Reverse', ConnectorId: '3', ControlId: '3' },
      { id: 'document', Name: 'Document Camera', ConnectorId: '4', ControlId: '4' },
    ];
    state.defaultCameraId = 'wide';
    state.assignments[12] = cameraAssignment('wide');
    state.assignments[11] = cameraAssignment('presenter');
    state.assignments[15] = cameraAssignment('audience');
    state.assignments[16] = cameraAssignment('document');
    return state;
  }

  function previewOffState() {
    const state = createDefaultState();
    state.projectName = 'Town Hall Camera Control';
    state.roomName = 'Council Chamber';
    state.handedness = 'left';
    state.previewMode = 'Off';
    state.setDefaultCamera = false;
    state.cameras = [{ id: 'council', Name: 'Council Wide', ConnectorId: '1', ControlId: '1' }];
    state.defaultCameraId = 'council';
    state.assignments = Object.fromEntries(
      PHYSICAL_BUTTONS.map((button) => [button.number, builtInAssignment('')]),
    );
    state.assignments[1] = builtInAssignment('PrecisionMode');
    state.assignments[3] = builtInAssignment('SwapMainPreview');
    state.assignments[5] = builtInAssignment('ControlMain');
    state.assignments[10] = builtInAssignment('ControlPreview');
    state.assignments[12] = cameraAssignment('council');
    return state;
  }

  function maximumNamesState() {
    const state = fourCameraState();
    state.projectName = 'International Executive Communications and Broadcast Operations Program'.repeat(2);
    state.roomName = 'North Campus Multipurpose Collaboration Auditorium and Production Control Room'.repeat(2);
    state.cameras = [
      { id: 'wide', Name: 'Ultra Wide Audience and Architectural Establishing Camera Position', ConnectorId: '1', ControlId: '1' },
      { id: 'presenter', Name: 'Primary Presenter Lectern Tight Shot Camera Position', ConnectorId: '2', ControlId: '2' },
      { id: 'audience', Name: 'Audience Question and Answer Reverse Camera Position', ConnectorId: '3', ControlId: '3' },
      { id: 'document', Name: 'Document Demonstration and Product Detail Camera Position', ConnectorId: '4', ControlId: '4' },
    ];
    return state;
  }

  const fixtures = [
    ['right-preview-on-four-cameras.pdf', fourCameraState()],
    ['left-preview-off-one-camera.pdf', previewOffState()],
    ['maximum-names-four-cameras.pdf', maximumNamesState()],
  ];

  await mkdir(fixtureDirectory, { recursive: true });
  await mkdir(resolve(projectRoot, 'output/pdf'), { recursive: true });
  for (const [fileName, state] of fixtures) {
    const guide = await generateConfiguredOperatorGuide(state);
    await writeFile(resolve(fixtureDirectory, fileName), guide.bytes);
    if (fileName === 'right-preview-on-four-cameras.pdf') {
      await writeFile(representativePath, guide.bytes);
    }
  }
} finally {
  await server.close();
}
