// In-app APK download + install (Aniyomi style): the app downloads the
// release APK itself into its cache, then hands it to the Android package
// installer through a content:// URI — no browser involved.
// Requires android.permission.REQUEST_INSTALL_PACKAGES (AndroidManifest).
import * as FileSystem from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'
import { Linking } from 'react-native'

const APK_FILE = 'compta-perso-update.apk'
// Intent.FLAG_GRANT_READ_URI_PERMISSION
const FLAG_GRANT_READ_URI_PERMISSION = 1

export function apkFileUri() {
  return FileSystem.cacheDirectory + APK_FILE
}

// Download the APK to the cache directory. onProgress receives 0..1.
// Returns { uri, cancel } — await `promise`; call `cancel()` to abort.
export function createApkDownload(url, onProgress) {
  const fileUri = apkFileUri()
  const resumable = FileSystem.createDownloadResumable(
    url,
    fileUri,
    {},
    (p) => {
      if (onProgress && p.totalBytesExpectedToWrite > 0) {
        onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite)
      }
    }
  )

  const promise = (async () => {
    // Remove any stale file from a previous attempt
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {})
    const result = await resumable.downloadAsync()
    // `undefined` result means the download was cancelled
    if (!result) return null
    if (result.status && result.status !== 200) {
      throw new Error(`HTTP ${result.status}`)
    }
    return result.uri
  })()

  return {
    promise,
    cancel: async () => {
      try {
        await resumable.cancelAsync()
      } catch {}
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {})
    },
  }
}

// Simple one-shot variant: resolves with the local file URI (or null if
// cancelled), rejects on network error.
export async function downloadApk(url, onProgress) {
  return createApkDownload(url, onProgress).promise
}

// Open the Android package installer over the app for the downloaded APK.
// Falls back to a VIEW intent, then (last resort) to the release page URL.
export async function installApk(fileUri, fallbackPageUrl) {
  const contentUri = await FileSystem.getContentUriAsync(fileUri)
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
      data: contentUri,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    })
    return true
  } catch {}
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: 'application/vnd.android.package-archive',
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    })
    return true
  } catch {}
  // Last resort: open the release page in the browser
  if (fallbackPageUrl) {
    await Linking.openURL(fallbackPageUrl).catch(() => {})
  }
  return false
}
