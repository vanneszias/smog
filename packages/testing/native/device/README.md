# Mobile device checks

These are local, stateful Maestro flows. Run the named stage after preparing its
starting screen; running this whole directory as a suite is not supported.
Screenshots and command logs belong in the ignored `results/` directory.

## Setup

- Use a fresh development binary (`be.zias.smog.dev`, scheme `smog-dev`) with
  `expo-network` and `expo-crypto` included, not Expo Go or an older OTA binary.
- Start the migrated/seeded local site on port 5183 and Metro on 8081 with
  `APP_VARIANT=development` and `EXPO_PUBLIC_API_URL=http://localhost:5183`.
  The iOS Simulator can use localhost directly; Android needs adb reverse for
  both ports. Port 5173 was occupied by another service during this review.
- Use English, an online device and the seeded catalogue (including Hond/Kat).
  The seeded admin is `admin@smog.test` / `smog-dev-admin`.
- Select the simulator explicitly. From the repository root, for example:

```sh
bun packages/testing/deadline.ts -- maestro --platform ios --udid <simulator-id> test \
  -e APP_ID=be.zias.smog.dev \
  --test-output-dir packages/testing/native/device/results/<run-name> \
  packages/testing/native/device/<feature>/<flow>.yaml
```

For Android use `--platform android`. Maestro probes Android ports even with an
iOS target; on this machine an unrelated IPv4 listener on port 5668 stalled that
discovery. Set `JAVA_TOOL_OPTIONS=-Djava.net.preferIPv6Addresses=true` for the iOS
command to avoid that listener. `shared/ios-smoke.yaml` starts from Home and covers
search, empty-result and tab screens, ending in Settings; it keeps the device's
existing session and data.

To generate and install the development iOS binary, run these from `apps/mobile`
with the backend and Metro already started:

```sh
APP_VARIANT=development EXPO_PUBLIC_API_URL=http://localhost:5183 bunx expo prebuild --platform ios --no-install
APP_VARIANT=development EXPO_PUBLIC_API_URL=http://localhost:5183 bunx expo run:ios --device <simulator-id> --no-bundler
```

Expo's `--port` and `--no-bundler` options cannot be combined. Xcode 27/iOS 27
also need the registered `with-ios-scenes` plugin: the legacy generated window
startup compiles but is terminated by UIKit at launch.

## Existing Android review stages

| Flow(s) | Starting state / dependencies |
| --- | --- |
| `gestures/search.yaml` | Home; searches Kat, then a nonsense query. |
| `lists/lists.yaml` | Home; signed-in admin; Hond already favorited; creates Animal practice and opens sharing. |
| `lists/list-crud.yaml` | A screen with the Lists tab; creates, renames, shares/revokes and deletes a temporary list. |
| `lists/shared-list.yaml` | Animal practice sharing sheet with an edit link already created. |
| `lists/shared-add.yaml` | Signed-in shared editor; opens search for Kat. |
| `lists/reorder.yaml`, `lists/reorder-confirm.yaml` | Kat search results in a shared list containing Hond; adds Kat and opens its actions. The second flow resumes in reorder mode. |
| `account/account.yaml` | Sharing sheet open; closes it and opens the seeded admin account. |
| `account/account-forms.yaml` | Account screen near Delete my account; opens deletion and password forms. |
| `account/account-export.yaml` | Account screen; exports JSON to the Android share sheet. |
| `shared/dev-tools.yaml` | Settings screen; unlocks and opens the component gallery. |
| `shared/offline.yaml` | Device already offline; Favorites and Lists previously cached. Restore connectivity afterwards. |
| `auth/signout.yaml` | Signed-in admin; Android tab coordinates and confirmation label. |
| `auth/email-code.yaml`, `auth/code-confirm.yaml`, `auth/code-resend.yaml` | Signed-out Settings with Sign in reachable by scrolling, then the code screen; pass the latest local inbox code explicitly as `-e OTP=…`. |
| `auth/auth-other.yaml` | Signed out; requests a password reset, then starts sign-up with `-e QA_EMAIL=…`. |
| `auth/signup.yaml`, `auth/signup-submit.yaml` | Sign-up method screen, then its name-validation state. |
| `auth/qa-signin.yaml`, `account/qa-delete-open.yaml`, `account/qa-delete-confirm.yaml` | Disposable verified Maestro QA account; pass `-e QA_EMAIL=…`; password is `maestro-test-password`. Deletion is destructive to that disposable account. |
| `auth/magic-link.yaml`, `auth/magic-exchange.yaml` | Sign-in method screen, then pass a current local inbox link rewritten to `smog-dev://magic-link/app` as `-e MAGIC_URL=…`. |

The Android-specific coordinates, Back actions and system share/confirmation
labels in these stages must be adapted before using them on iOS. Maestro text
selectors are regular expressions. Rapid text entry can drop/reorder characters
on the emulator: the rename stage enters a character at a time.

## Coverage recorded on 2026-10-27

Android: first-launch consent; Home/search/no results; empty and populated
Favorites/Lists; favorite persistence; list creation/rename/delete/cancel;
view-link creation/copy/revocation; signed-in shared editing, add/reorder/remove;
themes and English/French; account forms and JSON sharing; developer gallery;
offline cached lists/favorites; lesson list/detail and participants PDF language
picker plus Android sharing; password/code/magic-link sign-in, sign-out;
password-reset request; sign-up validation, verification-pending and disposable
account deletion. The lesson was a local fixture, “Maestro practice lesson”,
with three gestures; it is not part of the database seed.

iOS 27/iPhone 17: a fresh development binary compiled and installed. The smoke
flow passed launch/consent, Home, search/no-results and Favorites/Lists/Settings.
Guest list creation passed with the keyboard open (Maestro's `hideKeyboard`
gesture dismissed the entire sheet). Review screenshots are in `results/`.
The rebuilt scene/URL-forwarding binary also passed `lists/ios-shared-guest.yaml`
(guest view-only, guest edit/sign-in prompt, invalid link). Password sign-in,
the guest-import prompt and import were exercised; `account/ios-import-verify.yaml`
confirmed the imported list in the signed-in account after reload. The import
confirmation screen still needs a clean uninterrupted run. Profile save passed;
`account/ios-password-update.yaml` passed from the expanded account form, and the backend
confirmed the saved name and sign-in with the new password. The combined
`account/ios-account-update.yaml` has not yet passed as one uninterrupted flow.

The disposable iOS account is `ios-qa-1027@smog.test`; after the password-update
stage its local-only password is `maestro-ios-updated-password`, and its name is
`iOS QA edited`. The password stages take `QA_PASSWORD` and `NEW_PASSWORD`.
`auth/ios-signout.yaml` starts on Settings and uses a confirmation-button coordinate
for this iPhone 17 viewport. System alert labels also match the underlying screen
in Maestro, so text-only taps can hit the wrong element.

Still to verify on a device: uninterrupted import confirmation; revoked shared
links; advanced video/audio/sponsor states;
provider sign-in/linking; actual HTTPS universal/app-link delivery; completed
password-reset exchange.
The EAS fingerprint regression tests pass locally; a successful replacement EAS
build remains a separate confirmation.
