import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const installerRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(installerRoot, '..');
const outputDirectory = resolve(installerRoot, 'public/assets');
const macroFileName = 'Joystick_CameraControl_ProductionSwitcher.js';
const macroPath = resolve(projectRoot, macroFileName);
const guidePath = resolve(projectRoot, 'Guides/thrustmaster16000m-camera-guide.html');
const externalClassUrl = 'https://raw.githubusercontent.com/ctg-tme/Thrustmaster_16000M-InputDevice-Class/main/Thrustmaster_16000M-Class.js';

const [macroSource, guideSource] = await Promise.all([
  readFile(macroPath, 'utf8'),
  readFile(guidePath, 'utf8'),
]);

for (const marker of ['/* JOYSTICK_CONFIG_START */', '/* JOYSTICK_CONFIG_END */']) {
  if (!macroSource.includes(marker)) throw new Error(`Macro is missing required installer marker: ${marker}`);
}

execFileSync(process.execPath, ['--check', macroPath], { stdio: 'inherit' });

const imageMatch = guideSource.match(/<img\s+src="data:image\/png;base64,([^"]+)"/);
if (!imageMatch) throw new Error('Unable to extract the joystick image from the operator guide');

const versionMatch = macroSource.match(/\*\s+Version:\s+([^\s]+)/);
if (!versionMatch) throw new Error('Unable to determine the macro version');

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, macroFileName), macroSource),
  writeFile(resolve(outputDirectory, 'thrustmaster-t16000m.png'), Buffer.from(imageMatch[1], 'base64')),
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
