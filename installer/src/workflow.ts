export const WORKFLOW_STEPS = [
  { id: 'introduction', title: 'Introduction', description: 'Solution overview and hardware' },
  { id: 'macro-settings', title: 'Macro Settings', description: 'Room, behavior, and camera sources' },
  { id: 'button-assignments', title: 'Button Assignments', description: 'Joystick controls and action key' },
  { id: 'review-installation', title: 'Review and Installation', description: 'Review, download, or install' },
] as const;

export type WorkflowStep = 1 | 2 | 3 | 4;

export interface WorkflowNavigationHooks {
  onPopState(step: WorkflowStep): void;
  beforeUnload(): void;
}

/**
 * Owns workflow position, legacy hash translation, browser history, and the
 * refresh warning. Call initialize once, then use navigate for UI transitions.
 */
export interface WorkflowNavigation {
  readonly currentStep: WorkflowStep;
  initialize(hooks: WorkflowNavigationHooks): void;
  navigate(step: WorkflowStep, pushHistory?: boolean): boolean;
  markProgress(): void;
}

function workflowStepFromHash(hash: string): WorkflowStep {
  const index = WORKFLOW_STEPS.findIndex((step) => `#${step.id}` === hash);
  if (hash === '#configure' || hash === '#cameras' || hash === '#solution-settings' || hash === '#camera-sources') return 2;
  if (hash === '#button-map' || hash === '#manifest') return 3;
  if (hash === '#output' || hash === '#install') return 4;
  return (index >= 0 ? index + 1 : 1) as WorkflowStep;
}

class BrowserWorkflowNavigation implements WorkflowNavigation {
  private step: WorkflowStep = 1;
  private hasProgress = false;

  constructor(private readonly browserWindow: Window) {}

  get currentStep(): WorkflowStep {
    return this.step;
  }

  initialize(hooks: WorkflowNavigationHooks): void {
    const initialHash = `#${WORKFLOW_STEPS[0].id}`;
    this.browserWindow.history.replaceState({ step: 1 }, '', initialHash);
    this.browserWindow.addEventListener('popstate', () => {
      const step = workflowStepFromHash(this.browserWindow.location.hash);
      if (step === this.step) return;
      this.step = step;
      if (step > 1) this.hasProgress = true;
      hooks.onPopState(step);
    });
    this.browserWindow.addEventListener('beforeunload', (event) => {
      hooks.beforeUnload();
      if (!this.hasProgress) return;
      event.preventDefault();
      event.returnValue = 'Refreshing restarts the installer from the Introduction page.';
    });
  }

  navigate(step: WorkflowStep, pushHistory = true): boolean {
    if (step === this.step) return false;
    this.step = step;
    if (step > 1) this.hasProgress = true;
    if (pushHistory) {
      const hash = `#${WORKFLOW_STEPS[step - 1].id}`;
      this.browserWindow.history.pushState({ step }, '', hash);
    }
    return true;
  }

  markProgress(): void {
    this.hasProgress = true;
  }
}

export function createWorkflowNavigation(browserWindow: Window = window): WorkflowNavigation {
  return new BrowserWorkflowNavigation(browserWindow);
}
