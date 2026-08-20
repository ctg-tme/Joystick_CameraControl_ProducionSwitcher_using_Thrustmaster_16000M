import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const CATALOG_VERSION = 1;
export const MANIFEST_FILE_NAME = 'release-manifest.json';
export const BASE_MACRO_NAME = 'Joystick_CameraControl_ProductionSwitcher';

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain only: ${wanted.join(', ')}.`);
  }
}

function requireAssetName(value, label) {
  if (typeof value !== 'string' || !value || value.includes('/') || value.includes('\\')) {
    throw new Error(`${label} must be a file name without a path.`);
  }
  return value;
}

function requireReleaseTag(value, label) {
  if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) {
    throw new Error(`${label} must be a non-empty Release tag.`);
  }
  return value;
}

export function parseSimpleReleaseManifest(value, label = MANIFEST_FILE_NAME) {
  const manifest = requirePlainObject(value, label);
  requireExactKeys(manifest, ['version', 'macro', 'dependencies'], label);
  if (manifest.version !== 1) throw new Error(`${label} version must be 1.`);
  const macro = requireAssetName(manifest.macro, `${label} macro`);
  if (!Array.isArray(manifest.dependencies) || manifest.dependencies.length === 0) {
    throw new Error(`${label} dependencies must contain at least one dependency.`);
  }

  const dependencies = manifest.dependencies.map((candidate, index) => {
    const dependency = requirePlainObject(candidate, `${label} dependency ${index + 1}`);
    requireExactKeys(dependency, ['repo', 'release', 'asset'], `${label} dependency ${index + 1}`);
    if (typeof dependency.repo !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(dependency.repo)) {
      throw new Error(`${label} dependency ${index + 1} repo must use owner/repository format.`);
    }
    return {
      repo: dependency.repo,
      release: requireReleaseTag(dependency.release, `${label} dependency ${index + 1} release`),
      asset: requireAssetName(dependency.asset, `${label} dependency ${index + 1} asset`),
    };
  });

  return { version: 1, macro, dependencies };
}

export function normalizeReleaseTag(value) {
  if (typeof value !== 'string') return undefined;
  const match = value.trim().match(/^v?(\d+\.\d+\.\d+)$/i);
  return match ? `v${match[1]}` : undefined;
}

export function githubAssetDigest(asset, label = asset?.name ?? 'Release asset') {
  const match = typeof asset?.digest === 'string'
    ? asset.digest.match(/^sha256:([a-f0-9]{64})$/i)
    : undefined;
  if (!match) throw new Error(`${label} is missing a GitHub-provided SHA-256 digest.`);
  return match[1].toLowerCase();
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyAssetDigest(bytes, asset, label = asset?.name ?? 'Release asset') {
  const expected = githubAssetDigest(asset, label);
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(`${label} failed SHA-256 verification (expected ${expected}, received ${actual}).`);
  }
  return actual;
}

export function findExactReleaseAsset(release, name, label) {
  const matches = Array.isArray(release?.assets)
    ? release.assets.filter((asset) => asset?.name === name)
    : [];
  if (matches.length !== 1) {
    throw new Error(`${label} must contain exactly one ${name} asset.`);
  }
  githubAssetDigest(matches[0], `${label} asset ${name}`);
  return matches[0];
}

function releaseAssetPath(tag, ...segments) {
  return ['releases', tag, ...segments].join('/');
}

async function githubJson(fetchImpl, url, headers, label) {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new Error(`Unable to load ${label} from GitHub (${response.status}).`);
  return response.json();
}

async function fetchPublishedReleases(fetchImpl, repository, headers) {
  const releases = [];
  for (let page = 1; ; page += 1) {
    const pageReleases = await githubJson(
      fetchImpl,
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      headers,
      `${repository} Releases`,
    );
    if (!Array.isArray(pageReleases)) throw new Error(`GitHub returned invalid Release metadata for ${repository}.`);
    releases.push(...pageReleases);
    if (pageReleases.length < 100) return releases;
  }
}

async function readVerifiedCache(path, asset, label) {
  try {
    const bytes = await readFile(path);
    verifyAssetDigest(bytes, asset, label);
    return bytes;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return undefined;
    if (error instanceof Error && error.message.includes('failed SHA-256 verification')) return undefined;
    throw error;
  }
}

async function obtainVerifiedAsset(fetchImpl, asset, targetPath, headers, label) {
  const cached = await readVerifiedCache(targetPath, asset, label);
  if (cached) return cached;
  if (typeof asset.browser_download_url !== 'string' || !asset.browser_download_url) {
    throw new Error(`${label} is missing its GitHub download URL.`);
  }
  const response = await fetchImpl(asset.browser_download_url, {
    headers: { ...headers, Accept: 'application/octet-stream' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Unable to download ${label} from GitHub (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  verifyAssetDigest(bytes, asset, label);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, bytes);
  return bytes;
}

function validateConfigurationMarkers(source, label) {
  for (const marker of ['/* JOYSTICK_CONFIG_START */', '/* JOYSTICK_CONFIG_END */']) {
    if (!source.includes(marker)) throw new Error(`${label} is missing required installer marker: ${marker}`);
  }
}

function validateJavaScriptFile(path, label) {
  try {
    execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
  } catch (error) {
    const details = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr).trim()
      : String(error);
    throw new Error(`${label} failed JavaScript syntax validation.${details ? ` ${details}` : ''}`);
  }
}

function macroNameFromAsset(fileName) {
  return fileName.replace(/\.js$/i, '');
}

export async function prepareReleaseCatalog({
  baseRepository,
  outputDirectory,
  repositoryVersion,
  requireCurrentRelease = false,
  localDevelopment,
  fetchImpl = fetch,
  token = '',
}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'joystick-camera-control-installer-build',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const releases = await fetchPublishedReleases(fetchImpl, baseRepository, headers);
  const stableCandidates = releases.filter((release) =>
    release && !release.draft && !release.prerelease && normalizeReleaseTag(release.tag_name) &&
    Array.isArray(release.assets) && release.assets.some((asset) => asset?.name === MANIFEST_FILE_NAME));
  const dependencyReleaseCache = new Map();
  const catalogReleases = [];

  for (const release of stableCandidates) {
    const tag = normalizeReleaseTag(release.tag_name);
    const label = `${baseRepository} ${release.tag_name}`;
    const manifestAsset = findExactReleaseAsset(release, MANIFEST_FILE_NAME, label);
    const manifestPath = releaseAssetPath(tag, MANIFEST_FILE_NAME);
    const manifestBytes = await obtainVerifiedAsset(
      fetchImpl,
      manifestAsset,
      resolve(outputDirectory, manifestPath),
      headers,
      `${label} ${MANIFEST_FILE_NAME}`,
    );
    let rawManifest;
    try {
      rawManifest = JSON.parse(manifestBytes.toString('utf8'));
    } catch {
      throw new Error(`${label} ${MANIFEST_FILE_NAME} is not valid JSON.`);
    }
    const manifest = parseSimpleReleaseManifest(rawManifest, `${label} ${MANIFEST_FILE_NAME}`);

    const macroAsset = findExactReleaseAsset(release, manifest.macro, label);
    const macroPath = releaseAssetPath(tag, manifest.macro);
    const macroBytes = await obtainVerifiedAsset(
      fetchImpl,
      macroAsset,
      resolve(outputDirectory, macroPath),
      headers,
      `${label} ${manifest.macro}`,
    );
    validateConfigurationMarkers(macroBytes.toString('utf8'), `${label} ${manifest.macro}`);
    validateJavaScriptFile(resolve(outputDirectory, macroPath), `${label} ${manifest.macro}`);

    const dependencies = [];
    for (const dependency of manifest.dependencies) {
      const cacheKey = `${dependency.repo}@${dependency.release}`;
      let dependencyRelease = dependencyReleaseCache.get(cacheKey);
      if (!dependencyRelease) {
        dependencyRelease = await githubJson(
          fetchImpl,
          `https://api.github.com/repos/${dependency.repo}/releases/tags/${encodeURIComponent(dependency.release)}`,
          headers,
          `${dependency.repo} ${dependency.release}`,
        );
        if (dependencyRelease.draft || dependencyRelease.prerelease) {
          throw new Error(`${dependency.repo} ${dependency.release} must be a published stable Release.`);
        }
        dependencyReleaseCache.set(cacheKey, dependencyRelease);
      }
      const dependencyLabel = `${dependency.repo} ${dependency.release}`;
      const dependencyAsset = findExactReleaseAsset(dependencyRelease, dependency.asset, dependencyLabel);
      const dependencyPath = releaseAssetPath(
        tag,
        'dependencies',
        dependency.repo.replace('/', '--'),
        dependency.release,
        dependency.asset,
      );
      await obtainVerifiedAsset(
        fetchImpl,
        dependencyAsset,
        resolve(outputDirectory, dependencyPath),
        headers,
        `${dependencyLabel} ${dependency.asset}`,
      );
      validateJavaScriptFile(resolve(outputDirectory, dependencyPath), `${dependencyLabel} ${dependency.asset}`);
      dependencies.push({
        repo: dependency.repo,
        release: dependency.release,
        fileName: dependency.asset,
        macroName: macroNameFromAsset(dependency.asset),
        sha256: githubAssetDigest(dependencyAsset, `${dependencyLabel} ${dependency.asset}`),
        path: dependencyPath,
      });
    }

    catalogReleases.push({
      tag,
      publishedAt: release.published_at,
      releaseUrl: release.html_url,
      macro: {
        fileName: manifest.macro,
        macroName: BASE_MACRO_NAME,
        sha256: githubAssetDigest(macroAsset, `${label} ${manifest.macro}`),
        path: macroPath,
      },
      dependencies,
    });
  }

  catalogReleases.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
  const latestRelease = catalogReleases[0];
  if (!latestRelease) {
    throw new Error(`${baseRepository} has no compatible published stable Releases with ${MANIFEST_FILE_NAME}.`);
  }
  if (requireCurrentRelease && latestRelease.tag !== repositoryVersion) {
    throw new Error(
      `Repository macro ${repositoryVersion} does not match the latest compatible published Release ${latestRelease.tag}.`,
    );
  }

  let localDevelopmentEntry;
  if (localDevelopment) {
    if (typeof localDevelopment.macroSource !== 'string' || !localDevelopment.macroSource) {
      throw new Error('Local development macro source must be a non-empty string.');
    }
    const manifest = parseSimpleReleaseManifest(localDevelopment.manifest, 'Local development manifest');
    validateConfigurationMarkers(localDevelopment.macroSource, 'Local development macro');
    const localMacroPath = ['local-development', manifest.macro].join('/');
    await mkdir(dirname(resolve(outputDirectory, localMacroPath)), { recursive: true });
    await writeFile(resolve(outputDirectory, localMacroPath), localDevelopment.macroSource);
    validateJavaScriptFile(resolve(outputDirectory, localMacroPath), 'Local development macro');

    const dependencies = [];
    for (const dependency of manifest.dependencies) {
      const packagedDependency = catalogReleases
        .flatMap((release) => release.dependencies)
        .find((candidate) =>
          candidate.repo === dependency.repo &&
          candidate.release === dependency.release &&
          candidate.fileName === dependency.asset);
      if (packagedDependency) {
        dependencies.push({ ...packagedDependency });
        continue;
      }

      const cacheKey = `${dependency.repo}@${dependency.release}`;
      let dependencyRelease = dependencyReleaseCache.get(cacheKey);
      if (!dependencyRelease) {
        dependencyRelease = await githubJson(
          fetchImpl,
          `https://api.github.com/repos/${dependency.repo}/releases/tags/${encodeURIComponent(dependency.release)}`,
          headers,
          `${dependency.repo} ${dependency.release}`,
        );
        if (dependencyRelease.draft || dependencyRelease.prerelease) {
          throw new Error(`${dependency.repo} ${dependency.release} must be a published stable Release.`);
        }
        dependencyReleaseCache.set(cacheKey, dependencyRelease);
      }
      const dependencyLabel = `${dependency.repo} ${dependency.release}`;
      const dependencyAsset = findExactReleaseAsset(dependencyRelease, dependency.asset, dependencyLabel);
      const dependencyPath = [
        'local-development',
        'dependencies',
        dependency.repo.replace('/', '--'),
        dependency.release,
        dependency.asset,
      ].join('/');
      await obtainVerifiedAsset(
        fetchImpl,
        dependencyAsset,
        resolve(outputDirectory, dependencyPath),
        headers,
        `${dependencyLabel} ${dependency.asset}`,
      );
      validateJavaScriptFile(resolve(outputDirectory, dependencyPath), `${dependencyLabel} ${dependency.asset}`);
      dependencies.push({
        repo: dependency.repo,
        release: dependency.release,
        fileName: dependency.asset,
        macroName: macroNameFromAsset(dependency.asset),
        sha256: githubAssetDigest(dependencyAsset, `${dependencyLabel} ${dependency.asset}`),
        path: dependencyPath,
      });
    }

    localDevelopmentEntry = {
      macroVersion: repositoryVersion,
      macro: {
        fileName: manifest.macro,
        macroName: BASE_MACRO_NAME,
        sha256: sha256(localDevelopment.macroSource),
        path: localMacroPath,
      },
      dependencies,
    };
  }

  const catalog = {
    version: CATALOG_VERSION,
    repositoryVersion,
    latest: latestRelease.tag,
    releases: catalogReleases,
    ...(localDevelopmentEntry ? { localDevelopment: localDevelopmentEntry } : {}),
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, 'release-catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
}
