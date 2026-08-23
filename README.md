<div align="center">

# compta-perso-mobile

[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=000&labelColor=333&style=flat)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Release](https://img.shields.io/github/v/release/goddivor/compta-perso-mobile?logo=github&logoColor=fff&label=Release&labelColor=333&color=2BB24C&style=flat)](https://github.com/goddivor/compta-perso-mobile/releases/latest)
[![License](https://img.shields.io/badge/License-MIT-2BB24C?logo=github&logoColor=fff&labelColor=333&style=flat)](./LICENSE)
[![Downloads](https://img.shields.io/github/downloads/goddivor/compta-perso-mobile/total?logo=github&logoColor=fff&label=Downloads&labelColor=333&color=1F6FEB&style=flat)](https://github.com/goddivor/compta-perso-mobile/releases)

[![Expo](https://img.shields.io/npm/v/expo?logo=expo&logoColor=fff&label=Expo&labelColor=333&color=000020&style=flat)](https://www.npmjs.com/package/expo)
[![React Native](https://img.shields.io/npm/v/react-native?logo=react&logoColor=fff&label=React%20Native&labelColor=333&color=61DAFB&style=flat)](https://www.npmjs.com/package/react-native)
[![expo-sqlite](https://img.shields.io/npm/v/expo-sqlite?logo=sqlite&logoColor=fff&label=expo-sqlite&labelColor=333&color=003B57&style=flat)](https://www.npmjs.com/package/expo-sqlite)
[![React Navigation](https://img.shields.io/npm/v/@react-navigation/native?logo=npm&logoColor=fff&label=React%20Navigation&labelColor=333&color=6B52AE&style=flat)](https://www.npmjs.com/package/@react-navigation/native)
[![gifted-charts](https://img.shields.io/npm/v/react-native-gifted-charts?logo=npm&logoColor=fff&label=gifted-charts&labelColor=333&color=CB3837&style=flat)](https://www.npmjs.com/package/react-native-gifted-charts)
[![Google Sign-In](https://img.shields.io/npm/v/@react-native-google-signin/google-signin?logo=google&logoColor=fff&label=Google%20Sign-In&labelColor=333&color=DB4437&style=flat)](https://www.npmjs.com/package/@react-native-google-signin/google-signin)

[![Stars](https://img.shields.io/github/stars/goddivor/compta-perso-mobile?logo=github&logoColor=fff&label=Stars&labelColor=333&color=E3B341&style=flat)](https://github.com/goddivor/compta-perso-mobile/stargazers)
[![Forks](https://img.shields.io/github/forks/goddivor/compta-perso-mobile?logo=github&logoColor=fff&label=Forks&labelColor=333&color=8957E5&style=flat)](https://github.com/goddivor/compta-perso-mobile/network/members)
[![Watchers](https://img.shields.io/github/watchers/goddivor/compta-perso-mobile?logo=github&logoColor=fff&label=Watchers&labelColor=333&color=1F6FEB&style=flat)](https://github.com/goddivor/compta-perso-mobile/watchers)
[![Contributors](https://img.shields.io/github/contributors/goddivor/compta-perso-mobile?logo=github&logoColor=fff&label=Contributors&labelColor=333&color=DB61A2&style=flat)](https://github.com/goddivor/compta-perso-mobile/graphs/contributors)
[![Open issues](https://img.shields.io/github/issues/goddivor/compta-perso-mobile?logo=github&logoColor=fff&label=Issues&labelColor=333&color=3FB950&style=flat)](https://github.com/goddivor/compta-perso-mobile/issues)

Keep your **personal accounts** in your pocket, entirely **offline**. Accounts,
transactions, transfers, fees, statistics and reports live in a **local SQLite** database on the
phone: no sign-up, no server, nothing leaves the device unless you ask for it.

Backups are yours too: send a snapshot to **your own Google Drive**, or share the same data with the
[desktop app](https://github.com/goddivor/compta-perso-desktop) through the
[sync API](https://github.com/goddivor/compta-perso-server).

<table>
  <tr>
    <td><img src="screenshots/home.jpg" alt="Home: total balance, accounts and latest transactions" width="260"></td>
    <td><img src="screenshots/stats.jpg" alt="Statistics: balance history and expenses by category" width="260"></td>
    <td><img src="screenshots/settings.jpg" alt="Settings: data, sync, backup, theme and language" width="260"></td>
  </tr>
</table>

</div>

## 🎖️ Features

- **Offline first** — every screen works with no network; an account is never required
- **Accounts and balances** — total balance up front, one card per account, tap to filter
- **Transactions** — search, group by day, edit or delete, add from anywhere with the floating button
- **Transfers between accounts** — both entries written and paired in one step, fees included
- **Fee rules per account** — a rate saved once, applied to a transaction with a single switch
- **Advanced filters** — several accounts and categories at a time, include or exclude mode, uncategorised filter, precise date ranges
- **Quick filter** — long press the filter button, slide to an account bubble, release
- **Statistics** — balance history, expenses by category with tap-through to the matching transactions, monthly money in and out
- **Report and graph** — daily totals, plus a chronological graph with one column per account
- **Google Drive backup** — sign in with Google, snapshots go to the private app folder of your own Drive, manually or on a schedule
- **Cloud sync** — optional shared snapshot with the desktop app, configured in one tap
- **In-app updates** — new versions are detected, downloaded and installed without leaving the app
- **Bilingual and themed** — French and English, light and dark, both following the system by default

## 📋 Requirements

- Android 7.0 or newer to install the APK
- Node.js >= 20, the Android SDK and JDK 17 to build from source
- A Google account only if you want Drive backups

## 📦 Installation

Download the APK from the [releases page](https://github.com/goddivor/compta-perso-mobile/releases/latest)
and open it on the phone. Android asks once for permission to install applications from this source.

From a clone:

```bash
npm install
npx expo start
```

## ⚙️ Usage

```bash
# Development server, then open the project in Expo Go
npx expo start

# Build and run the native debug app on a connected device
npx expo run:android

# Signed release APK
cd android && ./gradlew assembleRelease
```

### 🔐 Environment

Two optional keys, both read at build time from a gitignored `.env`:

```bash
# Sync API configuration key (fetches the URL and the token)
EXPO_PUBLIC_CONFIG_KEY=...

# Google OAuth web client ID, for Drive backups
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...apps.googleusercontent.com
```

Without them the app still runs; only cloud sync and Google backup report that they are not configured.

### ☁️ Backups and sync

| Feature | Where the data goes | Set up |
|---|---|---|
| Google backup | The private app folder of your own Drive | Settings, Google backup, sign in |
| Cloud sync | The shared MongoDB snapshot behind the sync API | Settings, Cloud sync, fetch configuration |

Both are optional and independent; the local database stays the source of truth.

### 🔄 Updates

The app checks the GitHub releases at launch. When a version is available it offers the release
notes, downloads the APK inside the app with a progress bar, then hands it to the Android installer.
The same check is available by hand in Settings, About.

## 🤝 Contributing

Contributions of all kinds are welcome: bug reports, feature ideas and pull requests. Open an
[issue](https://github.com/goddivor/compta-perso-mobile/issues) first for anything substantial, and
make sure `npx expo export --platform android` passes before every commit.

## 📜 License

Licensed under MIT License and copyrights reserved.
