import { describe, expect, it } from 'vitest';
import {
  builtInAssignment,
  cameraAssignment,
  isPreviewDependentAssignment,
} from './model';

describe('Preview-dependent button assignments', () => {
  it.each(['SwapMainPreview', 'ControlPreview'])('marks %s as Preview-dependent', (actionId) => {
    expect(isPreviewDependentAssignment(builtInAssignment(actionId))).toBe(true);
  });

  it.each(['', 'PrecisionMode', 'ControlMain', 'SelfviewWindowed', 'SelfviewFullscreen', 'SelfviewOff'])(
    'does not mark %s as Preview-dependent',
    (actionId) => {
      expect(isPreviewDependentAssignment(builtInAssignment(actionId))).toBe(false);
    },
  );

  it('does not mark camera selection as Preview-dependent', () => {
    expect(isPreviewDependentAssignment(cameraAssignment('camera-1'))).toBe(false);
  });
});
