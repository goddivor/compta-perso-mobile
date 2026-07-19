// App entry: loads Poppins, opens the local database, then mounts the
// navigation tree (bottom tabs + native stack for the form screens).
// Theme: ThemeProvider (system / forced light / forced dark, persisted).
// Perf: tabs are lazy and frozen when blurred; inactive screens detached.
import { useEffect, useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins'

import { ThemeProvider, useTheme, fonts, palettes } from './src/theme/tokens'
import { I18nProvider, useT, t } from './src/i18n'
import { getDb } from './src/db/database'
import { AppProvider } from './src/context/AppContext'
import { FiltersProvider } from './src/context/FiltersContext'
import FilterScreen from './src/screens/FilterScreen'
import HomeScreen from './src/screens/HomeScreen'
import TransactionsScreen from './src/screens/TransactionsScreen'
import TransactionFormScreen from './src/screens/TransactionFormScreen'
import StatsScreen from './src/screens/StatsScreen'
import ReportScreen from './src/screens/ReportScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import AccountsListScreen from './src/screens/AccountsListScreen'
import CategoriesScreen from './src/screens/CategoriesScreen'
import SyncScreen from './src/screens/SyncScreen'
import ThemeScreen from './src/screens/ThemeScreen'
import AccountFormScreen from './src/screens/AccountFormScreen'
import CategoryFormScreen from './src/screens/CategoryFormScreen'
import AboutScreen from './src/screens/AboutScreen'
import LanguageScreen from './src/screens/LanguageScreen'
import UpdateModal from './src/components/UpdateModal'
import { getStartupUpdate, dismissUpdateVersion } from './src/updates/updater'

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

const TAB_ICONS = {
  HomeTab: ['home', 'home-outline'],
  TransactionsTab: ['swap-vertical', 'swap-vertical-outline'],
  StatsTab: ['stats-chart', 'stats-chart-outline'],
  ReportTab: ['bar-chart', 'bar-chart-outline'],
  SettingsTab: ['settings', 'settings-outline'],
}

function Tabs() {
  const { colors } = useTheme()
  const t = useT()
  return (
    <Tab.Navigator
      detachInactiveScreens
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 10 },
        tabBarIcon: ({ focused, color }) => (
          <Ionicons name={TAB_ICONS[route.name][focused ? 0 : 1]} size={21} color={color} />
        ),
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: t('tabs.home') }} />
      <Tab.Screen name="TransactionsTab" component={TransactionsScreen} options={{ title: t('tabs.transactions') }} />
      <Tab.Screen name="StatsTab" component={StatsScreen} options={{ title: t('tabs.stats') }} />
      <Tab.Screen name="ReportTab" component={ReportScreen} options={{ title: t('tabs.report') }} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} options={{ title: t('tabs.settings') }} />
    </Tab.Navigator>
  )
}

function Root() {
  const { colors, isDark } = useTheme()
  const t = useT()

  // Silent update check (GitHub Releases) shortly after startup: when a
  // newer, non-dismissed version exists, open the in-app update sheet
  // (download + install without leaving the app).
  const [updateInfo, setUpdateInfo] = useState(null)
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      getStartupUpdate().then((info) => {
        if (alive && info) setUpdateInfo(info)
      })
    }, 3000)
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.primary,
      background: colors.bg,
      card: colors.surface,
      text: colors.ink,
      border: colors.line,
    },
  }

  const stackHeader = {
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.ink,
    headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 16 },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.bg },
  }

  // "+" header button for the accounts/categories list sub-screens
  const headerAdd = (navigation, target) => () => (
    <Pressable onPress={() => navigation.navigate(target)} hitSlop={8} style={{ padding: 4 }}>
      <Ionicons name="add" size={24} color={colors.ink} />
    </Pressable>
  )

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack.Navigator>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="TransactionForm"
          component={TransactionFormScreen}
          options={{ title: t('nav.transaction'), ...stackHeader }}
        />
        <Stack.Screen
          name="Filter"
          component={FilterScreen}
          options={{ title: t('nav.filter'), presentation: 'modal', ...stackHeader }}
        />
        <Stack.Screen
          name="AccountsList"
          component={AccountsListScreen}
          options={({ navigation }) => ({
            title: t('nav.accounts'),
            ...stackHeader,
            headerRight: headerAdd(navigation, 'AccountForm'),
          })}
        />
        <Stack.Screen
          name="Categories"
          component={CategoriesScreen}
          options={({ navigation }) => ({
            title: t('nav.categories'),
            ...stackHeader,
            headerRight: headerAdd(navigation, 'CategoryForm'),
          })}
        />
        <Stack.Screen
          name="Sync"
          component={SyncScreen}
          options={{ title: t('nav.sync'), ...stackHeader }}
        />
        <Stack.Screen
          name="ThemeSettings"
          component={ThemeScreen}
          options={{ title: t('nav.theme'), ...stackHeader }}
        />
        <Stack.Screen
          name="LanguageSettings"
          component={LanguageScreen}
          options={{ title: t('nav.language'), ...stackHeader }}
        />
        <Stack.Screen
          name="AccountForm"
          component={AccountFormScreen}
          options={{ title: t('nav.account'), ...stackHeader }}
        />
        <Stack.Screen
          name="CategoryForm"
          component={CategoryFormScreen}
          options={{ title: t('nav.category'), ...stackHeader }}
        />
        <Stack.Screen
          name="About"
          component={AboutScreen}
          options={{ title: t('nav.about'), ...stackHeader }}
        />
      </Stack.Navigator>

      <UpdateModal
        visible={!!updateInfo}
        info={updateInfo}
        onLater={() => {
          if (updateInfo) dismissUpdateVersion(updateInfo.latest)
          setUpdateInfo(null)
        }}
        onClose={() => setUpdateInfo(null)}
      />
    </NavigationContainer>
  )
}

export default function App() {
  const system = useColorScheme() || 'light'
  const boot = system === 'dark' ? palettes.dark : palettes.light

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  })
  const [dbReady, setDbReady] = useState(false)
  const [dbError, setDbError] = useState(null)

  useEffect(() => {
    try {
      getDb()
      setDbReady(true)
    } catch (e) {
      setDbError(e.message)
    }
  }, [])

  if (!fontsLoaded || (!dbReady && !dbError)) {
    // Loading screen while Poppins and the database initialize
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: boot.bg }}>
        <ActivityIndicator size="large" color={boot.primary600} />
      </View>
    )
  }

  if (dbError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: boot.bg }}>
        <Text style={{ color: boot.danger, textAlign: 'center' }}>
          {t('app.dbError', { message: dbError })}
        </Text>
      </View>
    )
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <AppProvider>
            <FiltersProvider>
              <Root />
            </FiltersProvider>
          </AppProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
