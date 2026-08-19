import joystickImageDataUrl from './assets/thrustmaster-t16000m.png?inline';
import {
  BUILT_IN_ACTIONS,
  PHYSICAL_BUTTONS,
  assignmentActionId,
  assignmentCameraId,
  builtInAssignment,
  cameraAssignment,
  cameraButtonActions,
  logicalButtonId,
  type ActionCategory,
  type ConfiguratorState,
} from './model';

export interface ConfiguredUserManual {
  fileName: string;
  html: string;
}

interface AssignmentDetails {
  label: string;
  description: string;
  category: ActionCategory;
  buttonAction: string;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function assignmentDetails(state: ConfiguratorState, assignment: string): AssignmentDetails {
  const actionId = assignmentActionId(assignment);
  if (actionId !== undefined) {
    const action = BUILT_IN_ACTIONS.find((candidate) => candidate.id === actionId);
    if (action) {
      return {
        label: action.label,
        description: action.description,
        category: action.category,
        buttonAction: action.id || "''",
      };
    }
  }

  const camera = state.cameras.find((candidate) => candidate.id === assignmentCameraId(assignment));
  if (camera) {
    return {
      label: camera.Name || 'Unnamed camera',
      description: `Selects ${camera.Name || 'this camera'} for the active Main or Preview target.`,
      category: 'camera',
      buttonAction: cameraButtonActions(state.cameras).get(camera.id) ?? 'SelectCamera',
    };
  }

  return {
    label: 'Invalid assignment',
    description: 'This assignment could not be resolved.',
    category: 'unused',
    buttonAction: 'Invalid',
  };
}

function assignedButtonNumbers(state: ConfiguratorState, actionId: string): number[] {
  const assignment = builtInAssignment(actionId);
  return PHYSICAL_BUTTONS
    .filter((button) => state.assignments[button.number] === assignment)
    .map((button) => button.number);
}

function buttonBadges(numbers: number[], category: ActionCategory): string {
  if (!numbers.length) return '<span class="badge unused">Not assigned</span>';
  return numbers.map((number) => `<span class="badge ${category}">${number}</span>`).join(' ');
}

function buttonChips(numbers: number[], category: ActionCategory): string {
  if (!numbers.length) return '<span class="chip unused">Not assigned</span>';
  return numbers.map((number) => `<span class="chip ${category}">${number}</span>`).join('');
}

function manualFileName(state: ConfiguratorState): string {
  const identity = [state.projectName, state.roomName]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('-') || 'Joystick-Camera-Control';
  const safeIdentity = identity
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'Joystick-Camera-Control';
  return `${safeIdentity}-User-Manual.html`;
}

function renderDiagram(
  state: ConfiguratorState,
  imageSource: string,
  interactive = false,
  showAxisBadges = false,
): string {
  return `<div class="diagram" aria-label="Configured Thrustmaster T.16000M button diagram">
    <img src="${imageSource}" alt="Thrustmaster T.16000M physical button and axis reference">
    ${PHYSICAL_BUTTONS.map((button) => {
      const details = assignmentDetails(state, state.assignments[button.number]);
      const tag = interactive ? 'button' : 'span';
      const attributes = interactive
        ? `type="button" data-focus-button="${button.number}"`
        : '';
      return `<${tag} class="pin ${details.category}" ${attributes} style="left:${button.x}%;top:${button.y}%;" title="Button ${button.number}: ${escapeHtml(details.label)}">${button.number}</${tag}>`;
    }).join('')}
    ${showAxisBadges ? '<span class="axis-badge tilt">Tilt</span><span class="axis-badge pan">Pan</span><span class="axis-badge zoom">Zoom</span>' : ''}
  </div>`;
}

function renderActionMapping(
  state: ConfiguratorState,
  actionId: string,
  label: string,
  category: ActionCategory,
  extra = '',
): string {
  return `<article><h3>${escapeHtml(label)}</h3><div>${buttonBadges(assignedButtonNumbers(state, actionId), category)}</div>${extra ? `<p>${escapeHtml(extra)}</p>` : ''}</article>`;
}

function previewGuidance(state: ConfiguratorState): string {
  if (state.previewMode === 'Off') {
    return `Preview Display mode is Off. Preview output ${state.previewOutput} remains configured but inactive. Control Preview, Swap Main and Preview, and camera selections made while Preview is the target are ignored until Preview Display mode is On.`;
  }
  return `Preview Display mode is On and uses video output ${state.previewOutput}. Choose Control Preview, select and frame the next camera, then use Swap Main and Preview to take it live.`;
}

function printQuickOperation(state: ConfiguratorState): string {
  if (state.previewMode === 'Off') {
    return '<strong>1.</strong> Choose Main; Preview controls and swaps are ignored while Preview is Off. <strong>2.</strong> Choose a camera. <strong>3.</strong> Tilt with stick pitch, pan with twist, and zoom with mini-stick pitch. <strong>4.</strong> Use Precision mode for fine framing.';
  }
  return '<strong>1.</strong> Choose Main or Preview. <strong>2.</strong> Choose a camera. <strong>3.</strong> Tilt with stick pitch, pan with twist, and zoom with mini-stick pitch. <strong>4.</strong> Frame Preview, then swap it live; joystick control follows that camera into its Live role.';
}

/**
 * Generates the complete configured room handoff manual. The returned HTML has
 * no network, stylesheet, font, script, or image dependencies.
 */
export function generateConfiguredUserManual(state: ConfiguratorState): ConfiguredUserManual {
  const cameraActions = cameraButtonActions(state.cameras);
  const projectName = state.projectName.trim() || 'Joystick Camera Control';
  const roomName = state.roomName.trim() || 'Room';
  const previewText = previewGuidance(state);
  const previewUnavailable = state.previewMode === 'Off'
    ? 'Ignored while Preview Display mode is Off.'
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(projectName)} · ${escapeHtml(roomName)} · User Manual</title>
  <style>
    :root { --ink:#17212b; --muted:#586776; --line:#d7dee5; --paper:#f4f6f8; --panel:#fff; --main:#2563eb; --preview:#0f766e; --camera:#2f7d32; --motion:#6f3cc3; --selfview:#a96207; --unused:#6b7785; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { width:min(1180px,calc(100vw - 32px)); margin:0 auto; padding:32px 0 48px; }
    h1,h2,h3,p { margin-top:0; } h1 { font-size:clamp(30px,5vw,48px); line-height:1.05; margin-bottom:10px; } h2 { font-size:22px; margin-bottom:14px; } h3 { font-size:15px; margin-bottom:8px; }
    .eyebrow { display:block; color:#335e87; font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; margin-bottom:8px; }
    .lede { color:var(--muted); font-size:17px; max-width:850px; }
    .summary,.layout,.mapping-grid { display:grid; gap:16px; } .summary { grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); margin:24px 0; } .summary div,.panel,.mapping-grid article { background:var(--panel); border:1px solid var(--line); border-radius:9px; }
    .summary div { padding:14px; } .summary dt { color:var(--muted); font-size:12px; text-transform:uppercase; } .summary dd { margin:3px 0 0; font-weight:750; }
    .callout { padding:16px 18px; border-left:5px solid ${state.previewMode === 'Off' ? '#b7791f' : 'var(--preview)'}; background:#fff; margin-bottom:22px; }
    .layout { grid-template-columns:minmax(330px,440px) minmax(0,1fr); align-items:start; } .panel { padding:18px; margin-bottom:18px; overflow:hidden; }
    .diagram { position:relative; width:100%; aspect-ratio:440/556; background:#fff; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    .diagram img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
    .pin { position:absolute; width:27px; height:27px; transform:translate(-50%,-50%); border-radius:99px; color:#fff; font-weight:800; font-size:13px; line-height:23px; text-align:center; border:2px solid #fff; box-shadow:0 0 0 2px var(--ink),0 5px 12px #0004; z-index:2; }
    .main { background:var(--main); } .preview { background:var(--preview); } .camera { background:var(--camera); } .motion { background:var(--motion); } .selfview { background:var(--selfview); } .unused { background:var(--unused); }
    .mapping-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .mapping-grid article { padding:13px; } .mapping-grid article p { color:var(--muted); font-size:13px; margin:8px 0 0; }
    .badge { display:inline-grid; min-width:28px; min-height:28px; place-items:center; padding:3px 8px; border-radius:99px; color:#fff; font-weight:800; font-size:12px; } .badge.unused { min-width:auto; }
    table { width:100%; border-collapse:collapse; font-size:13px; } th,td { padding:9px 8px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; } th { color:var(--muted); font-size:11px; text-transform:uppercase; } code { display:block; color:#44515e; font-size:11px; overflow-wrap:anywhere; margin-top:3px; }
    .camera-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; } .camera-card { border:1px solid var(--line); border-radius:8px; padding:13px; } .camera-card dl { margin:8px 0 0; } .camera-card div { display:flex; justify-content:space-between; gap:12px; padding:3px 0; } .camera-card dt { color:var(--muted); } .camera-card dd { margin:0; font-weight:700; text-align:right; }
    .footnote { color:var(--muted); font-size:12px; text-align:center; margin-top:24px; }
    @media (max-width:850px) { .summary { grid-template-columns:repeat(2,1fr); } .layout { grid-template-columns:1fr; } }
    @media print { body { background:#fff; } main { width:auto; padding:0; } .panel,.summary div,.mapping-grid article { box-shadow:none; break-inside:avoid; } .layout { grid-template-columns:38% 62%; } }
  </style>
</head>
<body>
<main>
  <header>
    <span class="eyebrow">Configured operator manual</span>
    <h1>${escapeHtml(projectName)}</h1>
    <p class="lede"><strong>${escapeHtml(roomName)}</strong> · Thrustmaster T.16000M camera control and production switching</p>
  </header>
  <dl class="summary">
    <div><dt>Room</dt><dd>${escapeHtml(roomName)}</dd></div>
    <div><dt>Handedness</dt><dd>${state.handedness === 'right' ? 'Right-handed' : 'Left-handed'} switch</dd></div>
    <div><dt>Main on enable</dt><dd>${state.setDefaultCamera ? 'Default camera' : 'Unchanged'}</dd></div>
    <div><dt>Preview mode</dt><dd>${escapeHtml(state.previewMode)}</dd></div>
    <div><dt>Preview output</dt><dd>${state.previewOutput}${state.previewMode === 'Off' ? ' (inactive)' : ''}</dd></div>
  </dl>
  <div class="callout"><strong>${state.previewMode === 'Off' ? 'Preview is disabled' : 'Preview workflow'}</strong><p>${escapeHtml(previewText)}</p></div>
  <div class="layout">
    <aside>
      <section class="panel"><h2>Physical control map</h2>${renderDiagram(state, joystickImageDataUrl)}</section>
      <section class="panel"><h2>Action mappings</h2><div class="mapping-grid">
        ${renderActionMapping(state, 'ControlMain', 'Control Main', 'main')}
        ${renderActionMapping(state, 'ControlPreview', 'Control Preview', 'preview', previewUnavailable)}
        ${renderActionMapping(state, 'PrecisionMode', 'Precision mode', 'motion')}
        ${renderActionMapping(state, 'SwapMainPreview', 'Swap Main / Preview', 'motion', previewUnavailable)}
        ${renderActionMapping(state, 'SelfviewWindowed', 'Selfview windowed', 'selfview')}
        ${renderActionMapping(state, 'SelfviewFullscreen', 'Selfview fullscreen', 'selfview')}
        ${renderActionMapping(state, 'SelfviewOff', 'Selfview off', 'selfview')}
      </div></section>
    </aside>
    <div>
      <section class="panel"><h2>All 16 button assignments</h2>
        <table><thead><tr><th>#</th><th>Physical control</th><th>Logical ButtonId</th><th>ButtonAction</th><th>Operator result</th></tr></thead><tbody>
          ${PHYSICAL_BUTTONS.map((button) => {
            const details = assignmentDetails(state, state.assignments[button.number]);
            return `<tr><td><span class="badge ${details.category}">${button.number}</span></td><td>${escapeHtml(button.label)}</td><td><code>${escapeHtml(logicalButtonId(button, state.handedness))}</code></td><td><strong>${escapeHtml(details.label)}</strong><code>${escapeHtml(details.buttonAction)}</code></td><td>${escapeHtml(details.description)}</td></tr>`;
          }).join('')}
        </tbody></table>
      </section>
      <section class="panel"><h2>Camera-selection mappings</h2><div class="camera-cards">
        ${state.cameras.map((camera) => {
          const buttons = PHYSICAL_BUTTONS.filter((button) => state.assignments[button.number] === cameraAssignment(camera.id)).map((button) => button.number);
          return `<article class="camera-card"><h3>${escapeHtml(camera.Name || 'Unnamed camera')}${camera.id === state.defaultCameraId ? ' · Default' : ''}</h3><div>${buttonBadges(buttons, 'camera')}</div><dl>
            <div><dt>ButtonAction</dt><dd>${escapeHtml(cameraActions.get(camera.id) ?? '')}</dd></div>
            <div><dt>ConnectorId</dt><dd>${escapeHtml(camera.ConnectorId)}</dd></div>
            <div><dt>ControlId</dt><dd>${escapeHtml(camera.ControlId)}</dd></div>
          </dl></article>`;
        }).join('')}
      </div></section>
      <section class="panel"><h2>Camera motion</h2><p>Stick pitch controls tilt, stick twist controls pan, and mini-stick pitch controls zoom. Hold a configured Precision mode button to divide PAN/TILT and ZOOM speed by ${state.slowModeDivisor}. Configured ramp speeds: PAN/TILT ${state.panTiltRampSpeed}; ZOOM ${state.zoomRampSpeed}.</p></section>
    </div>
  </div>
  <p class="footnote">Generated for ${escapeHtml(projectName)} · ${escapeHtml(roomName)}. This file is self-contained and may be retained with the room documentation.</p>
</main>
</body>
</html>`;

  return { fileName: manualFileName(state), html };
}

/**
 * Renders the installer's existing browser print sheet from the same configured
 * documentation model as the downloaded manual.
 */
export function renderConfiguredPrintSheet(state: ConfiguratorState): string {
  const cameraActions = cameraButtonActions(state.cameras);
  const targetActions = [
    ['ControlMain', 'Control Main'],
    ['ControlPreview', 'Control Preview'],
    ['SwapMainPreview', 'Swap Main/Preview'],
    ['PrecisionMode', 'Precision mode'],
  ] as const;
  return `
    <section class="print-sheet print-only">
      <header class="print-header">
        <div><span>Project</span><h1 data-project-name-output>${escapeHtml(state.projectName || 'Joystick Camera Control')}</h1></div>
        <div class="print-room"><span>Room</span><strong data-room-name-output>${escapeHtml(state.roomName || 'Room')}</strong><small>${state.handedness === 'right' ? 'Right' : 'Left'}-handed switch · ${state.previewMode === 'On' ? `Preview output ${state.previewOutput}` : 'Preview display off'}</small></div>
      </header>
      <div class="print-layout">
        <aside>
          <div class="print-section-title"><span>01</span><h2>Joystick map</h2></div>
          ${renderDiagram(state, './assets/thrustmaster-t16000m.png', false, true)}
          <div class="legend">
            ${[
              ['main', 'Main'], ['preview', 'Preview'], ['camera', 'Camera'],
              ['motion', 'Motion / swap'], ['selfview', 'Selfview'], ['unused', 'No action'],
            ].map(([category, label]) => `<span><i class="${category}"></i>${label}</span>`).join('')}
          </div>
          <div class="print-quick-use"><h3>Quick operation</h3><p>${printQuickOperation(state)}</p><div class="print-action-chips">
            ${targetActions.map(([id, label]) => {
              const details = assignmentDetails(state, builtInAssignment(id));
              return `<span><strong>${escapeHtml(label)}</strong>${buttonChips(assignedButtonNumbers(state, id), details.category)}</span>`;
            }).join('')}
          </div></div>
        </aside>
        <div class="print-reference">
          <div class="print-section-title"><span>02</span><h2>Button reference</h2></div>
          <table class="print-button-table"><thead><tr><th>#</th><th>Physical control</th><th>Action</th><th>Operator result</th></tr></thead><tbody>
            ${PHYSICAL_BUTTONS.map((button) => {
              const details = assignmentDetails(state, state.assignments[button.number]);
              return `<tr><td><span class="chip ${details.category}">${button.number}</span></td><td><strong>${escapeHtml(button.label)}</strong><code>${escapeHtml(logicalButtonId(button, state.handedness))}</code></td><td><strong>${escapeHtml(details.label)}</strong><code>${escapeHtml(details.buttonAction)}</code></td><td>${escapeHtml(details.description)}</td></tr>`;
            }).join('')}
          </tbody></table>
          <div class="print-camera-reference"><div class="print-section-title"><span>03</span><h2>Camera reference</h2></div>
            <table><thead><tr><th>Camera</th><th>Button</th><th>ButtonAction</th><th>Video</th><th>Control</th></tr></thead><tbody>
              ${state.cameras.map((camera) => {
                const button = PHYSICAL_BUTTONS.find((candidate) => state.assignments[candidate.number] === cameraAssignment(camera.id));
                return `<tr><td><strong>${escapeHtml(camera.Name)}</strong></td><td>${button ? `<span class="chip camera">${button.number}</span>` : '-'}</td><td><code>${escapeHtml(cameraActions.get(camera.id) ?? '')}</code></td><td>${escapeHtml(camera.ConnectorId)}</td><td>${escapeHtml(camera.ControlId)}</td></tr>`;
              }).join('')}
            </tbody></table>
          </div>
        </div>
      </div>
      <footer class="print-footer"><span>Joystick Camera Control · Cisco Sample Code</span><span>USB or uncertified cameras may be switched but require additional development for joystick PTZ.</span></footer>
    </section>`;
}
