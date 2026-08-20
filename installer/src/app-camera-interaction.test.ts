// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { ConfiguratorApp } from './app';
import type { DeviceInstallationSession } from './device';
import type { WorkflowNavigation } from './workflow';

function renderMacroSettings(): HTMLElement {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const deviceSession = {
    snapshot: () => ({ connected: false }),
  } as unknown as DeviceInstallationSession;
  const workflow = {
    currentStep: 2,
    initialize: vi.fn(),
    navigate: vi.fn(() => false),
    markProgress: vi.fn(),
  } satisfies WorkflowNavigation;
  const app = new ConfiguratorApp(root, deviceSession, workflow);

  (app as unknown as { render(): void }).render();
  return root;
}

describe('camera source interactions', () => {
  it.each([
    ['Name', 'Studio Camera'],
    ['ConnectorId', '8'],
  ] as const)('adds a camera on the first click after typing in %s', (field, value) => {
    const root = renderMacroSettings();
    const textInput = root.querySelector<HTMLInputElement>(`input[data-camera-field="${field}"]`)!;
    const addCamera = root.querySelector<HTMLButtonElement>('#add-camera')!;

    textInput.focus();
    textInput.value = value;
    textInput.dispatchEvent(new Event('input', { bubbles: true }));
    textInput.dispatchEvent(new Event('change', { bubbles: true }));

    // A physical click is cancelled if the input's change handler replaces the
    // button between pointer-down and click.
    if (addCamera.isConnected) addCamera.click();

    expect(root.querySelectorAll('.camera-card')).toHaveLength(2);
    expect(root.querySelector<HTMLInputElement>(`input[data-camera-field="${field}"]`)?.value)
      .toBe(value);
  });
});
