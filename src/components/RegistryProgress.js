// Thin indeterminate progress line along the bottom edge of an operator
// search field while the registry checks for an update or downloads a file
// (contract: no dialog, no text). Place it inside the field's container.
// With "reduce motion" on, the line stays still.
import { useEffect, useRef, useState } from 'react'
import { View, Animated, Easing, AccessibilityInfo, StyleSheet } from 'react-native'
import { useTheme } from '../theme/tokens'
import { useRegistryBusy } from '../registry'

export function RegistryProgress({ inset = 24 }) {
  const { colors } = useTheme()
  const busy = useRegistryBusy()
  const [width, setWidth] = useState(0)
  const [still, setStill] = useState(false)
  const x = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setStill(v) }).catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!busy || still || !width) return undefined
    x.setValue(0)
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [busy, still, width, x])

  if (!busy) return null
  const bar = Math.max(24, width * 0.35)
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { left: inset, right: inset }]}
    >
      {still ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary600 }]} />
      ) : (
        <Animated.View
          style={[styles.bar, {
            width: bar,
            backgroundColor: colors.primary600,
            transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-bar, width] }) }],
          }]}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  track: { position: 'absolute', bottom: 0, height: 2, overflow: 'hidden', borderRadius: 1 },
  bar: { height: 2, borderRadius: 1 },
})
