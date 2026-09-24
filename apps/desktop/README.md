# Agent V desktop

A [Tauri 2](https://v2.tauri.app) shell around the Expo web export of `apps/app`, for macOS,
Windows and Linux. It adds a tray icon, native notifications, a single running instance, and
remembers the window's size and position. Links the app opens in a new window go to your default
browser.

## Prerequisites

- Rust (stable) and the platform dependencies listed at
  <https://v2.tauri.app/start/prerequisites/> (on Linux: WebKitGTK 4.1, librsvg, appindicator).
- `pnpm install` at the repo root.

## Develop

Start the web app, then the desktop shell, which loads it from `http://localhost:8081`:

```sh
pnpm --filter @agent-v/app web
pnpm --filter @agent-v/desktop tauri:dev
```

## Build

```sh
EXPO_PUBLIC_API_URL=https://your-server pnpm --filter @agent-v/desktop tauri:build
```

This exports the web app to `apps/app/dist/desktop` and bundles it; installers land in
`apps/desktop/src-tauri/target/release/bundle/`. The API URL is baked in at build time. The
Desktop GitHub workflow builds all three platforms (set the `DESKTOP_API_URL` repository
variable).

## Server setup

The desktop app is served from `tauri://localhost` (macOS, Linux) or `http://tauri.localhost`
(Windows), so add both to the server's `ALLOWED_ORIGINS`:

```sh
ALLOWED_ORIGINS=https://your-web-app,tauri://localhost,http://tauri.localhost
```

For no sign-in, run the server on the same computer with `SINGLE_USER=true`: the app then
opens straight into the one built-in account.

It signs in with a bearer token, like the phone apps (kept in the webview's local storage, as on
the web).

## Behaviour

Closing the window hides it to the tray so notifications keep arriving; use the tray's **Quit**
to exit. Clicking the tray icon (or launching the app again) brings the window back.
