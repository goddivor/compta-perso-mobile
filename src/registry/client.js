// Registry client: countries, currencies, operators and SVGs of the public
// compta-perso-registry, kept in a local cache so the app works offline.
//
// Live updates (workspace docs/registry-v2.md §5): every registry release
// publishes a manifest (index.json: schema, tag, commit, sha256 of every
// data file). checkRegistry() reads it, downloads from jsDelivr at the
// manifest's commit every data file the app uses whose sha256 changed,
// checks each download against the manifest, and swaps it in memory
// (subscribers re-read). Logos are cached by their `logo.sha256`, fetched at
// the commit of the data file that described them and checked against it.
// A failed or offline check is silent: the cache stays.
//
// Cache layout under documentDirectory/registry/ (no per-tag directory):
//   cache/<path with / as _>   data files (sha in meta.json) and other SVGs
//   logos/<sha256>.svg         operator logos, content-addressed
//   meta.json                  last manifest, cached shas and the ref each
//                              cached data file came from, last check time
//   v1.2.0/                    cache of app 2.0.3 and older (legacy): read as
//                              a fallback until the v2 files are downloaded,
//                              then its logos and flags move over and it is
//                              removed
// Every write goes to a temporary file, then is renamed over the target:
// a failed download never leaves a half-written cache file.
//
// Errors: a rejected promise with err.code = 'offline' (no cache and no
// network) or 'not_found' (HTTP 404, not in the manifest, or a download that
// does not match its sha256: content at a fixed commit never changes, so it
// is not retried).
import * as FileSystem from 'expo-file-system/legacy'
import { sha256 } from './sha256'

export const MANIFEST_SCHEMA = 1 // highest manifest schema this app reads
const MANIFEST = 'https://github.com/goddivor/compta-perso-registry/releases/latest/download/index.json'
const CDN = 'https://cdn.jsdelivr.net/gh/goddivor/compta-perso-registry@'
// Debug builds only (stripped from release builds, where __DEV__ is false):
// EXPO_PUBLIC_REGISTRY_MANIFEST_URL and EXPO_PUBLIC_REGISTRY_FILES_URL point
// the client at a local copy of the registry to test an update.
const DEV_MANIFEST = __DEV__ ? process.env.EXPO_PUBLIC_REGISTRY_MANIFEST_URL : undefined
const DEV_FILES = __DEV__ ? process.env.EXPO_PUBLIC_REGISTRY_FILES_URL : undefined
const MANIFEST_URL = DEV_MANIFEST || MANIFEST

// Ref read when no manifest was ever reached (files then come unchecked and
// are replaced by the next successful check)
export const REGISTRY_TAG = 'v2.0.0'
export const REGISTRY_BASE = `${CDN}${REGISTRY_TAG}/`
const fileUrl = (ref, path) => (DEV_FILES ? DEV_FILES.replace(/\/?$/, '/') : `${CDN}${ref}/`) + path

const ROOT = `${FileSystem.documentDirectory}registry/`
const CACHE_DIR = `${ROOT}cache/`
const LOGO_DIR = `${ROOT}logos/`
const LEGACY_DIR = `${ROOT}v1.2.0/`
const OLDER_DIRS = [`${ROOT}v1.0.0/`, `${ROOT}v1.1.0/`] // caches of app 2.0.0 and 2.0.1, never read
const META_URI = `${ROOT}meta.json`
// Whole-transfer timeouts (fetch has no progress event): the manifest is
// tiny; an operator file reaches 500 KB, on a cold CDN edge and a slow link
const MANIFEST_TIMEOUT_MS = 15000
const FILE_TIMEOUT_MS = 60000
const RETRY_AFTER_FAIL_MS = 60 * 1000
export const CHECK_INTERVAL_MS = 15 * 60 * 1000 // focus of an operator screen
export const STARTUP_INTERVAL_MS = 24 * 60 * 60 * 1000 // app start

// Files every check keeps fresh, besides the profile country's operators
const GLOBAL_FILES = ['data/countries.json', 'data/currencies.json', 'data/international.json']

const memory = new Map() // path → Promise<string>
const values = new Map() // path → parsed value (sync peek once loaded)

const flat = (path) => path.replace(/[^\w.-]+/g, '_')
const cacheUri = (path) => CACHE_DIR + flat(path)
const legacyUri = (path) => LEGACY_DIR + flat(path) // same naming as app ≤ 2.0.3
const logoUri = (sha) => `${LOGO_DIR}${sha}.svg`
const isData = (path) => path.startsWith('data/')
const devWarn = (...a) => { if (__DEV__) console.warn(...a) }
const fail = (code, message) => Object.assign(new Error(message), { code })

/* ------------------------------ change events ----------------------------- */

const listeners = new Set()
let revision = 0
// fn(paths) after each check that reached the manifest, with the paths it
// swapped in ([] when none); returns the unsubscribe
export function subscribeRegistry(fn) { listeners.add(fn); return () => listeners.delete(fn) }
// Increases after each such check (React hooks re-read)
export const getRegistryRevision = () => revision
function emit(paths) {
  revision++
  for (const fn of [...listeners]) { try { fn(paths) } catch (e) { devWarn('registry listener failed', e) } }
}

// Network activity (a check or a download is running): the thin progress
// line of the operator search fields
const busyListeners = new Set()
let busy = 0
export const isRegistryBusy = () => busy > 0
export function subscribeRegistryBusy(fn) { busyListeners.add(fn); return () => busyListeners.delete(fn) }
function setBusy(delta) {
  const was = busy > 0
  busy = Math.max(0, busy + delta)
  if (was !== busy > 0) for (const fn of [...busyListeners]) fn()
}
async function whileBusy(work) {
  setBusy(1)
  try { return await work() } finally { setBusy(-1) }
}

/* ---------------------------------- files --------------------------------- */

async function readFile(uri) {
  try {
    const info = await FileSystem.getInfoAsync(uri)
    return info.exists ? await FileSystem.readAsStringAsync(uri) : null
  } catch (e) {
    devWarn('registry cache read failed', uri, e?.message)
    return null
  }
}

// A data file from a cache, or null when it is missing or does not parse
// (a truncated file from an older app): the caller falls through to the
// next source instead of failing on it forever. The parse is kept for
// getJson, so a 500 KB operator file is not parsed twice.
const parsed = new Map() // path → [text, value] of the last cache read
async function readData(uri, path) {
  const text = await readFile(uri)
  if (text == null) return null
  try {
    const value = JSON.parse(text)
    if (path) parsed.set(path, [text, value])
    return text
  } catch {
    devWarn('registry cache file unreadable, skipped', uri)
    return null
  }
}
const readSource = (uri, path) => (isData(path) ? readData(uri, path) : readFile(uri))

// Temporary file (unique name: two writers of one file never share it),
// then a rename over the target (atomic on Android). Writes to one target
// run one after the other.
const SESSION_START = Date.now()
let tmpSeq = 0
const writing = new Map() // uri → Promise of the last write
function writeAtomic(dir, uri, text) {
  const run = async () => {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {})
    const tmp = `${uri}.${Date.now()}-${++tmpSeq}.tmp`
    await FileSystem.writeAsStringAsync(tmp, text)
    try {
      await FileSystem.moveAsync({ from: tmp, to: uri })
    } catch {
      await FileSystem.deleteAsync(uri, { idempotent: true })
      await FileSystem.moveAsync({ from: tmp, to: uri })
    }
  }
  const p = (writing.get(uri) || Promise.resolve()).catch(() => {}).then(run)
  writing.set(uri, p)
  p.finally(() => { if (writing.get(uri) === p) writing.delete(uri) }).catch(() => {})
  return p
}

// Temporary files left by a write that an earlier session never finished
// (app killed between write and rename). Only names stamped before this
// session started: a write of this session is never touched.
async function cleanStaleTmp() {
  for (const dir of [ROOT, CACHE_DIR, LOGO_DIR]) {
    let names = []
    try { names = await FileSystem.readDirectoryAsync(dir) } catch { continue }
    for (const n of names) {
      const m = /\.(\d+)-\d+\.tmp$/.exec(n)
      if (m && Number(m[1]) < SESSION_START) await FileSystem.deleteAsync(dir + n, { idempotent: true }).catch(() => {})
    }
  }
}

async function fetchText(url, label, timeoutMs = FILE_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (res.status === 404) throw fail('not_found', `registry: ${label} not found`)
    if (!res.ok) throw fail('offline', `registry: HTTP ${res.status} for ${label}`)
    return await res.text()
  } catch (e) {
    if (e.code) throw e
    throw fail('offline', `registry: cannot reach ${label} (${e.message})`)
  } finally {
    clearTimeout(timer)
  }
}

// A registry file at a ref, checked against its sha256 when one is known.
// One request per file and ref at a time: a lazy read and a check that
// want the same file share it (two parallel 500 KB downloads on a slow
// link made both time out).
// At most MAX_PARALLEL file requests run at once, the others wait their
// turn: each timeout starts with its own request, so a screen of logos and
// a 500 KB operator file no longer starve one another into timeouts.
const MAX_PARALLEL = 4
let active = 0
const waiting = []
// A finished request hands its slot straight to the next waiter (`active`
// stays the same): a caller arriving before the waiter resumes cannot take
// the slot too and push the count above MAX_PARALLEL.
async function limited(work) {
  if (active >= MAX_PARALLEL) await new Promise((resolve) => waiting.push(resolve))
  else active++
  try { return await work() } finally {
    const next = waiting.shift()
    if (next) next()
    else active--
  }
}
const downloading = new Map() // `${ref}|${path}` → Promise<string>
function download(path, ref, sha) {
  const key = `${ref}|${path}`
  if (!downloading.has(key)) {
    const p = whileBusy(() => limited(() => fetchText(fileUrl(ref, path), path)))
    downloading.set(key, p)
    p.finally(() => downloading.delete(key)).catch(() => {})
  }
  return downloading.get(key).then((text) => {
    if (sha && sha256(text) !== sha) throw fail('not_found', `registry: ${path} at ${ref} does not match its sha256`)
    if (isData(path)) JSON.parse(text) // a truncated file never reaches the cache
    return text
  })
}

/* ---------------------------------- meta ---------------------------------- */

// { commit, tag, files: { path: sha } (last manifest), cached: { path: sha|null },
//   cachedRef: { path: commit or tag the cached data file was downloaded at }, lastCheck }
let metaPromise = null
function loadMeta() {
  if (!metaPromise) {
    metaPromise = readFile(META_URI).then((text) => {
      let m = null
      try { m = text ? JSON.parse(text) : null } catch { m = null }
      const meta = { commit: null, tag: null, files: {}, cached: {}, lastCheck: 0, ...(m || {}) }
      if (!meta.cachedRef) {
        // meta of app 2.1.0 (no refs yet): a cached file that matches the
        // saved manifest came from the saved commit
        meta.cachedRef = {}
        for (const [path, sha] of Object.entries(meta.cached)) {
          if (meta.commit && sha && meta.files[path] === sha) meta.cachedRef[path] = meta.commit
        }
      }
      return meta
    })
    cleanStaleTmp().catch((e) => devWarn('registry tmp cleanup failed', e?.message))
  }
  return metaPromise
}

// Ref to fetch the logos a data file describes at: the commit that file was
// downloaded at. A file whose ref is unknown (cached by app 2.1.0 and
// already behind its manifest) falls back to the manifest's commit: a logo
// that does not match there fails once for the session, and the next
// complete check replaces the file.
function dataRef(meta, source) {
  if (source && meta.cachedRef[source]) return meta.cachedRef[source]
  return meta.commit || REGISTRY_TAG
}
async function saveMeta(meta) {
  try { await writeAtomic(ROOT, META_URI, JSON.stringify(meta)) } catch (e) { devWarn('registry meta write failed', e?.message) }
}

/* -------------------------------- manifest -------------------------------- */

// The latest manifest, or { unsupported: true } for a schema above ours
async function fetchManifest() {
  const m = JSON.parse(await whileBusy(() => fetchText(MANIFEST_URL, 'index.json', MANIFEST_TIMEOUT_MS)))
  if (!m || typeof m.schema !== 'number') throw fail('offline', 'registry: invalid manifest')
  if (m.schema > MANIFEST_SCHEMA) return { unsupported: true }
  if (typeof m.commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(m.commit) || !m.files || typeof m.files !== 'object') {
    throw fail('offline', 'registry: invalid manifest')
  }
  return m
}

// Reads the manifest into meta once per session when none is known yet
// (fresh install), so a first download is already checked
let manifestOnce = null
async function ensureManifest(meta) {
  if (meta.commit) return
  if (!manifestOnce) {
    manifestOnce = fetchManifest()
      .then((m) => { if (!m.unsupported) Object.assign(meta, { commit: m.commit, tag: m.tag, files: m.files }) })
      .catch((e) => { manifestOnce = null; devWarn('registry manifest unreachable', e?.message) })
  }
  await manifestOnce
}

/* ------------------------------- data + SVGs ------------------------------- */

// Raw text of a registry file ('data/countries.json', 'svg/flags/1x1/tg.svg'…).
// The v2 cache, then the legacy cache (until the first complete check
// replaces it), then the network.
export function getText(path) {
  if (!memory.has(path)) {
    const p = (async () => {
      const cached = await readSource(cacheUri(path), path)
      if (cached != null) return cached
      const legacy = await readSource(legacyUri(path), path)
      if (legacy != null) return legacy
      const meta = await loadMeta()
      if (isData(path)) await ensureManifest(meta)
      if (isData(path) && meta.commit && !meta.files[path]) throw fail('not_found', `registry: ${path} not in the manifest`)
      const ref = meta.commit || REGISTRY_TAG
      const text = await download(path, ref, isData(path) ? meta.files[path] : null)
      try {
        await writeAtomic(CACHE_DIR, cacheUri(path), text)
        if (isData(path)) {
          meta.cached[path] = (meta.commit && meta.files[path]) || null
          meta.cachedRef[path] = ref
          await saveMeta(meta)
        }
      } catch (e) {
        devWarn('registry cache write failed', path, e?.message)
      }
      return text
    })()
    memory.set(path, p)
    p.catch(() => memory.delete(path)) // let a later call retry
  }
  return memory.get(path)
}

// SVG of an operator logo: cached by its sha256 (re-downloaded when the sha
// changes, checked against it). A logo without a sha (legacy data) is cached
// by path. A copy cached by path (legacy cache, or moved from it) serves
// when its hash matches; when the download fails, any copy of that path
// still beats a monogram.
//   source: the data file that described the logo ('data/operators/NG.json',
//   'data/international.json'); the logo is fetched at that file's commit,
//   where its sha is the one the file carries. A logo that does not match
//   its sha there fails as not_found for the rest of the session.
export function getLogoText(path, sha, source) {
  if (!sha) return getText(path)
  const key = `logo:${sha}`
  if (!memory.has(key)) {
    const p = (async () => {
      const cached = await readFile(logoUri(sha))
      if (cached != null) return cached
      const byPath = (await readFile(cacheUri(path))) ?? (await readFile(legacyUri(path)))
      let text
      if (byPath != null && sha256(byPath) === sha) {
        text = byPath
      } else {
        const meta = await loadMeta()
        try {
          text = await download(path, dataRef(meta, source), sha)
        } catch (e) {
          if (byPath == null) throw e
          return byPath // older logo, not cached under the new sha: retried next session
        }
      }
      try { await writeAtomic(LOGO_DIR, logoUri(sha), text) } catch (e) { devWarn('registry logo write failed', path, e?.message) }
      return text
    })()
    memory.set(key, p)
    // let a later call retry, except a logo that does not match its sha at
    // its file's commit: that never changes, so it stays failed this session
    p.catch((e) => { if (e?.code !== 'not_found') memory.delete(key) })
  }
  return memory.get(key)
}

// Raw text of a registry file from memory or the file caches only, never
// the network: null when it was never downloaded (fast, offline-safe boot).
export async function getCachedText(path) {
  if (memory.has(path)) return memory.get(path)
  const cached = await readSource(cacheUri(path), path)
  if (cached != null) return cached
  return readSource(legacyUri(path), path)
}

// Each swap by a check bumps the path's version: a read that started before
// the swap returns the newer value instead of overwriting it with the old one
const versions = new Map() // path → number
function parseInto(path, version, text) {
  if ((versions.get(path) || 0) !== version && values.has(path)) return values.get(path)
  const pre = parsed.get(path)
  parsed.delete(path)
  const v = pre && pre[0] === text ? pre[1] : JSON.parse(text)
  values.set(path, v)
  return v
}

// Parsed JSON of a cached registry file, or null (see getCachedText)
export async function getCachedJson(path) {
  if (values.has(path)) return values.get(path)
  const version = versions.get(path) || 0
  const text = await getCachedText(path)
  if (text == null) return values.get(path) ?? null
  return parseInto(path, version, text)
}

// Parsed JSON of a registry file (cached parse)
export async function getJson(path) {
  if (values.has(path)) return values.get(path)
  const version = versions.get(path) || 0
  return parseInto(path, version, await getText(path))
}

// Synchronous read of something already loaded (undefined otherwise)
export const peek = (path) => values.get(path)
export const remember = (path, value) => values.set(path, value)

/* ---------------------------------- check --------------------------------- */

let lastFailAt = 0
let running = null

async function cachedDataPaths(dir) {
  try {
    const names = await FileSystem.readDirectoryAsync(dir)
    return names
      .filter((n) => /^data_.*\.json$/.test(n))
      .map((n) => (n.startsWith('data_operators_') ? `data/operators/${n.slice(15)}` : `data/${n.slice(5)}`))
  } catch {
    return []
  }
}

// SVG art each entry of a data file points to (flags and currency signs
// carry no sha256): [key, art object, [svg paths]]
const ART = {
  'data/countries.json': (v) => (v?.countries || []).map((c) => [c.iso2, c.flag, [c.flag?.svg, c.flag?.svgSquare]]),
  'data/currencies.json': (v) => (v?.currencies || []).map((c) => [c.code, c.sign, [c.sign?.svg, c.sign?.svgColor]]),
}
function artOf(path, value) {
  const out = new Map()
  for (const [key, art, paths] of ART[path](value)) out.set(key, { art: JSON.stringify(art ?? null), paths: paths.filter(Boolean) })
  return out
}

// After a countries or currencies swap: drops only the cached SVGs of the
// entries whose art changed or vanished (fetched again on demand). Every
// other flag and sign stays cached, so they still show offline.
async function dropChangedArt(path, before, after) {
  if (!ART[path] || !before) return
  const next = artOf(path, after)
  const stale = new Set()
  for (const [key, old] of artOf(path, before)) {
    const now = next.get(key)
    if (!now || now.art !== old.art) for (const p of [...old.paths, ...(now?.paths || [])]) stale.add(p)
  }
  for (const p of stale) {
    memory.delete(p)
    await FileSystem.deleteAsync(cacheUri(p), { idempotent: true }).catch(() => {})
  }
}

// Parsed value of a data file as cached before a swap (null when unknown)
async function previousValue(path) {
  if (values.has(path)) return values.get(path)
  const text = (await readData(cacheUri(path))) ?? (await readData(legacyUri(path)))
  try { return text == null ? null : JSON.parse(text) } catch { return null }
}

// Once the v2 files are in: the legacy cache's logos and flags move to the
// path cache (a rename, no hashing at start-up: a logo is checked against
// its sha the first time it is shown), then the legacy directories go
async function retireLegacy() {
  for (const dir of OLDER_DIRS) await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {})
  const info = await FileSystem.getInfoAsync(LEGACY_DIR).catch(() => ({ exists: false }))
  if (!info.exists) return
  try {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => {})
    for (const n of await FileSystem.readDirectoryAsync(LEGACY_DIR)) {
      if (!n.startsWith('svg_logos_') && !n.startsWith('svg_flags_')) continue
      const to = CACHE_DIR + n
      if (!(await FileSystem.getInfoAsync(to)).exists) await FileSystem.moveAsync({ from: LEGACY_DIR + n, to })
    }
    await FileSystem.deleteAsync(LEGACY_DIR, { idempotent: true })
  } catch (e) {
    devWarn('registry legacy cleanup failed', e?.message) // retried after the next check
  }
}

async function runCheck(iso2) {
  const meta = await loadMeta()
  const m = await fetchManifest()
  const now = Date.now()
  if (m.unsupported) {
    meta.lastCheck = now
    await saveMeta(meta)
    return []
  }
  // the manifest moves on even if a download below fails: each cached file
  // keeps its own ref in meta.cachedRef, and its logos are fetched there
  Object.assign(meta, { commit: m.commit, tag: m.tag, files: m.files })
  const targets = new Set([
    ...GLOBAL_FILES,
    ...(iso2 ? [`data/operators/${String(iso2).toUpperCase()}.json`] : []),
    ...Object.keys(meta.cached),
    ...(await cachedDataPaths(CACHE_DIR)),
    ...(await cachedDataPaths(LEGACY_DIR)),
  ])
  const changed = []
  let failed = false
  for (const path of targets) {
    const sha = m.files[path]
    if (!sha || meta.cached[path] === sha) continue
    try {
      const text = await download(path, m.commit, sha)
      const before = ART[path] ? await previousValue(path) : null
      await writeAtomic(CACHE_DIR, cacheUri(path), text)
      meta.cached[path] = sha
      meta.cachedRef[path] = m.commit
      memory.set(path, Promise.resolve(text))
      const value = JSON.parse(text)
      versions.set(path, (versions.get(path) || 0) + 1)
      values.set(path, value)
      changed.push(path)
      await dropChangedArt(path, before, value)
    } catch (e) {
      failed = true
      devWarn('registry update failed', path, e?.message)
    }
  }
  if (!failed) {
    meta.lastCheck = now
    await retireLegacy()
  } else {
    lastFailAt = now
  }
  await saveMeta(meta)
  emit(changed) // also when nothing changed: a hook that failed reads again
  return changed
}

// Checks the release manifest and swaps in every changed file the app uses
// (the profile country's operators, countries, currencies, international
// services, any other cached file). Runs in the background, never throws.
//   iso2: the profile country; minInterval: skip when the last successful
//   check is more recent (15 min on focus, 24 h at start-up).
// Resolves to the paths that changed ([] when skipped, offline or failed).
export function checkRegistry({ iso2, minInterval = CHECK_INTERVAL_MS } = {}) {
  if (running) return running
  running = (async () => {
    const meta = await loadMeta()
    const now = Date.now()
    if (now - (meta.lastCheck || 0) < minInterval || now - lastFailAt < RETRY_AFTER_FAIL_MS) return []
    return whileBusy(() => runCheck(iso2)) // one progress line for the whole check
  })()
    .catch((e) => {
      lastFailAt = Date.now()
      devWarn('registry check failed', e?.message)
      return []
    })
    .finally(() => { running = null })
  return running
}
