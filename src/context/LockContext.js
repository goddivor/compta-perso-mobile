// App lock (optional, Settings › Sécurité): holds the lock settings of this
// phone (lock/store.js, secure store), locks at launch and on return to the
// app once the chosen delay has passed (time recorded on AppState
// background, compared on active; a clock moved backwards locks), and shows
// the lock screen ABOVE the navigation (a Modal over the stack and any open
// dialog), so an open form keeps its typed values. From the moment the app
// leaves the foreground until the check is done, a plain cover (background
// and app mark) hides the data, so no amount flashes on resume. The app's
// own trips outside (lock/guard.js withoutLock) never lock. « Masquer
// l'aperçu » sets FLAG_SECURE (expo-screen-capture), lock on or off.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Modal, View, StyleSheet } from 'react-native'
import { preventScreenCaptureAsync, allowScreenCaptureAsync } from 'expo-screen-capture'
import { useTheme } from '../theme/tokens'
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../lock/store'
import { lockSuspended } from '../lock/guard'
import { AppMark } from '../components/lock/LockKit'
import { UnlockFlow } from '../components/lock/UnlockFlow'

const CAPTURE_KEY = 'app-lock'

const LockContext = createContext({
  config: { ...DEFAULT_CONFIG, pinLength: 0 },
  locked: false,
  updateConfig: () => false,
  reloadConfig: () => {},
})

function safeLoad() {
  try {
    return loadConfig()
  } catch {
    return { ...DEFAULT_CONFIG, pinLength: 0 }
  }
}

export function LockProvider({ children }) {
  const { colors } = useTheme()
  const [config, setConfig] = useState(safeLoad)
  const [locked, setLocked] = useState(() => config.enabled)
  const [covered, setCovered] = useState(false)
  const cfg = useRef(config)
  cfg.current = config
  const backgroundAt = useRef(null)
  const lockBack = useRef(null) // Android back inside the lock screen (new code steps only)

  // Recent apps preview and screenshots
  useEffect(() => {
    const run = config.hidePreview ? preventScreenCaptureAsync(CAPTURE_KEY) : allowScreenCaptureAsync(CAPTURE_KEY)
    run.catch(() => {})
  }, [config.hidePreview])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const c = cfg.current
      if (state === 'background') {
        if (!c.enabled || lockSuspended()) return
        backgroundAt.current = Date.now()
        setCovered(true)
      } else if (state === 'active') {
        const at = backgroundAt.current
        backgroundAt.current = null
        if (at != null && c.enabled) {
          const elapsed = Date.now() - at
          if (elapsed < 0 || elapsed >= c.delayMs) setLocked(true)
        }
        setCovered(false)
      }
    })
    return () => sub.remove()
  }, [])

  const reloadConfig = useCallback(() => setConfig(safeLoad()), [])

  // Saves the settings; returns false when the secure store refused them
  const updateConfig = useCallback((patch) => {
    try {
      saveConfig({ ...cfg.current, ...patch })
    } catch {
      return false
    }
    setConfig(safeLoad())
    return true
  }, [])

  const unlock = useCallback(() => {
    setConfig(safeLoad())
    setLocked(false)
  }, [])

  const value = useMemo(() => ({ config, locked, updateConfig, reloadConfig }), [config, locked, updateConfig, reloadConfig])

  return (
    <LockContext.Provider value={value}>
      <View style={styles.fill}>
        {children}
        {covered || locked ? (
          <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: colors.bg }]}>
            <AppMark />
          </View>
        ) : null}
      </View>
      <Modal
        visible={locked}
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => lockBack.current?.()}
      >
        {locked ? (
          <View style={[styles.fill, { backgroundColor: colors.bg }]}>
            <UnlockFlow config={config} mode="unlock" autoFingerprint onSuccess={unlock} backRef={lockBack} />
          </View>
        ) : null}
      </Modal>
    </LockContext.Provider>
  )
}

export function useLock() {
  return useContext(LockContext)
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: { alignItems: 'center', justifyContent: 'center' },
})
