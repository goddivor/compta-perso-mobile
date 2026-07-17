// Deferred data loading: runs the (synchronous SQLite) loader only after
// the screen focus/transition animation has finished, so navigation stays
// smooth. Exposes a light `loading` flag for the first load.
import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'

// Two rAF ticks land after the native transition has started rendering,
// then requestIdleCallback yields to any remaining animation work.
function runAfterTransition(cb) {
  let cancelled = false
  let idleHandle = null
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (cancelled) return
      idleHandle = requestIdleCallback(() => { if (!cancelled) cb() }, { timeout: 300 })
    })
  })
  return () => {
    cancelled = true
    if (idleHandle != null) cancelIdleCallback(idleHandle)
  }
}

export function useFocusData(loadFn, deps) {
  const [loading, setLoading] = useState(true)
  const loadedOnce = useRef(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loadFn, deps)

  useFocusEffect(
    useCallback(() => {
      const cancel = runAfterTransition(() => {
        load()
        loadedOnce.current = true
        setLoading(false)
      })
      return cancel
    }, [load])
  )

  return { loading: loading && !loadedOnce.current, reload: load }
}
