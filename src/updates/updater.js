// In-app update check against GitHub Releases.
// The app is distributed as an APK attached to each release of
// goddivor/compta-perso-mobile: we compare the installed version with the
// latest release tag and offer the APK download link when a newer one exists.
import { Alert, Linking } from 'react-native'
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'

const RELEASES_LATEST_URL =
  'https://api.github.com/repos/goddivor/compta-perso-mobile/releases/latest'
const DISMISSED_KEY = 'update_dismissed_version'
const FETCH_TIMEOUT_MS = 10000

// Installed version: native versionName first (real APK version), then the
// Expo config version (dev / Expo Go), then a safe default.
export function getCurrentVersion() {
  return (
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    '1.0.0'
  )
}

// Simple semver comparison ('1.2.10' > '1.2.9'). Returns -1 / 0 / 1.
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0
    const db = pb[i] || 0
    if (da !== db) return da > db ? 1 : -1
  }
  return 0
}

// Queries the latest GitHub release. Never throws: returns
// { available: false } offline or on any API error.
// Shape: { available, current, latest, notes, apkUrl, pageUrl }
export async function checkForUpdate() {
  const current = getCurrentVersion()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(RELEASES_LATEST_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return { available: false, current, latest: null }
    const release = await res.json()
    const latest = String(release.tag_name || '').replace(/^v/, '')
    if (!latest) return { available: false, current, latest: null }
    const apkAsset = (release.assets || []).find((a) => a.name?.endsWith('.apk'))
    return {
      available: compareVersions(latest, current) > 0,
      current,
      latest,
      notes: release.body || '',
      apkUrl: apkAsset?.browser_download_url || null,
      pageUrl: release.html_url || 'https://github.com/goddivor/compta-perso-mobile/releases',
    }
  } catch {
    // Offline, timeout or GitHub unavailable: fail silently
    return { available: false, current, latest: null }
  } finally {
    clearTimeout(timer)
  }
}

// Silent check on app startup: shows an Alert only when a newer version
// exists AND it has not been dismissed before (one alert per version).
export async function checkForUpdateOnStartup() {
  const info = await checkForUpdate()
  if (!info.available) return

  const dismissed = await AsyncStorage.getItem(DISMISSED_KEY).catch(() => null)
  if (dismissed === info.latest) return

  const url = info.apkUrl || info.pageUrl
  Alert.alert(
    `Mise à jour disponible (v${info.latest})`,
    'Une nouvelle version de Compta Perso est disponible. Voulez-vous la télécharger ?',
    [
      {
        text: 'Plus tard',
        style: 'cancel',
        onPress: () => AsyncStorage.setItem(DISMISSED_KEY, info.latest).catch(() => {}),
      },
      {
        text: 'Télécharger',
        onPress: () => Linking.openURL(url).catch(() => {}),
      },
    ],
  )
}
