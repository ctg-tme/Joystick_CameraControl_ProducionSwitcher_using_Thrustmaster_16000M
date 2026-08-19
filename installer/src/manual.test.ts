import { describe, expect, it } from 'vitest';
import { generateConfiguredUserManual } from './manual';
import {
  PHYSICAL_BUTTONS,
  builtInAssignment,
  cameraAssignment,
  createDefaultState,
  logicalButtonId,
} from './model';

describe('configured user manual generation', () => {
  it('renders a self-contained manual from the current non-default room configuration', () => {
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

    const manual = generateConfiguredUserManual(state);

    expect(manual.fileName).toBe('Capitol-Briefing-Production-Orchid-Executive-Studio-User-Manual.html');
    expect(manual.html).toContain('Capitol Briefing Production');
    expect(manual.html).toContain('Orchid Executive Studio');
    expect(manual.html).toContain('Left-handed switch');
    expect(manual.html).toContain('Main on enable');
    expect(manual.html).toContain('Unchanged');
    expect(manual.html).toContain('Preview Display mode is Off');
    expect(manual.html).toContain('Preview output 3 remains configured but inactive');
    expect(manual.html).toContain('Control Preview, Swap Main and Preview, and camera selections made while Preview is the target are ignored');
    expect(manual.html).toContain('Lectern Closeup');
    expect(manual.html).toContain('SelectLecternCloseup');
    expect(manual.html).toContain('Audience Reverse');
    expect(manual.html).toContain('SelectAudienceReverse');
    expect(manual.html).toContain('Document Presenter');
    expect(manual.html).toContain('SelectDocumentPresenter');
    expect(manual.html).toContain('ConnectorId</dt><dd>11');
    expect(manual.html).toContain('ControlId</dt><dd>21');
    expect(manual.html).toContain('PAN/TILT 19; ZOOM 7');
    expect(manual.html).toContain('divide PAN/TILT and ZOOM speed by 4');
    expect(manual.html).toContain('data:image/png;base64,');

    for (const button of PHYSICAL_BUTTONS) {
      expect(manual.html).toContain(logicalButtonId(button, state.handedness));
      expect(manual.html).toContain(`>${button.number}</span>`);
    }

    expect(manual.html).not.toMatch(/Quad|RVPTZ|Desk Cam/);
    expect(manual.html).not.toMatch(/(?:src|href)=["']https?:/);
  });
});
