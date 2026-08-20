import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { generateConfiguredOperatorGuide } from './manual';
import {
  PHYSICAL_BUTTONS,
  builtInAssignment,
  cameraAssignment,
  createDefaultState,
} from './model';
import { createOperatorGuideModel } from './operator-guide-model';

function configuredState() {
  const state = createDefaultState();
  state.projectName = 'Capitol Briefing Production';
  state.roomName = 'Orchid Executive Studio';
  state.handedness = 'left';
  state.setDefaultCamera = false;
  state.previewMode = 'Off';
  state.previewOutput = 3;
  state.panTiltRampSpeed = 19;
  state.zoomRampSpeed = 7;
  state.slowModeDivisor = 4;
  state.cameras = [
    { id: 'lectern', Name: 'Lectern Closeup', ConnectorId: '11', ControlId: '21' },
    { id: 'audience', Name: 'Audience Reverse', ConnectorId: '12', ControlId: '22' },
    { id: 'document', Name: 'Document Presenter', ConnectorId: '13', ControlId: '23' },
  ];
  state.defaultCameraId = 'audience';
  state.assignments = Object.fromEntries(
    PHYSICAL_BUTTONS.map((button) => [button.number, builtInAssignment('')]),
  );
  state.assignments[1] = builtInAssignment('PrecisionMode');
  state.assignments[2] = builtInAssignment('SelfviewOff');
  state.assignments[3] = builtInAssignment('ControlPreview');
  state.assignments[4] = builtInAssignment('ControlMain');
  state.assignments[5] = builtInAssignment('SwapMainPreview');
  state.assignments[6] = builtInAssignment('SelfviewWindowed');
  state.assignments[7] = builtInAssignment('SelfviewFullscreen');
  state.assignments[11] = cameraAssignment('lectern');
  state.assignments[12] = cameraAssignment('audience');
  state.assignments[15] = cameraAssignment('document');
  return state;
}

describe('configured operator guide model', () => {
  it('contains only the configured operator-facing content', () => {
    const model = createOperatorGuideModel(configuredState());

    expect(model.projectName).toBe('Capitol Briefing Production');
    expect(model.roomName).toBe('Orchid Executive Studio');
    expect(model.handedness).toBe('Left-handed');
    expect(model.buttons).toHaveLength(16);
    expect(model.buttons.map((button) => button.number)).toEqual(
      PHYSICAL_BUTTONS.map((button) => button.number),
    );
    expect(model.buttons.find((button) => button.number === 8)?.action).toBe('No action');
    expect(model.cameras.map((camera) => camera.name)).toEqual([
      'Lectern Closeup',
      'Audience Reverse',
      'Document Presenter',
    ]);
    expect(model.cameras.find((camera) => camera.name === 'Lectern Closeup')?.buttonNumbers).toEqual([11]);
    expect(model.enablement.steps).toEqual([
      'Open Joystick Controls.',
      'Select Enabled.',
      'Match the on-screen handedness to the switch under the joystick.',
    ]);
    expect(model.enablement.trackingWarning).toContain('disables tracking modes');
    expect(model.enablement.trackingWarning).toContain('does not automatically restore them');
    expect(model.motion.slider).toBe('Slider will not work.');
    expect(model.repositoryQrUrl).toBe('https://tinyurl.com/RoomOS-Joystick-TM16000');
    expect(JSON.stringify(model)).not.toMatch(/ConnectorId|ControlId|Logical ButtonId|ButtonAction/);
    expect(JSON.stringify(model)).not.toMatch(/Quad|RVPTZ|Desk Cam/);
  });

  it('removes Preview and Swap from the workflow when Preview is Off', () => {
    const model = createOperatorGuideModel(configuredState());

    expect(model.previewStatus).toBe('Off - Preview and Swap unavailable');
    expect(model.workflow).toEqual([
      'Choose the Main target.',
      'Choose a camera.',
      'Frame with pan, tilt, and zoom.',
      'Hold Precision mode for fine movement.',
    ]);
    expect(model.workflow.join(' ')).not.toMatch(/Preview|Swap/);
    expect(model.buttons.find((button) => button.number === 3)).toMatchObject({
      action: 'Control Preview - unavailable',
      available: false,
    });
    expect(model.buttons.find((button) => button.number === 5)).toMatchObject({
      action: 'Swap Main and Preview - unavailable',
      available: false,
    });
  });

  it('identifies video-only sources without exposing their ControlId', () => {
    const state = configuredState();
    state.cameras[0].ControlId = null;

    const model = createOperatorGuideModel(state);

    expect(model.cameras[0]).toMatchObject({
      name: 'Lectern Closeup',
      videoOnly: true,
      controlNote: 'Video only — joystick camera control unavailable',
    });
    expect(model.buttons.find((button) => button.number === 11)?.action).toBe(
      'Lectern Closeup — video only',
    );
    expect(JSON.stringify(model)).not.toContain('ControlId');
  });
});

describe('configured operator guide PDF', () => {
  it('returns real, one-page US Letter landscape PDF bytes', async () => {
    const guide = await generateConfiguredOperatorGuide(configuredState());
    const signature = new TextDecoder('latin1').decode(guide.bytes.slice(0, 8));
    const source = new TextDecoder('latin1').decode(guide.bytes);
    const document = await PDFDocument.load(guide.bytes);
    const [page] = document.getPages();

    expect(guide.fileName).toBe('Capitol-Briefing-Production-Orchid-Executive-Studio-Operator-Guide.pdf');
    expect(guide.fileName).toMatch(/\.pdf$/);
    expect(guide.mimeType).toBe('application/pdf');
    expect(signature).toMatch(/^%PDF-/);
    expect(source.toLowerCase()).not.toContain('<!doctype html');
    expect(source.toLowerCase()).not.toContain('<html');
    expect(document.getPageCount()).toBe(1);
    expect(page.getWidth()).toBe(792);
    expect(page.getHeight()).toBe(612);
    expect(source.match(/\/Subtype\s*\/Image/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('preserves the original enablement screenshot and embeds a handedness-neutral crop', async () => {
    const [original, crop, guide] = await Promise.all([
      readFile(new URL('./assets/joystick-controls-touch-panel.jpg', import.meta.url)),
      readFile(new URL('./assets/joystick-controls-enabled-crop.jpg', import.meta.url)),
      generateConfiguredOperatorGuide(configuredState()),
    ]);
    const source = new TextDecoder('latin1').decode(guide.bytes);

    expect(original.byteLength).toBe(178175);
    expect(crop.byteLength).toBeGreaterThan(10_000);
    expect(source.match(/\/Subtype\s*\/Image/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
