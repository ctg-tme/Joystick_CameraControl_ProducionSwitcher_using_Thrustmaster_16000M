export interface SourceManifest {
  version: string;
  macro: {
    fileName: string;
    macroName: string;
    sha256: string;
  };
  dependency: {
    fileName: string;
    macroName: string;
    sourceUrl: string;
  };
}

export interface InstallerSources {
  manifest: SourceManifest;
  macroTemplate: string;
}

async function fetchText(url: string, label: string): Promise<string> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load ${label} (${response.status}).`);
  return response.text();
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadInstallerSources(): Promise<InstallerSources> {
  const manifestResponse = await fetch('./assets/source-manifest.json', { cache: 'no-store' });
  if (!manifestResponse.ok) throw new Error('Unable to load the installer source manifest.');
  const manifest = await manifestResponse.json() as SourceManifest;
  const macroTemplate = await fetchText(`./assets/${manifest.macro.fileName}`, 'the joystick macro template');
  if (await sha256(macroTemplate) !== manifest.macro.sha256) {
    throw new Error('The packaged macro template does not match its source manifest.');
  }
  return { manifest, macroTemplate };
}

export async function loadDependencySource(manifest: SourceManifest): Promise<string> {
  return fetchText(manifest.dependency.sourceUrl, manifest.dependency.fileName);
}
