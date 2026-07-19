// In-app update dialog (replaces the system Alert), Aniyomi style:
// bottom sheet (same look as DatePickerSheet), release notes, then the app
// downloads the APK itself (yellow progress bar + percent, cancellable)
// and opens the Android package installer on top — no browser.
import { useEffect, useRef, useState } from 'react'
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, Linking } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, radius, fonts, shadowOverlay } from '../theme/tokens'
import { useT } from '../i18n'
import { Button } from './ui'
import { createApkDownload, installApk } from '../updates/downloader'
import { markdownToText } from '../updates/updater'

// phases: idle | downloading | installing | error
export default function UpdateModal({ visible, info, onLater, onClose }) {
  const { colors } = useTheme()
  const t = useT()
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [errKey, setErrKey] = useState('update.errDownload')
  const dlRef = useRef(null)

  // Fresh state every time the sheet opens
  useEffect(() => {
    if (visible) {
      setPhase('idle')
      setProgress(0)
    }
  }, [visible])

  const busy = phase === 'downloading' || phase === 'installing'

  const startDownload = async () => {
    if (!info) return
    if (!info.apkUrl) {
      // No APK asset on the release: open the release page instead
      if (info.pageUrl) Linking.openURL(info.pageUrl).catch(() => {})
      onClose()
      return
    }
    setPhase('downloading')
    setProgress(0)
    const dl = createApkDownload(info.apkUrl, setProgress)
    dlRef.current = dl
    try {
      const uri = await dl.promise
      dlRef.current = null
      if (!uri) {
        // Cancelled by the user
        setPhase('idle')
        return
      }
      setPhase('installing')
      const ok = await installApk(uri, info.pageUrl)
      if (!ok) {
        setErrKey('update.errInstall')
        setPhase('error')
      }
    } catch {
      dlRef.current = null
      setErrKey('update.errDownload')
      setPhase('error')
    }
  }

  const cancelDownload = async () => {
    const dl = dlRef.current
    dlRef.current = null
    if (dl) await dl.cancel()
    setPhase('idle')
    setProgress(0)
  }

  const notes = markdownToText(info?.notes)
  const pct = Math.round(progress * 100)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? () => {} : onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable
          style={[styles.sheet, shadowOverlay, { backgroundColor: colors.surface, borderColor: colors.line }]}
          onPress={() => {}}
        >
          {/* Title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary }]}>
              <Ionicons name="arrow-up" size={18} color={colors.primaryInk} />
            </View>
            <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.ink }}>
              {t('update.title', { v: info?.latest || '' })}
            </Text>
          </View>

          {/* Release notes */}
          <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.muted, marginTop: 14 }}>
            {t('update.notes')}
          </Text>
          <ScrollView
            style={[styles.notesBox, { backgroundColor: colors.surface2 }]}
            contentContainerStyle={{ padding: 12 }}
          >
            <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 20, color: colors.content }}>
              {notes || t('update.noNotes')}
            </Text>
          </ScrollView>

          {/* Download / install state */}
          {phase === 'downloading' ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              <View style={[styles.progressTrack, { backgroundColor: colors.surface2 }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${pct}%` }]} />
              </View>
              <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: colors.content, textAlign: 'center' }}>
                {t('update.downloading', { pct })}
              </Text>
              <Button title={t('common.cancel')} variant="secondary" onPress={cancelDownload} />
            </View>
          ) : phase === 'installing' ? (
            <View style={{ gap: 6, marginTop: 14 }}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.ink, textAlign: 'center' }}>
                {t('update.installing')}
              </Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, color: colors.muted, textAlign: 'center' }}>
                {t('update.installHint')}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 14 }}>
              {phase === 'error' ? (
                <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft }]}>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.danger }}>{t(errKey)}</Text>
                </View>
              ) : null}
              <Button title={t('update.downloadInstall')} icon="download-outline" onPress={startDownload} />
              <Button title={t('update.later')} variant="secondary" onPress={onLater} />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesBox: {
    maxHeight: 240,
    borderRadius: radius.md,
    marginTop: 8,
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  errorBox: {
    borderRadius: radius.md,
    padding: 10,
  },
})
