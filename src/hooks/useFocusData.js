// Deferred data loading: runs the (synchronous SQLite) loader only after
// the screen focus/transition animation has finished, so navigation stays
// smooth. Exposes a light `loading` flag for the first load.
import { useCallback, useRef, useState } from 'react'
import { InteractionManager } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

export function useFocusData(loadFn, deps) {
  const [loading, setLoading] = useState(true)
  const loadedOnce = useRef(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loadFn, deps)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      const task = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return
        load()
        loadedOnce.current = true
        setLoading(false)
      })
      return () => {
        cancelled = true
        task.cancel()
      }
    }, [load])
  )

  return { loading: loading && !loadedOnce.current, reload: load }
}
