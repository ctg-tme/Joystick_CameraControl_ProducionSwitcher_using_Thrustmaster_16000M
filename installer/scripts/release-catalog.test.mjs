import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  findExactReleaseAsset,
  parseSimpleReleaseManifest,
  prepareReleaseCatalog,
  verifyAssetDigest,
} from './release-catalog.mjs';

function asset(name, body) {
  return {
    name,
    digest: `sha256:${createHash('sha256').update(body).digest('hex')}`,
    browser_download_url: `https://downloads.example.test/${name}`,
  };
}

function response(body, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

describe('Release catalog preparation', () => {
  it('restores development assets after the production build completes', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

    expect(packageJson.scripts.build).toContain('prepare-assets.mjs --production');
    expect(packageJson.scripts.postbuild).toBe('node scripts/prepare-assets.mjs');
  });

  it('parses only the intentionally simple manifest contract', () => {
    expect(parseSimpleReleaseManifest({
      version: 1,
      macro: 'base.js',
      dependencies: [{ repo: 'owner/dependency', release: 'v1.2.3', asset: 'dependency.js' }],
    })).toEqual({
      version: 1,
      macro: 'base.js',
      dependencies: [{ repo: 'owner/dependency', release: 'v1.2.3', asset: 'dependency.js' }],
    });
    expect(() => parseSimpleReleaseManifest({
      version: 1,
      macro: 'base.js',
      dependencies: [],
      guide: 'guide.pdf',
    })).toThrow('must contain only');
  });

  it('requires exact asset resolution and a valid GitHub digest', () => {
    const body = 'verified bytes';
    const verified = asset('base.js', body);
    expect(findExactReleaseAsset({ assets: [verified] }, 'base.js', 'base v1')).toBe(verified);
    expect(() => findExactReleaseAsset({ assets: [] }, 'base.js', 'base v1')).toThrow('exactly one');
    expect(() => verifyAssetDigest(Buffer.from('changed'), verified, 'base.js')).toThrow('failed SHA-256');
  });

  it('generates exact versioned base/dependency pairs from mocked GitHub responses and reuses verified cache bytes', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'joystick-release-catalog-'));
    const macroSource = [
      '/**',
      ' * Version: 2.0.0',
      ' */',
      '/* JOYSTICK_CONFIG_START */',
      'const config = {};',
      '/* JOYSTICK_CONFIG_END */',
    ].join('\n');
    const dependencySource = 'export class ThrustmasterInput {}\n';
    const localMacroSource = [
      '/**',
      ' * Version: 2.0.0',
      ' */',
      '/* JOYSTICK_CONFIG_START */',
      'const config = { localDevelopment: true };',
      '/* JOYSTICK_CONFIG_END */',
    ].join('\n');
    const localManifest = {
      version: 1,
      macro: 'base.js',
      dependencies: [{ repo: 'owner/dependency', release: 'v1.0.0', asset: 'dependency.js' }],
    };
    const manifestSource = `${JSON.stringify({
      version: 1,
      macro: 'base.js',
      dependencies: [{ repo: 'owner/dependency', release: 'v1.0.0', asset: 'dependency.js' }],
    })}\n`;
    const manifestAsset = asset('release-manifest.json', manifestSource);
    const macroAsset = asset('base.js', macroSource);
    const dependencyAsset = asset('dependency.js', dependencySource);
    const urls = new Map([
      ['https://api.github.com/repos/owner/base/releases?per_page=100&page=1', [{
        tag_name: 'v2.0.0',
        draft: false,
        prerelease: false,
        published_at: '2026-08-19T12:00:00Z',
        html_url: 'https://github.example.test/owner/base/releases/v2.0.0',
        assets: [manifestAsset, macroAsset],
      }]],
      ['https://api.github.com/repos/owner/dependency/releases/tags/v1.0.0', {
        tag_name: 'v1.0.0',
        draft: false,
        prerelease: false,
        assets: [dependencyAsset],
      }],
      [manifestAsset.browser_download_url, manifestSource],
      [macroAsset.browser_download_url, macroSource],
      [dependencyAsset.browser_download_url, dependencySource],
    ]);
    const downloadCalls = [];
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).startsWith('https://downloads.')) downloadCalls.push(String(url));
      const body = urls.get(String(url));
      return body === undefined ? response('missing', 404) : response(body);
    });

    const catalog = await prepareReleaseCatalog({
      baseRepository: 'owner/base',
      outputDirectory,
      repositoryVersion: 'v2.0.0',
      requireCurrentRelease: true,
      localDevelopment: { macroSource: localMacroSource, manifest: localManifest },
      fetchImpl,
    });

    expect(catalog.latest).toBe('v2.0.0');
    expect(catalog.releases[0].dependencies[0]).toMatchObject({
      repo: 'owner/dependency',
      release: 'v1.0.0',
      fileName: 'dependency.js',
    });
    expect(await readFile(join(outputDirectory, catalog.releases[0].macro.path), 'utf8')).toBe(macroSource);
    expect(await readFile(join(outputDirectory, catalog.releases[0].dependencies[0].path), 'utf8'))
      .toBe(dependencySource);
    expect(catalog.localDevelopment).toMatchObject({
      macroVersion: 'v2.0.0',
      macro: { fileName: 'base.js', macroName: 'Joystick_CameraControl_ProductionSwitcher' },
      dependencies: [{ repo: 'owner/dependency', release: 'v1.0.0', fileName: 'dependency.js' }],
    });
    expect(await readFile(join(outputDirectory, catalog.localDevelopment.macro.path), 'utf8'))
      .toBe(localMacroSource);
    expect(JSON.parse(await readFile(join(outputDirectory, 'release-catalog.json'), 'utf8')).latest)
      .toBe('v2.0.0');
    expect(downloadCalls).toHaveLength(3);

    downloadCalls.length = 0;
    await prepareReleaseCatalog({
      baseRepository: 'owner/base',
      outputDirectory,
      repositoryVersion: 'v2.0.0',
      requireCurrentRelease: true,
      localDevelopment: { macroSource: localMacroSource, manifest: localManifest },
      fetchImpl,
    });
    expect(downloadCalls).toEqual([]);
  });
});
