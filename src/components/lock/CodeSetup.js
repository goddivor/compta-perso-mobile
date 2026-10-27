// Creation of a PIN (4 to 6 digits) or a pattern (at least 4 points), in two
// steps: new code, then the same code again. Step 1 shows four dots and grows
// up to six as digits are typed (Suivant from four); step 2 shows as many dots
// as the chosen length (Valider once they are all filled). A mismatch turns
// the dots red with the shake, then clears them for a new confirmation. The
// back arrow (or the Android back key, through backRef) returns to step 1,
// then cancels. onDone(value): the digits, or the points joined by '-'.
import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/tokens'
import { useT } from '../../i18n'
import { PIN_MIN, PIN_MAX, PATTERN_MIN } from '../../lock/store'
import { FlowAppbar, FlowLabel, Keypad, PatternGrid, PinDots, PrimaryButton, useShake } from './LockKit'

const CLEAR_MS = 1000

export function CodeSetup({ method, onDone, onCancel, backRef, hidePatternLine = false }) {
  const { colors } = useTheme()
  const t = useT()
  const [step, setStep] = useState(1)
  const [first, setFirst] = useState('')
  const [entry, setEntry] = useState('') // PIN digits typed in this step
  const [path, setPath] = useState(null) // pattern drawn in this step
  const [error, setError] = useState('') // label key of the current error
  const [shakeStyle, shake] = useShake()
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const back = () => {
    clearTimeout(timer.current)
    setError('')
    if (step === 2) {
      setStep(1); setFirst(''); setEntry(''); setPath(null)
    } else {
      onCancel?.()
    }
  }
  if (backRef) backRef.current = back

  const fail = (key) => {
    setError(key)
    shake()
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setError(''); setEntry(''); setPath(null) }, CLEAR_MS)
  }

  /* ---------------------------------- PIN -------------------------------- */
  const pinMax = step === 1 ? PIN_MAX : first.length
  const onDigit = (d) => {
    if (error) return
    setEntry((e) => (e.length < pinMax ? e + d : e))
  }
  const onDelete = () => { if (!error) setEntry((e) => e.slice(0, -1)) }

  /* -------------------------------- Pattern ------------------------------ */
  const onPattern = (p) => {
    if (p.length < PATTERN_MIN) return fail('lock.patternTooShort')
    const value = p.join('-')
    if (step === 2 && value !== first) {
      setPath(p)
      return fail('lock.patternMismatch')
    }
    setError('')
    setPath(p)
  }

  /* --------------------------------- Steps ------------------------------- */
  const value = method === 'pin' ? entry : path ? path.join('-') : ''
  const ready = method === 'pin'
    ? (step === 1 ? entry.length >= PIN_MIN : entry.length === first.length) && !error
    : !!path && !error

  const next = () => {
    if (!ready) return
    if (step === 1) {
      setFirst(value); setStep(2); setEntry(''); setPath(null)
      return
    }
    if (value !== first) return fail('lock.pinMismatch')
    onDone(value)
  }

  const isPin = method === 'pin'
  const label = error
    ? t(error)
    : t(isPin ? (step === 1 ? 'lock.newPin' : 'lock.confirmPin') : (step === 1 ? 'lock.newPattern' : 'lock.confirmPattern'))
  const total = step === 1 ? Math.max(PIN_MIN, entry.length) : first.length

  return (
    <SafeAreaView style={[styles.flow, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <FlowAppbar title={t(isPin ? 'lock.pin' : 'lock.pattern')} onBack={back} />
      <View style={styles.head}>
        <FlowLabel text={label} tone={error ? 'error' : undefined} />
        {isPin ? (
          <PinDots filled={entry.length} total={total} error={!!error} shakeStyle={shakeStyle} />
        ) : (
          <PatternGrid path={path} onDone={onPattern} error={!!error} hideLine={hidePatternLine} shakeStyle={shakeStyle} />
        )}
      </View>
      {isPin ? <Keypad onDigit={onDigit} onDelete={onDelete} /> : null}
      <View style={styles.foot}>
        <PrimaryButton title={t(step === 1 ? 'common.next' : 'common.validate')} onPress={next} disabled={!ready} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flow: { flex: 1 },
  head: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 24 },
  foot: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
})
