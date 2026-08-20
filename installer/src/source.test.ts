import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { generateConfiguredMacro } from './config';
import { createDefaultState } from './model';
import {
  chooseReleaseTarget,
  createFreshReleaseResolution,
  detectMacroReleaseVersion,
  ingestMacroSource,
  isLocalDevelopmentHost,
  loadLocalDevelopmentSources,
  migrateToLatestRelease,
  parseReleaseCatalog,
  type ReleaseCatalog,
} from './source';

const digest = 'a'.repeat(64);

function release(tag: string, dependencyRelease: string) {
  return {
    tag,
    publishedAt: tag === 'v2.0.0' ? '2026-08-19T12:00:00Z' : '2026-01-01T12:00:00Z',
    releaseUrl: `https://example.test/releases/${tag}`,
    macro: {
      fileName: 'Joystick_CameraControl_ProductionSwitcher.js',
      macroName: 'Joystick_CameraControl_ProductionSwitcher',
      sha256: digest,
      path: `releases/${tag}/Joystick_CameraControl_ProductionSwitcher.js`,
    },
    dependencies: [{
      repo: 'ctg-tme/Thrustmaster_16000M-InputDevice-Class',
      release: dependencyRelease,
      fileName: 'Thrustmaster_16000M-Class.js',
      macroName: 'Thrustmaster_16000M-Class',
      sha256: digest,
      path: `releases/${tag}/dependencies/input/${dependencyRelease}/Thrustmaster_16000M-Class.js`,
    }],
  };
}

const catalog: ReleaseCatalog = parseReleaseCatalog({
  version: 1,
  repositoryVersion: 'v2.0.0',
  latest: 'v2.0.0',
  releases: [release('v2.0.0', 'v1.0.0'), release('v1.5.0', 'v0.9.0')],
  localDevelopment: {
    macroVersion: 'v2.0.0',
    macro: {
      fileName: 'Joystick_CameraControl_ProductionSwitcher.js',
      macroName: 'Joystick_CameraControl_ProductionSwitcher',
      sha256: digest,
      path: 'local-development/Joystick_CameraControl_ProductionSwitcher.js',
    },
    dependencies: [{
      repo: 'ctg-tme/Thrustmaster_16000M-InputDevice-Class',
      release: 'v1.0.0',
      fileName: 'Thrustmaster_16000M-Class.js',
      macroName: 'Thrustmaster_16000M-Class',
      sha256: digest,
      path: 'releases/v2.0.0/dependencies/input/v1.0.0/Thrustmaster_16000M-Class.js',
    }],
  },
});

function macro(versionLine?: string): string {
  const state = createDefaultState();
  state.projectName = 'Preserved Project';
  state.roomName = 'Preserved Room';
  state.panTiltRampSpeed = 19;
  state.zoomRampSpeed = 14;
  state.slowModeDivisor = 4;
  const template = [
    '/**',
    versionLine ?? ' * Source release is not identifiable',
    ' * RoomOS compatibility: 26.3',
    ' * Dependency Version: 99.0.0',
    ' */',
    '/* JOYSTICK_CONFIG_START */',
    'const config = {};',
    '/* JOYSTICK_CONFIG_END */',
  ].join('\n');
  return generateConfiguredMacro(template, state);
}

describe('Release-aware macro ingestion', () => {
  it('offers local development only on the requested loopback hosts', () => {
    expect(isLocalDevelopmentHost('localhost')).toBe(true);
    expect(isLocalDevelopmentHost('127.0.0.1')).toBe(true);
    expect(isLocalDevelopmentHost('0.0.0.0')).toBe(false);
    expect(isLocalDevelopmentHost('installer.example.test')).toBe(false);
  });

  it('loads the packaged working-tree macro and its exact dependency pair', async () => {
    const localMacro = macro(' * Version: 2.0.0');
    const localDependency = 'export class LocalDependency {}\n';
    const localCatalog = parseReleaseCatalog({
      version: 1,
      repositoryVersion: 'v2.0.0',
      latest: 'v2.0.0',
      releases: [release('v2.0.0', 'v1.0.0')],
      localDevelopment: {
        macroVersion: 'v2.0.0',
        macro: {
          fileName: 'Joystick_CameraControl_ProductionSwitcher.js',
          macroName: 'Joystick_CameraControl_ProductionSwitcher',
          sha256: createHash('sha256').update(localMacro).digest('hex'),
          path: 'local-development/Joystick_CameraControl_ProductionSwitcher.js',
        },
        dependencies: [{
          repo: 'ctg-tme/Thrustmaster_16000M-InputDevice-Class',
          release: 'v1.0.0',
          fileName: 'Thrustmaster_16000M-Class.js',
          macroName: 'Thrustmaster_16000M-Class',
          sha256: createHash('sha256').update(localDependency).digest('hex'),
          path: 'local-development/dependencies/Thrustmaster_16000M-Class.js',
        }],
      },
    });
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      if (path.endsWith('/Joystick_CameraControl_ProductionSwitcher.js')) return new Response(localMacro);
      if (path.endsWith('/Thrustmaster_16000M-Class.js')) return new Response(localDependency);
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const sources = await loadLocalDevelopmentSources(localCatalog);
      expect(sources.kind).toBe('local-development');
      expect(sources.release.tag).toBe('v2.0.0');
      expect(sources.macroTemplate).toBe(localMacro);
      expect(sources.dependencies[0]).toMatchObject({ source: localDependency });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('detects the aligned current header and normalizes an optional leading v', () => {
    expect(detectMacroReleaseVersion(macro(' * Version:                 2.0.0'))).toBe('v2.0.0');
    expect(detectMacroReleaseVersion(macro(' * Version: v1.5.0'))).toBe('v1.5.0');
  });

  it('does not match RoomOS, dependency, or unrelated inline version text', () => {
    expect(detectMacroReleaseVersion(macro())).toBeUndefined();
    expect(detectMacroReleaseVersion('const note = "Version: 2.0.0";')).toBeUndefined();
  });

  it.each(['upload', 'device'] as const)('uses the same ingestion rules for current %s sources', (origin) => {
    const ingested = ingestMacroSource(macro(' * Version: 2.0.0'), catalog, origin);

    expect(ingested.release).toMatchObject({
      origin,
      recognition: 'current',
      detectedTag: 'v2.0.0',
      targetTag: 'v2.0.0',
      targetChosenExplicitly: false,
    });
    expect(ingested.state.projectName).toBe('Preserved Project');
  });

  it.each(['upload', 'device'] as const)('keeps an older packaged %s source usable before migration', (origin) => {
    const ingested = ingestMacroSource(macro(' * Version: 1.5.0'), catalog, origin);

    expect(ingested.release).toMatchObject({ recognition: 'older', targetTag: 'v1.5.0' });
    expect(catalog.releases.find((candidate) => candidate.tag === ingested.release.targetTag)?.dependencies[0].release)
      .toBe('v0.9.0');
  });

  it.each(['upload', 'device'] as const)('loads every valid setting from an unknown %s source without a target', (origin) => {
    const ingested = ingestMacroSource(macro(), catalog, origin);

    expect(ingested.release).toMatchObject({ recognition: 'unknown' });
    expect(ingested.release.targetTag).toBeUndefined();
    expect(ingested.state).toMatchObject({
      projectName: 'Preserved Project',
      roomName: 'Preserved Room',
      panTiltRampSpeed: 19,
      zoomRampSpeed: 14,
      slowModeDivisor: 4,
    });
  });

  it('distinguishes a detected but unavailable source Release', () => {
    const ingested = ingestMacroSource(macro(' * Version: 9.0.0'), catalog, 'upload');
    expect(ingested.release).toMatchObject({
      recognition: 'unavailable',
      detectedTag: 'v9.0.0',
    });
    expect(ingested.release.targetTag).toBeUndefined();
  });

  it('migrates only the target and preserves the full configuration', () => {
    const ingested = ingestMacroSource(macro(' * Version: 1.5.0'), catalog, 'device');
    const before = structuredClone(ingested.state);
    const migrated = migrateToLatestRelease(ingested.release, catalog);

    expect(ingested.state).toEqual(before);
    expect(migrated).toMatchObject({
      origin: 'device',
      detectedTag: 'v1.5.0',
      targetTag: 'v2.0.0',
      targetChosenExplicitly: true,
    });
    expect(catalog.releases.find((candidate) => candidate.tag === migrated.targetTag)?.dependencies[0].release)
      .toBe('v1.0.0');
  });

  it('retains the selected template version header in generated macros', () => {
    const generated = macro(' * Version: 1.5.0');
    expect(detectMacroReleaseVersion(generated)).toBe('v1.5.0');
    expect(generated).toContain('ProjectName: "Preserved Project"');
  });

  it('uses latest for a fresh session and keeps selection in memory only', async () => {
    expect(createFreshReleaseResolution(catalog)).toMatchObject({
      recognition: 'fresh',
      targetTag: 'v2.0.0',
      targetChosenExplicitly: false,
    });
    expect(chooseReleaseTarget(createFreshReleaseResolution(catalog), catalog, 'v1.5.0').targetTag)
      .toBe('v1.5.0');

    const appSource = await readFile(new URL('./app.ts', import.meta.url), 'utf8');
    expect(appSource).not.toContain('localStorage.setItem(BASE_MACRO');
    expect(appSource).toContain('createFreshReleaseResolution(this.catalog)');
    expect(appSource).toContain('Local Development · Macro Version');
    expect(appSource).toContain("isLocalDevelopmentHost(window.location?.hostname ?? '')");
  });

  it('routes upload and device fetch through the same ingestion function', async () => {
    const appSource = await readFile(new URL('./app.ts', import.meta.url), 'utf8');
    expect(appSource.match(/await this\.loadConfigurationSource\(/g)).toHaveLength(2);
    expect(appSource).toContain("'upload',");
    expect(appSource).toContain("'device',");
  });
});
