import { describe, expect, it, vi } from 'vitest';
import { createWorkflowNavigation } from './workflow';

describe('workflow navigation', () => {
  it('owns initial history, legacy hash translation, progress, and refresh warning', () => {
    const listeners = new Map<string, EventListener>();
    const location = { hash: '#install' };
    const replaceState = vi.fn((_state: unknown, _unused: string, url?: string | URL | null) => {
      location.hash = String(url ?? '');
    });
    const pushState = vi.fn((_state: unknown, _unused: string, url?: string | URL | null) => {
      location.hash = String(url ?? '');
    });
    const browserWindow = {
      location,
      history: { replaceState, pushState },
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') listeners.set(type, listener);
      },
    } as unknown as Window;
    const onPopState = vi.fn();
    const beforeUnload = vi.fn();
    const navigation = createWorkflowNavigation(browserWindow);

    navigation.initialize({ onPopState, beforeUnload });

    expect(navigation.currentStep).toBe(1);
    expect(replaceState).toHaveBeenCalledWith({ step: 1 }, '', '#introduction');
    expect(navigation.navigate(3)).toBe(true);
    expect(navigation.currentStep).toBe(3);
    expect(pushState).toHaveBeenCalledWith({ step: 3 }, '', '#button-assignments');

    location.hash = '#install';
    listeners.get('popstate')?.(new Event('popstate'));
    expect(navigation.currentStep).toBe(4);
    expect(onPopState).toHaveBeenCalledWith(4);

    const unload = { preventDefault: vi.fn(), returnValue: '' } as unknown as BeforeUnloadEvent;
    listeners.get('beforeunload')?.(unload);
    expect(beforeUnload).toHaveBeenCalledOnce();
    expect(unload.preventDefault).toHaveBeenCalledOnce();
    expect(unload.returnValue).toContain('Refreshing restarts');
  });
});
