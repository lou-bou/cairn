# Cairn mobile

A Flutter app for Cairn, for personal use: built here, sideloaded as an APK, never published.
It talks to the same API as the web app and does not touch the server or web code. The deploy
ignores this folder (`.dockerignore`).

```
mobile/
  packages/kit/   shared core, reused by the other apps (Cahier, Whirl, Nook, Tack)
  cairn/          the Cairn app: models, money math, screens
  keys/           release signing key and its passwords (gitignored, back it up)
```

## How it works

- **Auth.** Every request carries the Cloudflare Access service token
  (`CF-Access-Client-Id` / `CF-Access-Client-Secret`). There are no cookies, no browser and no
  login redirects; redirects are never followed. If Access refuses the token the app says so
  ("Access refused") instead of looking offline. The server address and token are typed in on
  the phone and kept in the Android Keystore. Nothing secret is in this repo or in the APK.
- **Fast open.** The last data is kept on disk and is on screen in the first frame. It refreshes
  in the background on open, on resume, every 60 seconds and on pull-to-refresh.
- **Bad connections.** Adding, editing and deleting entries works offline. Changes show at once,
  wait in a queue on the phone, and are sent in order when the server answers. The header shows
  how many are waiting; tap it to see, retry or discard them. Search, filters and stats run on
  the phone, so they work offline too. Goal, milestones, settings, counts, import and export
  need the server.
- **No duplicates.** The server has no idempotency key, so before re-sending an entry whose
  first attempt may have arrived (timeout, app killed mid-request), the app checks the server
  for that entry and claims it instead of creating a second one.

## Cloudflare Access setup (once)

1. Zero Trust → **Access → Service Auth → Service Tokens** → create a token. Copy the client ID
   and secret; the secret is shown once.
2. **Access → Applications** → the Cairn application (or the wildcard one) → **Policies** → add
   a policy with action **Service Auth**, Include → **Service Token** → that token. An Allow
   policy does not accept service tokens.
3. In the app: enter `https://cairn.<domain>`, the client ID and the secret, then **Test and
   save**. "Copy setup" in Settings → Connection copies all three so the next app can
   "Paste setup".

## Install and update

Releases are built by GitHub (`.github/workflows/mobile-release.yml`). To publish one:

```sh
git tag mobile-v1.0.1 && git push origin mobile-v1.0.1
```

A few minutes later the signed APK is on the repo's Releases page. Open that page on the phone,
tap `cairn-1.0.1.apk`, and allow the browser to install apps the first time. Updates install
over the existing app and keep the saved connection.

The workflow needs two repository secrets (Settings → Secrets and variables → Actions):
`MOBILE_KEYSTORE_BASE64` (`base64 -w0 mobile/keys/release.jks`) and `MOBILE_KEYSTORE_PASSWORD`
(the `storePassword` value in `mobile/keys/key.properties`).

To build on this machine instead (needs Flutter, JDK 17 and the Android SDK):

```sh
cd mobile/cairn
flutter build apk --release --target-platform android-arm64
adb install -r build/app/outputs/flutter-apk/app-release.apk
```

**Signing key.** `mobile/keys/release.jks` and `key.properties` are not in git. Updates only
install over an existing copy when signed with the same key, so back both files up. Without
them the build falls back to the debug key, and installing that over a release-signed copy
fails until the app is uninstalled (which also forgets the saved token). The same key can sign
the other apps.

## Develop

```sh
cd mobile/packages/kit && flutter analyze && flutter test
cd mobile/cairn && flutter analyze && flutter test
flutter run                                           # on a connected phone
flutter test tool/screenshots_test.dart --update-goldens   # PNGs of each screen in build/screens/
```

## Starting the next app

Create it next to `cairn/`, depend on `kit` by path, and reuse: `KitBoot` (startup),
`ConnectionScreen` (server + token setup), `ApiClient` (auth and failure handling),
`netStatusProvider`, `JsonStore` and `Prefs` (cache and preferences), `Outbox` (offline queue),
`buildKitTheme` with `KitTokens` (pass a different accent), and the widgets (`KitSheet`,
`KitButton`, `KitSegmented`, `KitChips`, `KitField`, `Toasts`). `cairn/lib/main.dart` and
`cairn/lib/app.dart` are the template for wiring them together.

## Not done

- iOS: the project folder exists but has not been built or configured.
- Plain `http://` server addresses are blocked by Android in release builds; use HTTPS.
