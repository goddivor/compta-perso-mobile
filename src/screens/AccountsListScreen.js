// Accounts management sub-screen (from Settings): list of accounts with
// balance and fee rule, tap to edit, long press to delete. The "+" in the
// navigation header opens the account form.
import { useCallback, useState } from 'react'
import { View, Text, FlatList, Pressable, Alert, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { listAccounts, deleteAccount } from '../db/database'
import { fmt } from '../utils/format'
import { useApp } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { EmptyState, Dot, Badge } from '../components/ui'

export default function AccountsListScreen({ navigation }) {
  const { colors } = useTheme()
  const { tick, refresh } = useApp()
  const [accounts, setAccounts] = useState([])

  useFocusData(() => setAccounts(listAccounts()), [tick])

  const confirmDelete = useCallback(
    (a) => {
      Alert.alert(
        `Supprimer « ${a.name} »`,
        'Le compte et TOUTES ses transactions seront supprimés. Continuer ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: () => { deleteAccount(a.id); refresh() } },
        ]
      )
    },
    [refresh]
  )

  const keyExtractor = useCallback((a) => String(a.id), [])
  const renderItem = useCallback(
    ({ item: a, index }) => (
      <View
        style={[
          styles.rowWrap,
          { backgroundColor: colors.surface, borderColor: colors.line },
          index === 0 && styles.first,
          index === accounts.length - 1 && styles.last,
        ]}
      >
        {index > 0 ? <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 16 }} /> : null}
        <Pressable
          onPress={() => navigation.navigate('AccountForm', { id: a.id })}
          onLongPress={() => confirmDelete(a)}
          delayLongPress={350}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
        >
          <Dot color={a.color} size={12} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{a.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>
                {a.provider || (a.type === 'ELECTRONIC' ? 'Électronique' : 'Espèces')}
              </Text>
              {a.fees_rate != null ? (
                <Badge label={`Frais ${Number((a.fees_rate * 100).toFixed(2))}%`} color={colors.warning} />
              ) : null}
            </View>
          </View>
          <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: a.current_balance < 0 ? colors.danger : colors.ink }}>
            {fmt(a.current_balance)}
          </Text>
          <Ionicons name="chevron-forward" size={15} color={colors.faint} />
        </Pressable>
      </View>
    ),
    [accounts.length, colors, confirmDelete, navigation]
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <FlatList
        data={accounts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: 16 }}
        ListEmptyComponent={<EmptyState icon="wallet-outline" text="Aucun compte. Appuie sur + pour en créer un." />}
        ListFooterComponent={
          accounts.length ? (
            <Text style={[styles.hint, { color: colors.faint }]}>Appui long sur un compte pour le supprimer.</Text>
          ) : null
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  rowWrap: {
    marginHorizontal: 20,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  first: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1 },
  last: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderBottomWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 10,
    marginHorizontal: 20,
    marginTop: 8,
  },
})
