import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const installerRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(installerRoot, '..');
const outputDirectory = resolve(installerRoot, 'public/assets');
const macroFileName = 'Joystick_CameraControl_ProductionSwitcher.js';
const macroPath = resolve(projectRoot, macroFileName);
const joystickImagePath = resolve(installerRoot, 'src/assets/thrustmaster-t16000m.png');
const liveDemoImagePath = resolve(projectRoot, 'docs/images/infocomm-2026-joystick-demo.png');
const externalClassUrl = 'https://raw.githubusercontent.com/ctg-tme/Thrustmaster_16000M-InputDevice-Class/main/Thrustmaster_16000M-Class.js';

const [macroSource, joystickImage, liveDemoImage] = await Promise.all([
  readFile(macroPath, 'utf8'),
  readFile(joystickImagePath),
  readFile(liveDemoImagePath),
]);

for (const marker of ['/* JOYSTICK_CONFIG_START */', '/* JOYSTICK_CONFIG_END */']) {
  if (!macroSource.includes(marker)) throw new Error(`Macro is missing required installer marker: ${marker}`);
}

execFileSync(process.execPath, ['--check', macroPath], { stdio: 'inherit' });

const versionMatch = macroSource.match(/\*\s+Version:\s+([^\s]+)/);
if (!versionMatch) throw new Error('Unable to determine the macro version');

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, macroFileName), macroSource),
  writeFile(resolve(outputDirectory, 'thrustmaster-t16000m.png'), joystickImage),
  writeFile(resolve(outputDirectory, 'infocomm-2026-joystick-demo.png'), liveDemoImage),
  writeFile(
    resolve(outputDirectory, 'source-manifest.json'),
    `${JSON.stringify({
      version: versionMatch[1],
      macro: {
        fileName: macroFileName,
        macroName: 'Joystick_CameraControl_ProductionSwitcher',
        sha256: createHash('sha256').update(macroSource).digest('hex'),
      },
      dependency: {
        fileName: 'Thrustmaster_16000M-Class.js',
        macroName: 'Thrustmaster_16000M-Class',
        sourceUrl: externalClassUrl,
      },
    }, null, 2)}\n`,
  ),
]);
