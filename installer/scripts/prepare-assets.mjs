import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeReleaseTag, prepareReleaseCatalog } from './release-catalog.mjs';

const installerRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(installerRoot, '..');
const outputDirectory = resolve(installerRoot, 'public/assets');
const baseRepository = 'ctg-tme/Joystick_CameraControl_ProductionSwitcher_using_Thrustmaster_16000M';
const macroPath = resolve(projectRoot, 'Joystick_CameraControl_ProductionSwitcher.js');
const joystickImagePath = resolve(installerRoot, 'src/assets/thrustmaster-t16000m.png');
const liveDemoImagePath = resolve(projectRoot, 'docs/images/infocomm-2026-joystick-demo.png');

const [macroSource, joystickImage, liveDemoImage] = await Promise.all([
  readFile(macroPath, 'utf8'),
  readFile(joystickImagePath),
  readFile(liveDemoImagePath),
]);

for (const marker of ['/* JOYSTICK_CONFIG_START */', '/* JOYSTICK_CONFIG_END */']) {
  if (!macroSource.includes(marker)) throw new Error(`Macro is missing required installer marker: ${marker}`);
}

const versionMatch = macroSource.match(/^[ \t]*\*[ \t]+Version:[ \t]+(v?\d+\.\d+\.\d+)[ \t]*$/m);
const repositoryVersion = normalizeReleaseTag(versionMatch?.[1]);
if (!repositoryVersion) throw new Error('Unable to determine the repository macro version.');

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  rm(resolve(outputDirectory, 'source-manifest.json'), { force: true }),
  rm(resolve(outputDirectory, 'Joystick_CameraControl_ProductionSwitcher.js'), { force: true }),
  writeFile(resolve(outputDirectory, 'thrustmaster-t16000m.png'), joystickImage),
  writeFile(resolve(outputDirectory, 'infocomm-2026-joystick-demo.png'), liveDemoImage),
]);

await prepareReleaseCatalog({
  baseRepository,
  outputDirectory,
  repositoryVersion,
  requireCurrentRelease: process.argv.includes('--production'),
  token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
});
