import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { create as createQrCode } from 'qrcode';
import joystickImageDataUrl from './assets/thrustmaster-t16000m.png?inline';
import enablementImageDataUrl from './assets/joystick-controls-enabled-crop.jpg?inline';
import repositoryIconDataUrl from './assets/repository-icon.png?inline';
import { PHYSICAL_BUTTONS, type ActionCategory, type ConfiguratorState } from './model';
import {
  createOperatorGuideModel,
  operatorGuideFileName,
  type OperatorGuideModel,
} from './operator-guide-model';

export interface ConfiguredOperatorGuide {
  fileName: string;
  mimeType: 'application/pdf';
  bytes: Uint8Array;
}

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const MARGIN = 24;

const COLORS = {
  ink: rgb(0.07, 0.11, 0.16),
  muted: rgb(0.31, 0.37, 0.43),
  faint: rgb(0.93, 0.95, 0.97),
  line: rgb(0.82, 0.85, 0.89),
  white: rgb(1, 1, 1),
  main: rgb(0.15, 0.39, 0.78),
  preview: rgb(0.06, 0.46, 0.43),
  camera: rgb(0.18, 0.49, 0.2),
  motion: rgb(0.43, 0.24, 0.76),
  selfview: rgb(0.66, 0.38, 0.03),
  unused: rgb(0.42, 0.47, 0.52),
  warning: rgb(0.73, 0.34, 0.04),
  warningFill: rgb(1, 0.96, 0.88),
} as const;

const CATEGORY_COLORS: Record<ActionCategory, RGB> = {
  main: COLORS.main,
  preview: COLORS.preview,
  camera: COLORS.camera,
  motion: COLORS.motion,
  selfview: COLORS.selfview,
  unused: COLORS.unused,
};

interface GuideFonts {
  regular: PDFFont;
  bold: PDFFont;
}

function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !dataUrl.slice(0, comma).includes(';base64')) {
    throw new Error('Operator guide image asset is not a base64 data URL');
  }
  const decoded = atob(dataUrl.slice(comma + 1));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function ellipsize(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const suffix = '...';
  let value = text;
  while (value && font.widthOfTextAtSize(`${value}${suffix}`, size) > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value.trimEnd()}${suffix}`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else if (line) {
      lines.push(line);
      line = font.widthOfTextAtSize(word, size) <= maxWidth
        ? word
        : ellipsize(word, font, size, maxWidth);
    } else {
      lines.push(ellipsize(word, font, size, maxWidth));
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    width: number;
    font: PDFFont;
    size: number;
    lineHeight?: number;
    color?: RGB;
    maxLines?: number;
  },
): number {
  const lineHeight = options.lineHeight ?? options.size * 1.25;
  const maxLines = options.maxLines ?? Number.POSITIVE_INFINITY;
  const lines = wrapText(text, options.font, options.size, options.width);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length) {
    visible[visible.length - 1] = ellipsize(
      `${visible[visible.length - 1]} ${lines[maxLines] ?? ''}`,
      options.font,
      options.size,
      options.width,
    );
  }
  visible.forEach((line, index) => {
    page.drawText(line, {
      x: options.x,
      y: options.y - index * lineHeight,
      font: options.font,
      size: options.size,
      color: options.color ?? COLORS.ink,
    });
  });
  return options.y - visible.length * lineHeight;
}

function drawFittedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  color: RGB = COLORS.ink,
): void {
  page.drawText(ellipsize(text, font, size, maxWidth), { x, y, font, size, color });
}

function drawSectionHeading(
  page: PDFPage,
  label: string,
  x: number,
  y: number,
  width: number,
  fonts: GuideFonts,
): void {
  drawFittedText(page, label.toUpperCase(), x, y, width, fonts.bold, 9.5, COLORS.ink);
  page.drawLine({
    start: { x, y: y - 5 },
    end: { x: x + width, y: y - 5 },
    thickness: 0.8,
    color: COLORS.line,
  });
}

function drawNumberBadge(
  page: PDFPage,
  number: number,
  x: number,
  y: number,
  color: RGB,
  fonts: GuideFonts,
  radius = 6.3,
): void {
  page.drawCircle({ x, y, size: radius, color, borderColor: COLORS.white, borderWidth: 0.8 });
  const label = String(number);
  const size = number >= 10 ? 5.8 : 6.5;
  const width = fonts.bold.widthOfTextAtSize(label, size);
  page.drawText(label, {
    x: x - width / 2,
    y: y - size * 0.34,
    font: fonts.bold,
    size,
    color: COLORS.white,
  });
}

function drawRepositoryQrCode(
  page: PDFPage,
  repositoryUrl: string,
  repositoryIcon: PDFImage,
  x: number,
  y: number,
  size: number,
): void {
  const qrCode = createQrCode(repositoryUrl, { errorCorrectionLevel: 'H' });
  const quietZoneModules = 4;
  const totalModules = qrCode.modules.size + quietZoneModules * 2;
  const moduleSize = size / totalModules;

  page.drawRectangle({ x, y, width: size, height: size, color: COLORS.white });
  for (let row = 0; row < qrCode.modules.size; row += 1) {
    for (let column = 0; column < qrCode.modules.size; column += 1) {
      if (!qrCode.modules.get(row, column)) continue;
      page.drawRectangle({
        x: x + (column + quietZoneModules) * moduleSize,
        y: y + (qrCode.modules.size - row - 1 + quietZoneModules) * moduleSize,
        width: moduleSize + 0.02,
        height: moduleSize + 0.02,
        color: COLORS.ink,
      });
    }
  }

  const iconBackingSize = size * 0.29;
  const iconSize = size * 0.245;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  page.drawRectangle({
    x: centerX - iconBackingSize / 2,
    y: centerY - iconBackingSize / 2,
    width: iconBackingSize,
    height: iconBackingSize,
    color: COLORS.white,
  });
  page.drawImage(repositoryIcon, {
    x: centerX - iconSize / 2,
    y: centerY - iconSize / 2,
    width: iconSize,
    height: iconSize,
  });
}

function drawHeader(page: PDFPage, model: OperatorGuideModel, fonts: GuideFonts): void {
  page.drawRectangle({ x: 0, y: 536, width: PAGE_WIDTH, height: 76, color: COLORS.ink });
  page.drawText('OPERATOR GUIDE', {
    x: MARGIN,
    y: 589,
    font: fonts.bold,
    size: 7.5,
    color: rgb(0.59, 0.78, 0.96),
  });
  drawFittedText(page, model.projectName, MARGIN, 564, 470, fonts.bold, 20, COLORS.white);
  drawFittedText(page, model.roomName, MARGIN, 547, 470, fonts.regular, 10.5, rgb(0.84, 0.88, 0.92));

  page.drawRectangle({ x: 526, y: 550, width: 242, height: 43, color: rgb(0.12, 0.18, 0.25) });
  page.drawText('HANDEDNESS', { x: 537, y: 580, font: fonts.bold, size: 6.4, color: rgb(0.59, 0.68, 0.77) });
  page.drawText('PREVIEW', { x: 651, y: 580, font: fonts.bold, size: 6.4, color: rgb(0.59, 0.68, 0.77) });
  drawFittedText(page, model.handedness, 537, 562, 103, fonts.bold, 10, COLORS.white);
  drawFittedText(
    page,
    model.previewStatus,
    651,
    562,
    106,
    fonts.bold,
    8.4,
    model.previewEnabled ? rgb(0.52, 0.93, 0.79) : rgb(1, 0.72, 0.39),
  );
}

function drawJoystickColumn(
  page: PDFPage,
  model: OperatorGuideModel,
  fonts: GuideFonts,
  joystickImage: Awaited<ReturnType<PDFDocument['embedPng']>>,
): void {
  const x = 24;
  const width = 224;
  drawSectionHeading(page, 'Joystick map', x, 517, width, fonts);

  const imageWidth = 222;
  const imageHeight = imageWidth * (556 / 440);
  const imageX = x + 1;
  const imageY = 218;
  page.drawRectangle({ x: imageX, y: imageY, width: imageWidth, height: imageHeight, color: COLORS.white });
  page.drawImage(joystickImage, { x: imageX, y: imageY, width: imageWidth, height: imageHeight });

  for (const button of PHYSICAL_BUTTONS) {
    const guideButton = model.buttons.find((candidate) => candidate.number === button.number);
    if (!guideButton) continue;
    drawNumberBadge(
      page,
      button.number,
      imageX + (button.x / 100) * imageWidth,
      imageY + (1 - button.y / 100) * imageHeight,
      CATEGORY_COLORS[guideButton.category],
      fonts,
    );
  }

  const sliderX = imageX + imageWidth * 0.408;
  const sliderY = imageY + imageHeight * 0.19;
  const sliderCrossSize = 10;
  for (const thickness of [5, 2.4]) {
    const color = thickness === 5 ? COLORS.white : COLORS.warning;
    page.drawLine({
      start: { x: sliderX - sliderCrossSize, y: sliderY - sliderCrossSize },
      end: { x: sliderX + sliderCrossSize, y: sliderY + sliderCrossSize },
      thickness,
      color,
    });
    page.drawLine({
      start: { x: sliderX - sliderCrossSize, y: sliderY + sliderCrossSize },
      end: { x: sliderX + sliderCrossSize, y: sliderY - sliderCrossSize },
      thickness,
      color,
    });
  }
  page.drawRectangle({
    x: imageX + 123,
    y: imageY + 18,
    width: 91,
    height: 18,
    color: COLORS.white,
    borderColor: COLORS.warning,
    borderWidth: 1,
  });
  drawFittedText(
    page,
    model.motion.slider.toUpperCase(),
    imageX + 129,
    imageY + 24,
    79,
    fonts.bold,
    6.1,
    COLORS.warning,
  );

  const axisItems = [
    ['PAN', model.motion.pan],
    ['TILT', model.motion.tilt],
    ['ZOOM', model.motion.zoom],
  ] as const;
  axisItems.forEach(([label, value], index) => {
    const itemX = x + index * 74.5;
    page.drawText(label, { x: itemX, y: 205, font: fonts.bold, size: 6.2, color: COLORS.muted });
    drawFittedText(page, value, itemX, 194, 70, fonts.regular, 6.7, COLORS.ink);
  });

  const legend = [
    ['Main', 'main'],
    ['Preview', 'preview'],
    ['Camera', 'camera'],
    ['Motion / swap', 'motion'],
    ['Selfview', 'selfview'],
    ['No action', 'unused'],
  ] as const;
  legend.forEach(([label, category], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const itemX = x + column * 112;
    const itemY = 171 - row * 14;
    page.drawCircle({ x: itemX + 4, y: itemY + 3, size: 3.5, color: CATEGORY_COLORS[category] });
    page.drawText(label, { x: itemX + 11, y: itemY, font: fonts.regular, size: 7, color: COLORS.muted });
  });

  page.drawRectangle({ x, y: 72, width, height: 52, color: COLORS.faint });
  page.drawText('CONFIGURED MOTION', { x: x + 10, y: 109, font: fonts.bold, size: 6.5, color: COLORS.muted });
  page.drawText(`Pan / tilt speed  ${model.motion.panTiltRampSpeed}`, { x: x + 10, y: 93, font: fonts.bold, size: 8, color: COLORS.ink });
  page.drawText(`Zoom speed  ${model.motion.zoomRampSpeed}`, { x: x + 112, y: 93, font: fonts.bold, size: 8, color: COLORS.ink });
  page.drawText(`Precision divides movement speed by ${model.motion.precisionDivisor}.`, {
    x: x + 10,
    y: 80,
    font: fonts.regular,
    size: 7.2,
    color: COLORS.muted,
  });
  page.drawText('Thrustmaster T.16000M button and axis reference', {
    x,
    y: 48,
    font: fonts.regular,
    size: 6.5,
    color: COLORS.muted,
  });
}

function drawEnablementColumn(
  page: PDFPage,
  model: OperatorGuideModel,
  fonts: GuideFonts,
  enablementImage: Awaited<ReturnType<PDFDocument['embedJpg']>>,
  repositoryIcon: PDFImage,
): void {
  const x = 260;
  const width = 244;
  drawSectionHeading(page, model.enablement.heading, x, 517, width, fonts);

  const imageHeight = width * (315 / 840);
  page.drawImage(enablementImage, { x, y: 405, width, height: imageHeight });
  page.drawText('RoomOS location example - Enabled control only', {
    x,
    y: 395,
    font: fonts.regular,
    size: 6.6,
    color: COLORS.muted,
  });

  let y = 377;
  model.enablement.steps.forEach((step, index) => {
    page.drawCircle({ x: x + 7, y: y + 3, size: 6.2, color: COLORS.ink });
    const number = String(index + 1);
    const numberWidth = fonts.bold.widthOfTextAtSize(number, 6.5);
    page.drawText(number, {
      x: x + 7 - numberWidth / 2,
      y: y + 0.7,
      font: fonts.bold,
      size: 6.5,
      color: COLORS.white,
    });
    y = drawWrappedText(page, step, {
      x: x + 19,
      y: y + 1,
      width: width - 19,
      font: fonts.regular,
      size: 8.6,
      lineHeight: 10.4,
      maxLines: 2,
    }) - 8;
  });

  page.drawRectangle({ x, y: 249, width, height: 55, color: COLORS.warningFill });
  page.drawRectangle({ x, y: 249, width: 4, height: 55, color: COLORS.warning });
  page.drawText('TRACKING WARNING', { x: x + 12, y: 289, font: fonts.bold, size: 6.7, color: COLORS.warning });
  drawWrappedText(page, model.enablement.trackingWarning, {
    x: x + 12,
    y: 276,
    width: width - 23,
    font: fonts.regular,
    size: 7.8,
    lineHeight: 9.6,
    maxLines: 3,
  });

  page.drawText(model.previewEnabled ? 'OPERATING WORKFLOW' : 'OPERATING WORKFLOW - PREVIEW OFF', {
    x,
    y: 230,
    font: fonts.bold,
    size: 7.4,
    color: model.previewEnabled ? COLORS.ink : COLORS.warning,
  });
  let workflowY = 214;
  model.workflow.forEach((step, index) => {
    page.drawText(`${index + 1}.`, { x, y: workflowY, font: fonts.bold, size: 7.6, color: COLORS.ink });
    const after = drawWrappedText(page, step, {
      x: x + 14,
      y: workflowY,
      width: width - 14,
      font: fonts.regular,
      size: 7.6,
      lineHeight: 9,
      maxLines: 2,
    });
    workflowY = after - 4;
  });

  page.drawRectangle({ x, y: 45, width, height: 61, color: COLORS.faint });
  page.drawText('SCAN FOR GITHUB REPO', {
    x: x + 10,
    y: 91,
    font: fonts.bold,
    size: 6.5,
    color: COLORS.muted,
  });
  drawWrappedText(page, 'Scan to open the project repository.', {
    x: x + 10,
    y: 76,
    width: 166,
    font: fonts.regular,
    size: 7.6,
    lineHeight: 9,
    maxLines: 2,
  });
  drawRepositoryQrCode(page, model.repositoryQrUrl, repositoryIcon, x + 187, 48, 54);
}

function drawButtonRow(
  page: PDFPage,
  model: OperatorGuideModel,
  buttonIndex: number,
  x: number,
  y: number,
  width: number,
  fonts: GuideFonts,
): void {
  const button = model.buttons[buttonIndex];
  if (!button) return;
  page.drawLine({
    start: { x, y: y - 5 },
    end: { x: x + width, y: y - 5 },
    thickness: 0.35,
    color: COLORS.line,
  });
  drawNumberBadge(page, button.number, x + 7, y + 3, CATEGORY_COLORS[button.category], fonts, 5.7);
  drawFittedText(
    page,
    button.action,
    x + 18,
    y,
    width - 18,
    button.available ? fonts.bold : fonts.regular,
    7.4,
    button.available ? COLORS.ink : COLORS.warning,
  );
}

function drawButtonColumn(page: PDFPage, model: OperatorGuideModel, fonts: GuideFonts): void {
  const x = 516;
  const width = 252;
  drawSectionHeading(page, 'All 16 button assignments', x, 517, width, fonts);

  page.drawText('BUTTONS 1-8', { x, y: 498, font: fonts.bold, size: 6.5, color: COLORS.muted });
  for (let index = 0; index < 8; index += 1) {
    drawButtonRow(page, model, index, x, 481 - index * 19.5, width, fonts);
  }
  page.drawText('BUTTONS 9-16', { x, y: 319, font: fonts.bold, size: 6.5, color: COLORS.muted });
  for (let index = 8; index < 16; index += 1) {
    drawButtonRow(page, model, index, x, 302 - (index - 8) * 19.5, width, fonts);
  }

  page.drawRectangle({ x, y: 45, width, height: 92, color: COLORS.faint });
  page.drawText('CONFIGURED CAMERAS', { x: x + 10, y: 122, font: fonts.bold, size: 6.7, color: COLORS.muted });
  model.cameras.slice(0, 4).forEach((camera, index) => {
    const rowY = 105 - index * 18;
    const buttonLabel = camera.buttonNumbers.length ? `Button ${camera.buttonNumbers.join(', ')}` : 'Not assigned';
    drawFittedText(
      page,
      `${camera.name}${camera.isDefault ? ' (default)' : ''}${camera.videoOnly ? ' — video only' : ''}`,
      x + 10,
      rowY,
      166,
      fonts.bold,
      7.4,
      camera.videoOnly ? COLORS.warning : COLORS.ink,
    );
    drawFittedText(page, buttonLabel, x + 180, rowY, 62, fonts.regular, 7, COLORS.muted);
  });
}

function renderOperatorGuidePage(
  page: PDFPage,
  model: OperatorGuideModel,
  fonts: GuideFonts,
  joystickImage: Awaited<ReturnType<PDFDocument['embedPng']>>,
  enablementImage: Awaited<ReturnType<PDFDocument['embedJpg']>>,
  repositoryIcon: PDFImage,
): void {
  drawHeader(page, model, fonts);
  page.drawLine({ start: { x: 254, y: 44 }, end: { x: 254, y: 522 }, thickness: 0.6, color: COLORS.line });
  page.drawLine({ start: { x: 510, y: 44 }, end: { x: 510, y: 522 }, thickness: 0.6, color: COLORS.line });
  drawJoystickColumn(page, model, fonts, joystickImage);
  drawEnablementColumn(page, model, fonts, enablementImage, repositoryIcon);
  drawButtonColumn(page, model, fonts);
  page.drawText('Keep this guide in the room for operators.', {
    x: 516,
    y: 27,
    font: fonts.regular,
    size: 6.5,
    color: COLORS.muted,
  });
}

/** Generates a configuration-specific, one-page US Letter landscape PDF. */
export async function generateConfiguredOperatorGuide(
  state: ConfiguratorState,
): Promise<ConfiguredOperatorGuide> {
  const model = createOperatorGuideModel(state);
  const document = await PDFDocument.create();
  document.setTitle(`${model.projectName} - ${model.roomName} - Operator Guide`);
  document.setSubject('Configured Thrustmaster T.16000M operator quick reference');
  document.setCreator('Joystick Camera Control Macro Web Installer');
  document.setProducer('pdf-lib');

  const [regular, bold, joystickImage, enablementImage, repositoryIcon] = await Promise.all([
    document.embedFont(StandardFonts.Helvetica),
    document.embedFont(StandardFonts.HelveticaBold),
    document.embedPng(bytesFromDataUrl(joystickImageDataUrl)),
    document.embedJpg(bytesFromDataUrl(enablementImageDataUrl)),
    document.embedPng(bytesFromDataUrl(repositoryIconDataUrl)),
  ]);
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  renderOperatorGuidePage(page, model, { regular, bold }, joystickImage, enablementImage, repositoryIcon);

  return {
    fileName: operatorGuideFileName(state),
    mimeType: 'application/pdf',
    bytes: await document.save({ useObjectStreams: false }),
  };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/** Retains the installer's browser print view without participating in PDF generation. */
export function renderConfiguredPrintSheet(state: ConfiguratorState): string {
  const model = createOperatorGuideModel(state);
  return `
    <section class="print-sheet print-only">
      <header class="print-header">
        <div><span>Project</span><h1 data-project-name-output>${escapeHtml(model.projectName)}</h1></div>
        <div class="print-room"><span>Room</span><strong data-room-name-output>${escapeHtml(model.roomName)}</strong><small>${escapeHtml(model.handedness)} · Preview ${escapeHtml(model.previewStatus)}</small></div>
      </header>
      <div class="print-layout">
        <aside>
          <div class="print-section-title"><span>01</span><h2>Joystick map</h2></div>
          <img src="./assets/thrustmaster-t16000m.png" alt="Thrustmaster T.16000M button and axis reference">
          <p>${escapeHtml(model.motion.pan)} to pan · ${escapeHtml(model.motion.tilt)} to tilt · ${escapeHtml(model.motion.zoom)} to zoom.</p>
        </aside>
        <div class="print-reference">
          <div class="print-section-title"><span>02</span><h2>Button reference</h2></div>
          <table class="print-button-table"><thead><tr><th>#</th><th>Physical control</th><th>Operator action</th></tr></thead><tbody>
            ${model.buttons.map((button) => `<tr><td><span class="chip ${button.category}">${button.number}</span></td><td><strong>${escapeHtml(button.physicalControl)}</strong></td><td>${escapeHtml(button.action)}</td></tr>`).join('')}
          </tbody></table>
        </div>
      </div>
      <footer class="print-footer"><span>${escapeHtml(model.enablement.trackingWarning)}</span></footer>
    </section>`;
}
