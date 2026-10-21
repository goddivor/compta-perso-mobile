// Height of the on-screen keyboard in dp (0 when hidden), so content such as
// an empty state can stay centred in the space left above it.
import { useEffect, useState } from 'react'
import { Keyboard } from 'react-native'

export function useKeyboardHeight() {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e?.endCoordinates?.height || 0))
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0))
    return () => { show.remove(); hide.remove() }
  }, [])
  return height
}
