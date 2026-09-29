# 04 - Native app analysis (apps/native, ref-master)

Source: /home/user/ref-master/apps/native. Expo SDK 55 / RN 0.83 / React 19.2, Expo Router (file based), Convex real-time backend, WorkOS OAuth (PKCE, via own server), Mux HLS via expo-video, consent-gated OpenPanel analytics.
IMPORTANT: the app has NO SQLite, NO gesture cache, NO auto-sync layer ("retired SQLite gesture or favorites sync layer" per README). Network is required; all gesture/list data comes live from Convex `useQuery`. Root `app.json` is just `{ "expo": {} }`.

## 1. Routes / navigation

File tree (`app/`):
```
app/_layout.tsx                  root Stack (see below)
app/welcome.tsx                  /welcome
app/auth-callback.tsx            /auth-callback
app/(tabs)/_layout.tsx           NativeTabs (expo-router/unstable-native-tabs)
app/(tabs)/index.tsx             / (Home)
app/(tabs)/search/_layout.tsx    <Stack/>
app/(tabs)/search/index.tsx      /search
app/(tabs)/lists/_layout.tsx     <Stack/> + unstable_settings { initialRouteName: "index" }
app/(tabs)/lists/index.tsx       /lists
app/(tabs)/lists/[id]/index.tsx  /lists/[id]
app/(tabs)/lists/[id]/settings.tsx /lists/[id]/settings
app/gestures/[id].tsx            /gestures/[id]
app/settings/index.tsx           /settings
app/settings/account.tsx         /settings/account
app/settings/developer-tools.tsx /settings/developer-tools  (__DEV__ only)
```
All route files except welcome/auth-callback/developer-tools/layouts are 1-line wrappers rendering a `screens/*` component.

### Root layout (app/_layout.tsx)
- `export const unstable_settings = { initialRouteName: "(tabs)" }` (keeps home under deep-linked detail screens).
- RootLayout: `useFonts({"SpaceMono-Regular": assets/fonts/SpaceMono-Regular.ttf})`, returns null until loaded; tree: `AppProviders > BottomSheetModalProvider > [NativeAnalytics (showConsentPrompt), RootLayoutNav, ListPickerBottomSheet]`. `import "@/utils/i18n"` initialises i18n.
- RootLayoutNav (auth gate): while `isLoading` shows splash-like view (bg `#22805F`, `assets/images/adaptive-icon.png` 220x150, text `t("common.initializing")` white). If `isAuthenticated || isGuest` -> AuthenticatedLayout; else unauth Stack (`headerShown:false`) with `welcome` and `auth-callback`.
- Initial navigation effect: once `navigationState.key` exists and not loading / not handling OAuth callback / not yet navigated: if authed or guest -> only if pathname === "/welcome" then `router.replace("/(tabs)")`; set hasNavigated. Else (unauthenticated) `router.replace("/welcome")`. `hasNavigated` reset when authMode changes. Never redirects a deep-linked path for an authed/guest user (cold-start destination preserved; covered by Jest test utils/__tests__/startupNavigation.test.js).
- AuthenticatedLayout: `<Stack initialRouteName="(tabs)">` screens:
  - `(tabs)` headerShown false; `auth-callback` headerShown false
  - `gestures/[id]`, `settings/index`, `settings/developer-tools` (title "Developer Tools"), `settings/account`: all `{...defaultScreenOptions, gestureEnabled:true, presentation: iOS ? "card" : "modal"}`
  - StatusBar: style=theme.statusBar, android backgroundColor theme.primary + translucent, iOS transparent. Android: `NavigationBar.setBackgroundColorAsync(theme.card)` + `setButtonStyleAsync(light|dark)`.
  - defaultScreenOptions iOS: headerBlurEffect "systemChromeMaterial", headerShadowVisible false, transparent header, tint theme.primary, title 17/600 theme.text. Android: opaque header bg theme.primary, tint theme.background, title 20 bold.
- Tabs (NativeTabs, unstable): backgroundColor iOS "transparent"/Android theme.card; blurEffect iOS "systemChromeMaterial"; disableTransparentOnScrollEdge; labelStyle color theme.textLight; minimizeBehavior "onScrollDown"; tintColor theme.primary. Triggers: `index` (label tabs.home, SF house/house.fill, Ionicons home-outline/home), `search` (role="search", label tabs.search, SF magnifyingglass, Ionicons search-outline), `lists` (label tabs.lists, SF list.bullet, Ionicons list-outline/list).
- Sheets/modals (not routes): `ListPickerBottomSheet` (gorhom BottomSheetModal, mounted at root, snap 72%/92%), `CategoryListBottomSheet` (snap 50%/85%, used by Search), `ListNameModal` (RN Modal for create/rename list), `AnalyticsConsentPrompt` (RN Modal, transparent fade overFullScreen), native `Alert.alert`, `@expo/react-native-action-sheet` (language/theme pickers), Toast overlay.

### Screens
- **/welcome** (WelcomeScreen): themed primary bg, Logo (variant theme; 240x80, small screen 180x60), two buttons: "Continue as guest" (`auth.continueAsGuest`; calls `continueAsGuest()` then `router.replace("/(tabs)")`) and "Sign in / sign up" (`auth.welcome.signInSignUp`; `signIn()` -> WorkOS AuthKit browser flow). Stacks buttons if width<420; compact if height<700. If `user` set -> replace to /(tabs).
- **/auth-callback**: shows "Completing sign in..." on `#007AFF`; waits until `!isLoading && !isHandlingOAuthCallback`; authMode authenticated|guest -> `replace("/(tabs)")`; unauthenticated -> `replace("/welcome")`; error -> welcome.
- **Home (/)** HomeScreen: no nav header; SafeAreaView top; top-right `HeaderMenuButton` (native @react-native-menu/menu, ellipsis icon) with actions `settings` (-> push /settings), `about` (open https://smog.vlaanderen), `contact` (open mailto:hello@smog.vlaanderen). Logo, SearchBar (custom), RecentSearches (shown when term empty), SearchResults (when term non-empty; `useOptimizedSearch` debounce 300, page 50, minLength 1). Result press -> `router.push(/gestures/${id})`; save icon -> `openListPicker({source:"search_results"})`. Submit stores recent search.
- **Search (/search)** SearchScreen: Stack inside tab. iOS: native `headerSearchBarOptions` (autoCapitalize none, hideWhenScrolling false, placeholder search.placeholder, tint primary; onChangeText, onSearchButtonPress, cancel clears), headerRight CircularButton "filter" with badge count -> opens CategoryListBottomSheet; Android: in-screen SearchBar + filter button. Route param `category` (from gesture screen category tap) sets selected category (tracks prevCategoryParamRef because tab stays mounted). `useOptimizedSearch` debounce 300, page 20, minSearchLength 0 (empty query + no categories => shows list/recents). CategoryFilters chips ("clear all", remove). RecentSearches when focused. Analytics `search_performed` on submit (source "submit") and on recent select (source "recent_search"). Category list from `api.categories.list`.
- **Lists (/lists)** ListsScreen: title tabs.lists, iOS large title; headerRight HeaderMenuButton actions `new` (New list -> ListNameModal), `settings` (push /settings). FlatList of ListCards (heart icon for default favorites else list icon; name (favorites translated `lists.favorites`); meta shared/private; chevron) + intro header (yourLists, overviewDescription, "New list" button). Create -> `createList` then `router.push({pathname:"/lists/[id]", params:{id}})`.
- **List detail (/lists/[id])** ListDetailScreen: `useQuery(api.lists.getListGesturesForNative,{listId,userId})`; DraggableFlatList (react-native-draggable-flatlist) with drag handle plus per-row native menu: move up / move down / remove gesture; reorder persisted via `api.lists.reorderListItems` (revert + toast on failure); remove via `api.lists.removeGestureFromList`. Empty state (lists.emptyTitle/emptyMessage) with "Explore gestures" -> `router.navigate("/(tabs)/search")`. Header button (lists.listSettings) -> push `/lists/[id]/settings`. Row press -> push `/gestures/{id}`. Haptics/toasts.
- **List settings (/lists/[id]/settings)** ListSettingsScreen: rename row (ListNameModal; favorites cannot be renamed), "Shared" Switch (`api.lists.updateListSharing` visibility shared/private, allowSharedEditing false), Share row (ensures shared, then `Share.share({message: "${name}\n${url}", url})` where url = `https://app.smog.vlaanderen/lists/${viewShareToken}`), Delete (Alert confirm -> `api.lists.deleteList` -> `router.dismissTo("/lists")` + toast).
- **Gesture (/gestures/[id])** GestureScreen (root stack card on iOS / modal on Android): title=gesture name; headerRight icon (list-outline / checkmark-circle if saved) -> ListPicker (source gesture_detail). Content: VideoPlayer (3:4), DisclaimerBanner (shown once per playthrough when <=5s left; resets on loop/dismiss; random message 1..VIDEO_COMPLETE_COUNT=7, with clickable "Click here/Klik hier/Cliquez ici" linking COURSE_URL `https://smog.vlaanderen/volg-een-cursus`), CategoryRow (tap category -> `router.dismiss(); router.navigate({pathname:"/(tabs)/search", params:{category}})`), InfoSection, ConceptSection, RelatedGesturesSection (`api.gestures.relatedForNative` limit 5; tap -> `router.push(/gestures/{id})`). Data: `api.gestures.getByIdForNative`. Tracks `gesture_viewed {source:"direct"}` and `video_playback_completed`. Screenshot detection (see 5).
- **Settings (/settings)** SettingsScreen (large title iOS): sections: Account ("Manage account" -> push /settings/account); Language (ActionSheet en/fr/nl: "English","Français","Nederlands" + cancel); Theme (ActionSheet system/light/dark); Analytics (Switch bound to consent + description + "Privacy policy" link https://app.smog.vlaanderen/privacy); __DEV__ only "Open Developer Tools" row (5 taps within 2s windows: first tap alerts "Tap 5 times to open Developer Tools", 5th pushes /settings/developer-tools); footer "Gemaakt met ♡ door zias.be" -> https://zias.be. (No app version shown.)
- **Account (/settings/account)** AccountSettingsScreen: guest -> guest-mode explainer + "Sign in/sign up" button (`auth.welcome.signInSignUp`, replace to /welcome); authed -> email display; GDPR "Manage data": Export (`useQuery(api.gdpr.exportUserData)` -> `Share.share` JSON `smog-data-export-<iso>.json`); Danger zone: Logout (Alert confirm -> `signOut()` -> replace /welcome), Delete account (Alert confirm -> `api.gdpr.deleteUserAccount({confirmDelete:true})` -> signOut -> replace /welcome).

## 2. Deep links
- Custom scheme: `smog` (app.json `scheme`; also android intent filter for scheme smog). OAuth redirect: `makeRedirectUri({path:"auth-callback", scheme:"smog"})` => `smog://auth-callback`.
- iOS: `associatedDomains: ["applinks:app.smog.vlaanderen"]`. Android: two intent filters (quoted in section 6): scheme `smog`, and `https://app.smog.vlaanderen`, both `autoVerify: true`, categories BROWSABLE + DEFAULT (no pathPrefix restriction = all paths).
- No custom Linking config / `+native-intent` / `getInitialURL` code; Expo Router maps URL path to file route directly: `https://app.smog.vlaanderen/gestures/<id>` and `smog://gestures/<id>` -> `/gestures/[id]` (this URL is what screenshot-share generates); `/lists/<id>` -> `/(tabs)/lists/[id]` (note: shared list URLs built as `https://app.smog.vlaanderen/lists/<viewShareToken>` pass the token as `id`; native list detail requires the list be in the user's own lists, so shared-token links are effectively not resolved natively); `/search`, `/settings`, `/settings/account` etc. also resolve.
- Server-side verification files live in apps/web/public/.well-known (served by web app): `apple-app-site-association` = `{"applinks":{"apps":[],"details":[{"appID":"96XKP6MU2A.be.zias.smog","components":[{"/":"/gestures/*","comment":"Open gesture detail links in the native app"}]}]}}` (ONLY /gestures/* opens the iOS app; /lists/* does not on iOS). `assetlinks.json`: relation `delegate_permission/common.handle_all_urls`, namespace android_app, package `be.zias.smog`, sha256 `23:4A:F1:75:8A:A7:4E:68:6B:D0:C0:9B:DA:E0:7F:ED:3F:64:C8:4E:D5:BD:EE:4A:AF:E6:EE:27:73:60:B1:C5`. Caddyfile in apps/web references them.
- "Go back" fixes: (a) commit 0a23042 "deeplinks should be sent to the deeplink and not home": root nav effect no longer force-redirects authed/guest users to /(tabs); only replaces when pathname is `/welcome`; waits for `useRootNavigationState().key` (tests cover this). (b) commit 5f2e789 "allow navigating back to home from deep-linked detail screens": `unstable_settings = { initialRouteName: "(tabs)" }` in app/_layout.tsx and `{ initialRouteName: "index" }` in app/(tabs)/lists/_layout.tsx so cold-start deep links to `/gestures/x` or `/lists/x` have home tabs / lists overview beneath (back button works). AuthenticatedLayout also sets `<Stack initialRouteName="(tabs)">`. (c) 66d0aa0 "fix: auth callback": auth-callback route waits for auth to settle then replaces to tabs/welcome; `isHandlingOAuthCallback` prevents premature redirects; `maybeCompleteAuthSession()` called at AuthProvider import.
- Other external links: `https://smog.vlaanderen` (about), `mailto:hello@smog.vlaanderen`, COURSE_URL, privacy `https://app.smog.vlaanderen/privacy`, `https://zias.be`.

## 3. Storage, guest mode, sync
No SQLite, no offline gesture/favorites cache, no auto-sync, no NetInfo. Convex gives live queries only. Storage:
| Store | Key | Content |
|---|---|---|
| SecureStore | `smog_refresh_token` | WorkOS refresh token (access token in memory only) |
| AsyncStorage | `@smog_user` | JSON WorkOSUser (offline session restore) |
| AsyncStorage | `@smog_guest_mode` | "true" when guest |
| AsyncStorage | `@smog_guest_id` | `guest_<32 hex>` from `expo-crypto getRandomBytes(16)` |
| AsyncStorage | `@smog_analytics_consent` | "true"/"false" (ANALYTICS_CONSENT_STORAGE_KEY from @smog/config/constants; absent = not asked) |
| AsyncStorage | `themeMode` | "system"/"light"/"dark" |
| AsyncStorage | `userLanguage` | "en"/"fr"/"nl" |
| AsyncStorage | `recentSearches` | JSON string[] (max 10, newest first, dedupe) |
| AsyncStorage | OpenPanel SDK storage (passes AsyncStorage) | analytics device/profile ids |
| File system (expo-file-system, Paths.document/logs) | rotating log files | see dev tools |

Auth flow (AuthProvider): server URL `EXPO_PUBLIC_SERVER_URL`, WorkOS client `EXPO_PUBLIC_WORKOS_CLIENT_ID`. `useAuthRequest` with discovery `authorizationEndpoint: https://api.workos.com/user_management/authorize`, `extraParams {provider:"authkit"}`, `responseType "code"`, scopes [], PKCE. On success POST `${server}/auth/workos/callback` `{code, codeVerifier}` -> `{accessToken, refreshToken, user}`; stores refresh token in SecureStore, user in AsyncStorage, clears guest keys. Refresh: POST `${server}/auth/token/refresh {refreshToken}`; health check `HEAD ${server}/health` (offline => keep "authenticated" with stored user, no token). Restore order on launch: guest mode first -> authMode "guest"; else stored user -> refresh; failure -> clear and "unauthenticated". `authMode: "loading"|"guest"|"authenticated"|"unauthenticated"`. `getAccessToken` caches in memory, uses `isTokenExpired` from @smog/auth, dedupes concurrent refreshes. `useAuthForConvex` adapts to `ConvexProviderWithAuth` (isAuthenticated = !!user).
Guest mode: `continueAsGuest()` creates/reads guest id, sets guest keys; `ConvexUserSync` creates a Convex user via `api.users.createUser({guestId})` (lookup `api.users.getUserByGuestId`). On sign-in with stored guest id: `api.users.migrateGuestToUser({guestId, workosId})` else `createUser({workosId})` (lookup `getUserByWorkOSId`). Guest data lives server-side in Convex, migrated on sign in.
ListsProvider: on userId ready calls `api.lists.initializeUserLists` (creates default Favorites, `isDefaultFavorites`); queries `listUserLists`, `getSavedGestureIds`, `getGestureListIds`; mutations createList (private, allowSharedEditing false), addGestureToList, removeGestureFromList. List record: `_id, name, description?, visibility "private"|"shared", allowSharedEditing, isDefaultFavorites, viewShareToken?, editShareToken?, createdAt, updatedAt`. Favorites sorted first.
Provider order: LogProvider > ThemeProvider > AuthProvider > ConvexProviderWithAuth > ConvexUserSync > TranslationProvider > SafeAreaProvider > ToastProvider > ListsProvider > RecentSearchesProvider > GestureHandlerRootView > ActionSheetProvider. If `EXPO_PUBLIC_CONVEX_URL` missing -> "Configuration unavailable" screen. Env: EXPO_PUBLIC_CONVEX_URL, _SERVER_URL, _WORKOS_CLIENT_ID, _OPENPANEL_API_URL (default https://analytics.zias.be/api), _OPENPANEL_CLIENT_ID, _OPENPANEL_CLIENT_SECRET.
Convex API used by native: api.categories.list; api.gestures.getByIdForNative / relatedForNative / searchForNative({categories,limit,searchText}); api.lists.*; api.users.*; api.gdpr.exportUserData / deleteUserAccount. Gesture type: id, name, category[], info, concept, playbackId (+ others in @/types -> @smog/types).

## 4. Developer tools (/settings/developer-tools)
Only reachable when `__DEV__` (screen redirects to /settings otherwise; settings row hidden in production; 5-tap unlock). Header "Developer Tools" (large title on iOS). Sections:
1. "Logs" actions: **Export Logs** (builds file via `exportLogsToFile()` then `Share.share({message/title "Smog App Logs", url:file.uri})`; alert "No logs to export." if empty), **Save Logs to Device** (writes `smog_logs_<timestamp>.log` to Paths.document; Alert "Logs Saved ... via the Files app"), **Clear Logs** (clears in-memory).
2. A log viewer list of recent in-memory logs (italic empty-state text when none).
Logger (utils/logger.ts): patches console (log/info/warn/error/debug); in-memory ring 5000 (LogProvider shows 2000); persists to `Paths.document/logs` with 1MB per file, max 10 files rotation; export concatenates archived files with header "Smog logs export - generated <iso>".

## 5. Cross-cutting
- Video: `expo-video` (`useVideoPlayer`, `VideoView`), URL `https://stream.mux.com/${playbackId}.m3u8` (MUX_STREAM_DOMAIN in @smog/config/urls). loop true, timeUpdateEventInterval 0.5, autoplay, contentFit contain, no PiP, no fullscreen, 3:4 aspect, black bg. Events: playingChange, statusChange(readyToPlay -> hide spinner), sourceLoad, timeUpdate (onComplete when <=5s left, once per loop, reset when currentTime<1), playToEnd. Pauses when screen loses focus (`useIsFocused`) and on unmount. Play/pause button bottom-right 40px; iOS 26 liquid glass (`expo-glass-effect` GlassView if `isLiquidGlassAvailable()`), else primary-colored circle.
- Haptics (`useNativeInteractions`): `triggerHaptic(light|medium|heavy|success|error)`, `triggerSelection`, `triggerToggle(on)`. Android uses `performAndroidHapticsAsync` (Clock_Tick, Confirm, Reject, Toggle_On/Off) with impact for medium/heavy; iOS uses impactAsync/notificationAsync.
- Screenshot detection (`expo-screen-capture addScreenshotListener`, on gesture screen): Alert (screenshot.sharePrompt.*) offering share of `https://app.smog.vlaanderen/gestures/${id}` (iOS: `url`; Android: appended to message). Custom config plugin removes READ_MEDIA_IMAGES/READ_MEDIA_VIDEO/READ_EXTERNAL_STORAGE (tools:node="remove") for Play review; Android <=13 detection silently fails.
- Theme: ThemeContext; `themeMode` "system"|"light"|"dark" persisted at `themeMode`; `themes` (light/dark), fields used: background, card, border, text, textLight, primary, liked, statusBar. From `@smog/styles` (also SPACING, FONT_SIZE, FONT_WEIGHT, BORDER_RADIUS, SHADOWS, ICON_SIZE, ANIMATION_DURATION, colors). Brand green `#22805F`/`#00805F` (adaptive icon bg). app.json `userInterfaceStyle: automatic`.
- Language: i18next + react-i18next + expo-localization; languages en (default/fallback), fr, nl from `@smog/i18n`; async detector: saved `userLanguage` else device locale (`getLocales()[0].languageCode` fr/nl/else en); key separator ".", nsSeparator false, `{{ }}` interpolation, useSuspense false. Settings action sheet changes language. Note Developer Tools strings and "Completing sign in..." / "Gemaakt met ♡ door zias.be" / "Configuration unavailable" are hard-coded (not translated).
- Analytics (lib/openpanel.ts): `@openpanel/react-native` `OpenPanel({apiUrl, clientId, clientSecret, filter: consent===true, storage: AsyncStorage})`; fallback to `@openpanel/sdk` base client with `sdk:"react-native-fallback"` if native init fails. No client created unless consent === true and id+secret set. Consent: tri-state null(unasked)/true/false, persisted; `AnalyticsConsentPrompt` modal on first launch (title settings.analyticsPromptTitle, description, privacy link, buttons "Allow" `settings.analyticsAllow` and outline "Required only" `settings.analyticsRequiredOnly`) shown when initialized and consent null; toggle later in Settings. Declining calls `op.clear()`. Identify: authed `{email, profileId:user.id, firstName?, lastName?, properties:{auth_mode:"authenticated",platform:"native"}}`; guest `profileId:"guest:<guestId>"`, `auth_mode:"guest"`; identity cleared on change/sign-out. `trackScreenView(pathname)` on every pathname change (uses `screenView(path,{platform})`, else `track("screen_view",{__path,platform})`). Events (AnalyticsEventMap in @smog/shared, all get `platform:"native"`): `gesture_collection_changed {action added|removed, collection favorites|list, gesture_id, source gesture_detail|gesture_list|search_results}`, `gesture_viewed {gesture_id, source direct|favorites|related_gestures|search_results}`, `search_performed {category_count, has_results, query_length, result_count, source filter_change|recent_search|submit}`, `video_playback_completed {gesture_id}`.
- Patches (root package.json `patchedDependencies`):
  - `patches/@openpanel%2Freact-native@1.4.1.patch`: package.json peerDependencies loosened: `expo-application` "5 - 7" -> ">=5"; `expo-constants` "14 - 18" -> ">=14" (needed for Expo 55).
  - `patches/query-string@7.1.3.patch`: index.js `require('decode-uri-component')` -> `require('decode-uri-component').default`.
- Toasts: ToastProvider shows pill at top for 2200ms (fade 180/140ms).
- Metro: aliases `@`, `@/assets|components|context|screens|services|styles|translations`, `@components`; svg via `react-native-svg-transformer` (svg removed from assetExts, added to sourceExts). Babel: preset `babel-preset-expo`, plugin `react-native-reanimated/plugin` (last). tsconfig extends expo/tsconfig.base, strict, `@/*` paths. declaration.d.ts declares `*.svg`. convex.json: `{"functions":"../../packages/convex/src","node":{"externalPackages":["@mux/mux-node"]}}`.
- Tests: Jest (jest-expo preset) `utils/__tests__/startupNavigation.test.js` (cold-start deep-link preservation, welcome redirect waits for nav key, unauthenticated -> /welcome, unstable_settings) and `listOrdering.test.ts` (`moveListItem(items,index,±1)` in utils/listOrdering.ts).
- Assets: `assets/fonts/SpaceMono-Regular.ttf`, `assets/images/{icon.png,adaptive-icon.png,logo.svg,logo-flexible.svg,smog.icon/(icon.json, Assets/logo.svg)}`. iOS icon is Icon Composer `smog.icon`.

## 6. app.json (apps/native/app.json) verbatim
```json
{
  "expo": {
    "name": "SMOG & Co",
    "slug": "smog",
    "version": "2.1.0",
    "runtimeVersion": {
      "policy": "fingerprint"
    },
    "sdkVersion": "55.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "smog",
    "userInterfaceStyle": "automatic",
    "developmentClient": {
      "silentLaunch": true
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "be.zias.smog",
      "icon": "./assets/images/smog.icon",
      "associatedDomains": ["applinks:app.smog.vlaanderen"],
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      },
      "buildNumber": "51",
      "appleTeamId": "96XKP6MU2A"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#00805F"
      },
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "smog"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        },
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "app.smog.vlaanderen"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ],
      "package": "be.zias.smog",
      "versionCode": 80
    },
    "plugins": [
      "expo-router",
      "expo-localization",
      "expo-font",
      "expo-secure-store",
      "expo-video",
      "expo-web-browser",
      "./plugins/withScreenCapturePermissions.js"
    ],
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "router": {},
      "eas": {
        "projectId": "9fa68b63-dfa5-498a-9196-5eba93ecac29"
      }
    },
    "owner": "smog-and-co",
    "updates": {
      "url": "https://u.expo.dev/9fa68b63-dfa5-498a-9196-5eba93ecac29"
    }
  }
}
```
Notes: no splash config in app.json (no expo-splash-screen plugin; runtime loading view only); no explicit Android permissions list (only plugin-added; plugin strips media read perms); no camera/mic usage strings. Root /app.json = `{ "expo": {} }`. Also tools: `apps/native/package.json` version "2.1.0", `"main": "expo-router/entry"`.

## eas.json verbatim
```json
{
  "cli": {
    "version": ">= 16.31.0",
    "appVersionSource": "local"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "env": {
        "NODE_ENV": "development",
        "EXPO_USE_PRECOMPILED_MODULES": "0"
      }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "env": {
        "NODE_ENV": "production",
        "EXPO_USE_PRECOMPILED_MODULES": "0"
      }
    },
    "production": {
      "developmentClient": false,
      "distribution": "store",
      "autoIncrement": true,
      "channel": "production",
      "env": {
        "NODE_ENV": "production",
        "EXPO_USE_PRECOMPILED_MODULES": "0"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

## 7. Dependencies (apps/native/package.json)
scripts: android `expo run:android`, check-types `tsc --noEmit`, dev/start `expo start`, export `NODE_ENV=production expo export --platform all --output-dir dist`, ios `expo run:ios`, test `jest --runInBand`, test:watch `jest --watchAll`, web `expo start --web`. Jest: preset jest-expo with custom transformIgnorePatterns (bun/pnpm aware).
dependencies:
@babel/runtime ^7.29.0; @expo/metro-runtime ~55.0.12; @expo/react-native-action-sheet ^4.1.1; @expo/vector-icons ^15.1.1; @gorhom/bottom-sheet ^5.2.10; @openpanel/react-native ^1.4.1; @openpanel/sdk 1.3.1; @react-native-async-storage/async-storage 2.2.0; @react-native-menu/menu ^2.0.0; @react-navigation/native ^7.1.8; @shopify/flash-list 2.0.2; @smog/auth, config, convex, i18n, shared, styles, types (workspace:*); convex ^1.42.1; expo ~55.0.31; expo-application ~55.0.16; expo-auth-session ~55.0.18; expo-constants ~55.0.16; expo-crypto ~55.0.19; expo-dev-client ~55.0.40; expo-file-system ~55.0.26; expo-font ~55.0.8; expo-glass-effect ~55.0.11; expo-haptics ~55.0.18; expo-linking ~55.0.17; expo-localization ~55.0.19; expo-navigation-bar ~55.0.17; expo-router ~55.0.18; expo-screen-capture ~55.0.18; expo-secure-store ~55.0.18; expo-status-bar ~55.0.6; expo-system-ui ~55.0.22; expo-updates ~55.0.33; expo-video ~55.0.21; expo-web-browser ~55.0.20; i18next ^25.10.10; react 19.2.0; react-dom 19.2.0; react-i18next ^16.6.6; react-native 0.83.10; react-native-draggable-flatlist ^4.0.3; react-native-gesture-handler ~2.30.0; react-native-reanimated 4.2.1; react-native-safe-area-context ~5.6.2; react-native-screens ~4.23.0; react-native-svg 15.15.3; react-native-web ^0.21.2; react-native-webview 13.16.0; react-native-worklets 0.7.4.
devDependencies: @babel/core ^7.29.7; @jest/globals ~29.7.0; @types/jest 29.5.14; babel-preset-expo ~55.0.8; jest ~29.7.0; jest-expo ~55.0.22; react-native-svg-transformer ^1.5.3; react-refresh ^0.18.0; react-test-renderer 19.2.0; typescript ^5.9.3.
Unused-in-code but installed: flash-list, webview, expo-linking (Expo Router uses it), expo-system-ui, expo-updates (runtime fingerprint/OTA), expo-application.
Root workspaces: `apps/*`, `packages/*` (bun); packages: api, auth, config, convex, hooks, i18n, shared, styles, types, ui.
