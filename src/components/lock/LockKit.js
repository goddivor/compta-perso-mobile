// App lock building blocks (mockup app-lock.html): the custom keypad (68 dp
// keys, never the system keyboard), the PIN dots, the 3×3 pattern grid
// (PanResponder: a point is used once, a point between two others is joined,
// as on Android), the Material 3 switch, the stack app bar, the primary
// button, the app mark, and the error shake (none with reduced motion).
import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, Animated, PanResponder, AccessibilityInfo, Vibration, StyleSheet } from 'react-native'
import Svg, { Circle, Polyline } from 'react-native-svg'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../../theme/tokens'
import { useT } from '../../i18n'

/* ------------------------------ Reduced motion --------------------------- */

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduced(!!v) }).catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(!!v))
    return () => { alive = false; sub?.remove?.() }
  }, [])
  return reduced
}

/** Error feedback: a short haptic tick and, without reduced motion, a ~300 ms horizontal shake. */
export function useShake() {
  const x = useRef(new Animated.Value(0)).current
  const reduced = useReducedMotion()
  const shake = () => {
    Vibration.vibrate(40)
    if (reduced) return
    x.setValue(0)
    const swing = (v) => Animated.timing(x, { toValue: v, duration: 50, useNativeDriver: true })
    Animated.sequence([swing(10), swing(-10), swing(8), swing(-8), swing(4), swing(0)]).start()
  }
  return [{ transform: [{ translateX: x }] }, shake]
}

/* --------------------------------- App bar ------------------------------- */

export function FlowAppbar({ title, onBack }) {
  const { colors } = useTheme()
  const t = useT()
  return (
    <View style={[styles.appbar, { backgroundColor: colors.bg }]}>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('lock.a11y.back')} hitSlop={4} style={({ pressed }) => [styles.iconbtn, pressed && { backgroundColor: colors.surface2 }]}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
      ) : null}
      <Text numberOfLines={1} accessibilityRole="header" style={[styles.appbarTitle, { color: colors.ink }]}>{title}</Text>
    </View>
  )
}

export function PrimaryButton({ title, onPress, disabled }) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary, opacity: disabled ? 0.38 : pressed ? 0.85 : 1 }]}
    >
      <Text style={[styles.btnText, { color: colors.primaryInk }]}>{title}</Text>
    </Pressable>
  )
}

export function AppMark() {
  const { colors } = useTheme()
  return (
    <View style={[styles.mark, { backgroundColor: colors.primary }]} accessible={false}>
      <Ionicons name="wallet" size={34} color={colors.primaryInk} />
    </View>
  )
}

/* --------------------------------- Switch -------------------------------- */

export function LockSwitch({ value, disabled }) {
  const { colors } = useTheme()
  return (
    <View
      style={[
        styles.track,
        value ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.muted },
      ]}
    >
      <View
        style={
          value
            ? [styles.thumbOn, { backgroundColor: colors.primaryInk }]
            : [styles.thumbOff, { backgroundColor: colors.muted }]
        }
      />
    </View>
  )
}

/* ---------------------------------- Dots --------------------------------- */

export function PinDots({ filled, total, error = false, shakeStyle }) {
  const { colors } = useTheme()
  const t = useT()
  return (
    <Animated.View
      style={[styles.dots, shakeStyle]}
      accessible
      accessibilityLabel={t('lock.a11y.dots', { n: filled, total })}
    >
      {Array.from({ length: total }, (_, i) => {
        const on = i < filled
        return (
          <View
            key={i}
            style={[
              styles.dot,
              on
                ? { backgroundColor: error ? colors.danger : colors.ink }
                : { borderWidth: 2, borderColor: colors.faint },
            ]}
          />
        )
      })}
    </Animated.View>
  )
}

/* --------------------------------- Keypad -------------------------------- */

function Key({ label, a11y, onPress, disabled, ghost, fn, children }) {
  const { colors } = useTheme()
  if (ghost) return <View style={styles.key} />
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.key,
        { backgroundColor: fn ? 'transparent' : colors.surface, opacity: disabled ? 0.38 : 1 },
        pressed && { backgroundColor: colors.surface2 },
      ]}
    >
      {children ?? <Text style={[styles.keyText, { color: colors.ink }]}>{label}</Text>}
    </Pressable>
  )
}

/**
 * onDigit(d), onDelete(); fingerprint: show the fingerprint key on the left
 * (onFingerprint), which stays usable while the digits are disabled.
 */
export function Keypad({ onDigit, onDelete, onFingerprint, fingerprint = false, disabled = false }) {
  const { colors } = useTheme()
  const t = useT()
  return (
    <View style={styles.pad}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
        <Key key={d} label={String(d)} onPress={() => onDigit(String(d))} disabled={disabled} />
      ))}
      {fingerprint ? (
        <Key fn a11y={t('lock.fingerprint')} onPress={onFingerprint}>
          <Ionicons name="finger-print" size={28} color={colors.content} />
        </Key>
      ) : (
        <Key ghost />
      )}
      <Key label="0" onPress={() => onDigit('0')} disabled={disabled} />
      <Key fn a11y={t('lock.a11y.delete')} onPress={onDelete} disabled={disabled}>
        <Ionicons name="backspace-outline" size={28} color={colors.content} />
      </Key>
    </View>
  )
}

/* ------------------------------ Pattern grid ----------------------------- */

const GRID = 264
const STEP = 88
const HIT = 34 // touch radius around a point
const pointXY = (i) => [44 + STEP * (i % 3), 44 + STEP * Math.floor(i / 3)]

function hitPoint(x, y) {
  for (let i = 0; i < 9; i++) {
    const [px, py] = pointXY(i)
    if ((x - px) ** 2 + (y - py) ** 2 <= HIT * HIT) return i
  }
  return -1
}

// The point halfway between a and b when both are two steps apart on a row,
// column or diagonal (Android joins it), else -1
function middle(a, b) {
  const ar = Math.floor(a / 3), ac = a % 3, br = Math.floor(b / 3), bc = b % 3
  if ((ar + br) % 2 || (ac + bc) % 2) return -1
  const m = ((ar + br) / 2) * 3 + (ac + bc) / 2
  return m === a || m === b ? -1 : m
}

/**
 * 3×3 grid. onDone(path) on release with the point indices (0–8).
 * error: red line and points; hideLine: draw neither the line nor the
 * touched points; frozen: shows `path` and ignores touches.
 */
export function PatternGrid({ path: shown = null, onDone, error = false, hideLine = false, disabled = false, shakeStyle }) {
  const { colors } = useTheme()
  const t = useT()
  const [live, setLive] = useState(null) // { path, tail } while drawing
  const pathRef = useRef([])
  const cb = useRef({ onDone, disabled })
  cb.current = { onDone, disabled }

  const responder = useMemo(() => {
    const add = (x, y) => {
      const p = pathRef.current
      const hit = hitPoint(x, y)
      if (hit >= 0 && !p.includes(hit)) {
        if (p.length) {
          const m = middle(p[p.length - 1], hit)
          if (m >= 0 && !p.includes(m)) p.push(m)
        }
        p.push(hit)
      }
      setLive({ path: [...p], tail: [x, y] })
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !cb.current.disabled,
      onMoveShouldSetPanResponder: () => !cb.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        pathRef.current = []
        add(e.nativeEvent.locationX, e.nativeEvent.locationY)
      },
      onPanResponderMove: (e) => add(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderRelease: () => {
        const p = pathRef.current
        pathRef.current = []
        setLive(null)
        if (p.length) cb.current.onDone?.(p)
      },
      onPanResponderTerminate: () => { pathRef.current = []; setLive(null) },
    })
  }, [])

  const path = live ? live.path : shown || []
  const pts = path.map(pointXY)
  if (live?.tail && path.length) pts.push(live.tail)
  const stroke = error ? colors.danger : colors.primary600
  const hitFill = error ? colors.danger : colors.primary600
  const halo = error ? colors.dangerSoft : colors.primarySoft
  const visible = !hideLine

  return (
    <Animated.View
      style={[{ width: GRID, height: GRID, opacity: disabled ? 0.38 : 1 }, shakeStyle]}
      accessible
      accessibilityLabel={t('lock.a11y.pattern')}
      {...responder.panHandlers}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={GRID} height={GRID} viewBox={`0 0 ${GRID} ${GRID}`}>
          {Array.from({ length: 9 }, (_, i) => {
            const [x, y] = pointXY(i)
            return visible && path.includes(i)
              ? <Circle key={`u${i}`} cx={x} cy={y} r={22} fill={halo} />
              : <Circle key={`u${i}`} cx={x} cy={y} r={6} fill={colors.faint} />
          })}
          {visible && pts.length > 1 ? (
            <Polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={stroke} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          ) : null}
          {visible ? path.map((i) => {
            const [x, y] = pointXY(i)
            return <Circle key={`h${i}`} cx={x} cy={y} r={9} fill={hitFill} />
          }) : null}
        </Svg>
      </View>
    </Animated.View>
  )
}

/* ---------------------------------- Label -------------------------------- */

export function FlowLabel({ text, tone }) {
  const { colors } = useTheme()
  const color = tone === 'error' ? colors.danger : tone === 'wait' ? colors.muted : colors.ink
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[styles.lbl, { color, fontFamily: tone === 'wait' ? fonts.medium : fonts.semibold }]}
    >
      {text}
    </Text>
  )
}

const styles = StyleSheet.create({
  appbar: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  appbarTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 18, paddingLeft: 4 },
  iconbtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  btn: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, flex: 1 },
  btnText: { fontFamily: fonts.semibold, fontSize: 15 },
  mark: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  track: { width: 52, height: 32, borderRadius: 16, justifyContent: 'center' },
  thumbOn: { position: 'absolute', left: 24, width: 24, height: 24, borderRadius: 12 },
  thumbOff: { position: 'absolute', left: 6, width: 16, height: 16, borderRadius: 8 },
  dots: { flexDirection: 'row', gap: 16, height: 16, alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 3 * 100 + 2 * 16, columnGap: 16, rowGap: 12, alignSelf: 'center', paddingBottom: 16 },
  key: { width: 100, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: fonts.medium, fontSize: 28 },
  lbl: { fontSize: 18, textAlign: 'center', minHeight: 27 },
})
