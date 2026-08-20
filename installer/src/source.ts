import { parseConfiguratorStateFromMacro } from './config';
import type { ConfiguratorState } from './model';

export interface ReleaseCatalogAsset {
  fileName: string;
  macroName: string;
  sha256: string;
  path: string;
}

export interface ReleaseCatalogDependency extends ReleaseCatalogAsset {
  repo: string;
  release: string;
}

export interface ReleaseCatalogEntry {
  tag: string;
  publishedAt: string;
  releaseUrl: string;
  macro: ReleaseCatalogAsset;
  dependencies: ReleaseCatalogDependency[];
}

export interface ReleaseCatalog {
  version: 1;
  repositoryVersion: string;
  latest: string;
  releases: ReleaseCatalogEntry[];
}

export interface InstallerDependencySource {
  manifest: ReleaseCatalogDependency;
  source: string;
}

export interface InstallerSources {
  release: ReleaseCatalogEntry;
  macroTemplate: string;
  dependencies: InstallerDependencySource[];
}

export type MacroSourceOrigin = 'fresh' | 'upload' | 'device';
export type MacroReleaseRecognition = 'fresh' | 'current' | 'older' | 'unknown' | 'unavailable';

export interface MacroReleaseResolution {
  origin: MacroSourceOrigin;
  recognition: MacroReleaseRecognition;
  detectedTag?: string;
  targetTag?: string;
  targetChosenExplicitly: boolean;
}

export interface IngestedMacroSource {
  state: ConfiguratorState;
  release: MacroReleaseResolution;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function requireSha256(value: unknown, label: string): string {
  const digest = requireString(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`${label} must be a SHA-256 digest.`);
  return digest;
}

function requireSameOriginPath(value: unknown, label: string): string {
  const path = requireString(value, label);
  if (path.startsWith('/') || path.includes('..') || /^https?:/i.test(path)) {
    throw new Error(`${label} must be a packaged same-origin path.`);
  }
  return path;
}

function parseCatalogAsset(value: unknown, label: string): ReleaseCatalogAsset {
  const asset = requireObject(value, label);
  return {
    fileName: requireString(asset.fileName, `${label} fileName`),
    macroName: requireString(asset.macroName, `${label} macroName`),
    sha256: requireSha256(asset.sha256, `${label} sha256`),
    path: requireSameOriginPath(asset.path, `${label} path`),
  };
}

export function normalizeReleaseTag(value: string): string | undefined {
  const match = value.trim().match(/^v?(\d+\.\d+\.\d+)$/i);
  return match ? `v${match[1]}` : undefined;
}

export function parseReleaseCatalog(value: unknown): ReleaseCatalog {
  const catalog = requireObject(value, 'Release catalog');
  if (catalog.version !== 1) throw new Error('Release catalog version must be 1.');
  const repositoryVersion = normalizeReleaseTag(requireString(catalog.repositoryVersion, 'Release catalog repositoryVersion'));
  const latest = normalizeReleaseTag(requireString(catalog.latest, 'Release catalog latest'));
  if (!repositoryVersion || !latest) throw new Error('Release catalog versions must use semantic Release tags.');
  if (!Array.isArray(catalog.releases) || catalog.releases.length === 0) {
    throw new Error('Release catalog must contain at least one Release.');
  }
  const releases = catalog.releases.map((candidate, index): ReleaseCatalogEntry => {
    const release = requireObject(candidate, `Release catalog entry ${index + 1}`);
    const tag = normalizeReleaseTag(requireString(release.tag, `Release catalog entry ${index + 1} tag`));
    if (!tag) throw new Error(`Release catalog entry ${index + 1} tag must be semantic.`);
    if (!Array.isArray(release.dependencies) || release.dependencies.length === 0) {
      throw new Error(`Release catalog entry ${tag} must contain at least one dependency.`);
    }
    return {
      tag,
      publishedAt: requireString(release.publishedAt, `Release catalog entry ${tag} publishedAt`),
      releaseUrl: requireString(release.releaseUrl, `Release catalog entry ${tag} releaseUrl`),
      macro: parseCatalogAsset(release.macro, `Release catalog entry ${tag} macro`),
      dependencies: release.dependencies.map((dependencyCandidate, dependencyIndex) => {
        const dependency = requireObject(
          dependencyCandidate,
          `Release catalog entry ${tag} dependency ${dependencyIndex + 1}`,
        );
        return {
          ...parseCatalogAsset(dependency, `Release catalog entry ${tag} dependency ${dependencyIndex + 1}`),
          repo: requireString(dependency.repo, `Release catalog entry ${tag} dependency ${dependencyIndex + 1} repo`),
          release: requireString(dependency.release, `Release catalog entry ${tag} dependency ${dependencyIndex + 1} release`),
        };
      }),
    };
  });
  if (new Set(releases.map((release) => release.tag)).size !== releases.length) {
    throw new Error('Release catalog contains duplicate Release tags.');
  }
  if (!releases.some((release) => release.tag === latest)) {
    throw new Error(`Release catalog latest tag ${latest} is not packaged.`);
  }
  return { version: 1, repositoryVersion, latest, releases };
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

async function loadVerifiedText(asset: ReleaseCatalogAsset, label: string): Promise<string> {
  const source = await fetchText(`./assets/${asset.path}`, label);
  if (await sha256(source) !== asset.sha256) {
    throw new Error(`${label} does not match the verified Release catalog.`);
  }
  return source;
}

export async function loadReleaseCatalog(): Promise<ReleaseCatalog> {
  const response = await fetch('./assets/release-catalog.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load the installer Release catalog.');
  return parseReleaseCatalog(await response.json());
}

export function releaseByTag(catalog: ReleaseCatalog, tag: string): ReleaseCatalogEntry | undefined {
  const normalized = normalizeReleaseTag(tag);
  return catalog.releases.find((release) => release.tag === normalized);
}

export function latestCatalogRelease(catalog: ReleaseCatalog): ReleaseCatalogEntry {
  const latest = releaseByTag(catalog, catalog.latest);
  if (!latest) throw new Error(`Latest Release ${catalog.latest} is not packaged.`);
  return latest;
}

export async function loadInstallerRelease(
  catalog: ReleaseCatalog,
  tag: string,
): Promise<InstallerSources> {
  const release = releaseByTag(catalog, tag);
  if (!release) throw new Error(`Release ${tag} is not available in this installer.`);
  const [macroTemplate, ...dependencySources] = await Promise.all([
    loadVerifiedText(release.macro, `${release.tag} macro template`),
    ...release.dependencies.map((dependency) =>
      loadVerifiedText(dependency, `${dependency.repo} ${dependency.release} dependency`)),
  ]);
  return {
    release,
    macroTemplate,
    dependencies: release.dependencies.map((manifest, index) => ({
      manifest,
      source: dependencySources[index],
    })),
  };
}

export function detectMacroReleaseVersion(source: string): string | undefined {
  const markerIndex = source.indexOf('/* JOYSTICK_CONFIG_START */');
  const header = source.slice(0, markerIndex >= 0 ? markerIndex : 16_384);
  const match = header.match(/^[ \t]*(?:\*[ \t]*)?Version:[ \t]+(v?\d+\.\d+\.\d+)[ \t]*$/im);
  return match ? normalizeReleaseTag(match[1]) : undefined;
}

export function createFreshReleaseResolution(catalog: ReleaseCatalog): MacroReleaseResolution {
  return {
    origin: 'fresh',
    recognition: 'fresh',
    targetTag: latestCatalogRelease(catalog).tag,
    targetChosenExplicitly: false,
  };
}

export function resolveMacroRelease(
  source: string,
  catalog: ReleaseCatalog,
  origin: Exclude<MacroSourceOrigin, 'fresh'>,
): MacroReleaseResolution {
  const detectedTag = detectMacroReleaseVersion(source);
  if (!detectedTag) {
    return { origin, recognition: 'unknown', targetChosenExplicitly: false };
  }
  const release = releaseByTag(catalog, detectedTag);
  if (!release) {
    return { origin, recognition: 'unavailable', detectedTag, targetChosenExplicitly: false };
  }
  return {
    origin,
    recognition: release.tag === catalog.latest ? 'current' : 'older',
    detectedTag,
    targetTag: release.tag,
    targetChosenExplicitly: false,
  };
}

export function chooseReleaseTarget(
  resolution: MacroReleaseResolution,
  catalog: ReleaseCatalog,
  tag: string,
): MacroReleaseResolution {
  const release = releaseByTag(catalog, tag);
  if (!release) throw new Error(`Release ${tag} is not available in this installer.`);
  return { ...resolution, targetTag: release.tag, targetChosenExplicitly: true };
}

export function migrateToLatestRelease(
  resolution: MacroReleaseResolution,
  catalog: ReleaseCatalog,
): MacroReleaseResolution {
  return chooseReleaseTarget(resolution, catalog, catalog.latest);
}

export function ingestMacroSource(
  source: string,
  catalog: ReleaseCatalog,
  origin: Exclude<MacroSourceOrigin, 'fresh'>,
): IngestedMacroSource {
  return {
    state: parseConfiguratorStateFromMacro(source),
    release: resolveMacroRelease(source, catalog, origin),
  };
}
