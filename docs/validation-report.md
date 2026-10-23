# Validation report: Turbo-Autism-Inc/orca

Validation only. No features were implemented. Source commit: `ef91e89faf` (`main`, "test: reduce mobile relay integration startup imports (#29624)").

Environment: Ubuntu Linux x64, 8 vCPU, 31 GiB RAM, Node `v24.19.0`, pnpm `12.14.0`, git `2.34.1`, bash `5.1.16`. `zsh` is not installed. `DISPLAY=:0` is set in interactive shells.

## 1. Stack and entry points

| Item                    | Value                                                                                                                                      | Evidence                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Package manager         | pnpm `12.14.0`                                                                                                                             | `package.json` `packageManager`; `pnpm-lock.yaml`, `pnpm-workspace.yaml`        |
| Node                    | `24`                                                                                                                                       | `package.json` `engines.node`                                                   |
| Desktop framework       | Electron `43.8.1`, built with electron-vite `^6.0.0`, packaged with electron-builder `26.15.3`                                             | `package.json`, `electron.vite.config.ts`, `config/electron-builder.config.cjs` |
| UI                      | React `~19.2.8`, Vite `^8.3.4`, Tailwind `^4.3.3`, zustand `^5.0.15`                                                                       | `package.json`                                                                  |
| Language / typecheck    | TypeScript `^7.0.2`. `pnpm tc` uses tsrs on x64/arm64 Linux, Bun otherwise                                                                 | `AGENTS.md`, `config/scripts/run-typecheck-projects-in-parallel.mjs`            |
| Unit tests              | vitest `5.0.5`, run through Bun `1.4.4` (`bun --bun vitest.mjs`)                                                                           | `config/scripts/run-vitest.mjs`, `config/vitest.config.ts`                      |
| E2E                     | Playwright `^1.63.0` (`tests/playwright.config.ts`, projects `electron-headless` / `electron-headful`)                                     | `package.json` `test:e2e*`                                                      |
| Root workspace packages | `src/packages/*` (`@orca/process-host`), `native/windows-registry`, `native/windows-security`                                              | `pnpm-workspace.yaml`                                                           |
| Separate workspaces     | `mobile/` (Expo `^55.0.31`, React Native `^0.83.10`, own lockfile); `cloud/` (`orca-cloud`: relay, push, relay-fence-broker, own lockfile) | `mobile/package.json`, `cloud/package.json`, `cloud/README.md`                  |

Targets: an Electron desktop app (main, preload and renderer), a Node CLI, a headless server (`orca serve` / `orcad`), a browser web client, and an Expo mobile app.

### Entry points

Electron main build (`config/build-plugins/main-build-entry-points.ts`, used by `electron.vite.config.ts`):

- `src/main/index.ts` → `out/main/index.js` (`package.json` `main`)
- Workers/sidecars: `src/main/daemon/daemon-entry.ts`, `src/main/plugins/plugin-host-entry.ts`, `src/main/computer/computer-sidecar.ts`, `src/main/speech/stt-worker.ts`, `src/main/orcad/orcad-local-serve-selection-entry.ts`, `src/main/ipc/parcel-watcher-process-entry.ts`, and others listed in that file
- Sandboxed preloads: `src/preload/browser-window-close.ts`, `src/preload/doc-preview-link.ts`

Preload: `src/preload/index.ts`

Renderer HTML inputs (`electron.vite.config.ts` lines 330-334):

- `src/renderer/index.html` → `src/renderer/src/main.tsx` (main window)
- `src/renderer/popout.html` → `src/renderer/src/popout.tsx`
- `src/renderer/space.html` → `src/renderer/src/space.tsx`
- `src/renderer/web-index.html` → `src/renderer/src/web/main.tsx` (browser client)

CLI: `src/cli/index.ts` → `out/cli/index.js` (`package.json` `bin.orca`); dev launcher `config/scripts/orca-dev.mjs` (`bin.orca-dev`).

Headless server (orcad): `src/main/orcad/main.ts` and `src/main/orcad/launcher.ts` (`config/scripts/orcad-entry-build.mjs`), built by `pnpm build:orcad`.

Web client build: `vite.web.config.ts` (root `src/renderer`, input `src/renderer/web-index.html`, output `out/web`).

## 2. Server / web mode

**Yes, there is a headless server mode and a browser client.**

### `orca serve`

- Spec: `src/cli/specs/serve.ts`. Help text: "Start an Orca runtime server without opening a desktop window". Usage: `orca serve [--port <port>] [--pairing-address <host>] [--mobile-pairing] [--no-pairing] [--grant-desktop-control] [--project-root <path>] [--recipe-json] [--supervise] [--force] [--json]`. Subcommands: `serve restore resume`, `serve service install|status|uninstall` (LaunchAgent on macOS, systemd user unit on Linux, not on Windows).
- Handler: `src/cli/handlers/core.ts` → `serveOrcaApp()` in `src/cli/runtime/launch.ts`.
- Runtime selection (`src/cli/runtime/launch.ts`, `src/cli/runtime/serve-orcad-launch.ts`): the CLI either runs `orcad` (a plain Node server) or launches Electron with `--serve` plus `headlessServeOzonePlatformSwitches()` (`--ozone-platform=x11` on Linux, `src/shared/headless-serve-ozone-platform.ts`). Electron detects serve mode through `process.argv.includes('--serve')` (`src/main/startup/main-process-preflight.ts:155`, `src/main/startup/configure-process.ts:240`).
- Transport: `src/main/runtime/rpc/ws-transport.ts` runs a `node:http` server with a `ws` `WebSocketServer` on the same port. `DEFAULT_WS_PORT = 6768` (`src/main/runtime/runtime-rpc/runtime-rpc-pairing-types.ts`). The desktop app binds `127.0.0.1` by default; `orca serve` or explicit pairing widens it to `0.0.0.0` (comment STA-2370 in the same file). There is also a local Unix socket transport, `src/main/runtime/rpc/unix-socket-transport.ts`.
- Static web client: `src/main/runtime/rpc/static-web-client-handler.ts` serves `/web-index.html` and `/assets/`, `/cmaps/`, `/standard_fonts/`, `/wasm/` from the bundled web client root (`src/shared/bundled-web-client-root.ts`: `out/web`, or `out/renderer` with a manifest). If no web client is bundled, it returns 404.
- Pairing: by default the server prints a pairing offer and link; `--no-pairing` disables this.

### Run observed in this session

From a dev checkout, `node out/cli/index.js serve` refuses to start:

```
This `orca` command isn't running from an installed Orca app. ... set ORCA_APP_EXECUTABLE to the Orca app executable.
```

`config/scripts/orca-dev.mjs` sets `ORCA_APP_EXECUTABLE` to the repo's Electron binary. After `pnpm run build:desktop:assets` I ran:

```
DISPLAY=:0 ORCA_BACKGROUND_LAUNCH=1 ORCA_USER_DATA=/home/ubuntu/orca-serve-data timeout 100 node config/scripts/orca-dev.mjs serve --no-pairing
```

Output (dbus warnings removed):

```
[serve] using Electron serve: this Orca install carries no orcad template
[daemon] daemon-scope-unavailable: linger off; ...
[serve] orca CLI install: installed (/home/ubuntu/.local/bin/orca-dev)
Orca server ready
Bound endpoint: ws://0.0.0.0:6769
Advertised endpoint: ws://127.0.0.1:6769
Pairing unavailable: disabled_by_operator
```

The server bound 6769, not the default 6768. The log does not say why, and nothing was listening on 6768 at the time.

Probes while it was running:

```
GET /                -> 200 text/html; charset=utf-8
GET /web-index.html  -> 200 text/html; charset=utf-8
GET /assets/         -> 404
GET /nonexistent     -> 404
WebSocket upgrade on / -> HTTP/1.1 101 Switching Protocols
```

`ss -ltnp` showed `electron` listening on `0.0.0.0:6769` and on `127.0.0.1:37943`. When `timeout` stopped it, the Electron process exited with `SIGILL`.

### Other web/remote pieces

- `pnpm dev:web` runs `vite --config vite.web.config.ts --host 127.0.0.1`. This is a dev server for the browser client, not a backend. Not run in this session.
- `pnpm build:web` builds `out/web`; `pnpm build:web-from-renderer` builds the web client from the renderer output (used in `build:desktop:assets`).
- `pnpm build:orcad` builds the standalone Node server into `out/orcad`; `pnpm test:node-server` (`config/scripts/run-node-server-tests.mjs`) runs the headless-server suites under the pinned Node. Neither was run in this session.
- `cloud/apps/relay` is a WebSocket relay that pairs the mobile app with a desktop host (`cloud/README.md`). It is a separate workspace and was not installed or run.

## 3. Typecheck and unit tests

### Typecheck: `pnpm tc` → PASS

- Projects (`config/scripts/run-typecheck-projects-in-parallel.mjs`): `config/tsconfig.node.json`, `config/tsconfig.tc.web.json`, `config/tsconfig.tc.cli.json`, `src/packages/process-host/tsconfig.test.json`
- Exit status `0`, wall clock `0:11.89`, max RSS 4.4 GB (`/usr/bin/time -v`). This was a cold run with no `.cache/typecheck/`.
- `build:cli` also prints `✓ No type errors in 2,996 files`.

### Unit tests: `ORCA_BACKGROUND_LAUNCH=1 pnpm test` → FAIL (exit 1)

```
 Test Files  13 failed | 13343 passed | 168 skipped (13524)
      Tests  29 failed | 133663 passed | 17 expected fail | 1979 skipped | 2 todo (135690)
   Duration  1864.94s (import 36%, tests 36%, transform 24%, setup 3%, environment 1%)
```

Wall clock `31:11.66`.

Failing files and the first error recorded for each:

| File                                                                              | Failed tests | First error                                                                                                               |
| --------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `src/main/git/merge-tree-object-quarantine-real-git.test.ts`                      | 10           | `expected undefined to deeply equal [ 'shared.txt' ]`; `Command failed: git merge-tree --write-tree main feature-extra`   |
| `src/main/repo-icon-autodetect.test.ts`                                           | 4            | `expected undefined to deeply equal { type: 'image', …(3) }`; `expected { gitRemoteIdentity: … }` with a missing field    |
| `src/main/daemon/repro-13767-shell-ready-marker-lost-to-exec.test.ts`             | 3            | `Timed out waiting for PTY output` / `Timed out waiting for fixture state`                                                |
| `config/scripts/adhoc-build-pinned-commit.test.mjs`                               | 2            | `expected { code: 129, output: '' } to deeply equal { code: +0, … }`                                                      |
| `tests/e2e/cross-version-wire/host-model-catalog-released-phone.unit.test.ts`     | 2            | `TypeError: stripTypeScriptTypes is not a function` (bun pool)                                                            |
| `src/main/git/worktree-list-paths.test.ts`                                        | 2            | `expected [ …(2) ] to include '/tmp/orca-worktree-paths-…/linke…'`; `expected true to be false`                           |
| `src/main/runtime/structured-session-cli-login-shell.live-shell.test.ts`          | 2            | `Error: spawn /bin/zsh ENOENT`                                                                                            |
| `src/main/runtime/orca-runtime.test.ts`                                           | 1            | `refuses to relabel a folder whose own GitHub remote names another repository`: `promise resolved … instead of rejecting` |
| `tests/e2e/cursor-quota-transport.unit.test.ts`                                   | 1            | Electron stderr: `Authorization required, but no authorization protocol specified` / `Missing X server or $DISPLAY`       |
| `tests/e2e/cross-version-wire/agent-session-resume-marker-downgrade.unit.test.ts` | 1            | `Test timed out in 30000ms.`                                                                                              |
| `tests/e2e/cross-version-wire/qoder-history-search-downgrade.unit.test.ts`        | 1            | `Test timed out in 30000ms.`                                                                                              |
| `config/scripts/workflow-ref-reachability.test.mjs`                               | suite        | `error: unknown option 'ref-format=reftable'` (from `git init --bare --ref-format=reftable`)                              |
| `tests/e2e/relay-region-correction.unit.test.ts`                                  | suite        | `Cannot find package 'pg' imported from cloud/apps/relay/src/database.ts`                                                 |

These failures match environment facts I observed:

- git is `2.34.1` and rejected `--ref-format=reftable` (the `workflow-ref-reachability` error above). The `merge-tree --write-tree` and exit-129 git failures may have the same cause. This was not verified on a newer git.
- `/bin/zsh` does not exist on this VM (`which zsh` returns nothing).
- The vitest-spawned Electron process had no usable X authorization (stderr above).
- `cloud/` dependencies were not installed, so the `pg` import failed.

I did not determine root causes, and no failures were re-run on a different environment.

## 4. Install size and build time

### Install

| Step                                  | Command                                       | Result                             | Wall clock |
| ------------------------------------- | --------------------------------------------- | ---------------------------------- | ---------- |
| Root                                  | `pnpm install --frozen-lockfile`              | `Packages: +1199`, `Done in 15.7s` | `0:16.35`  |
| Mobile (needed by `build:mobile-web`) | `cd mobile && pnpm install --frozen-lockfile` | `Done in 7.1s`                     | `7.71 s`   |

`config/pnpmfile.cjs` turns on pnpm's global virtual store outside CI, so the root `node_modules` holds symlinks into the store.

| Path                                                          | Size (`du -sh`)                                   |
| ------------------------------------------------------------- | ------------------------------------------------- |
| Repo checkout without `.git` (before install)                 | 464M                                              |
| `.git`                                                        | 1.4G                                              |
| Root `node_modules` (symlinks only)                           | 5.8M                                              |
| pnpm store `~/.local/share/pnpm/store/v11` after root install | 2.1G (`files` 1.5G, `links` 649M, `index.db` 13M) |
| `mobile/node_modules`                                         | 1.2G                                              |
| pnpm store after mobile install                               | 2.9G                                              |
| `out/` after builds                                           | 410M                                              |

The `cloud/` workspace was not installed.

### Build

`pnpm build:desktop` is `pnpm run typecheck && pnpm run build:desktop:assets`. `pnpm build` additionally runs `build:native`.

| Step                                                 | Command                         | Exit | Wall clock |
| ---------------------------------------------------- | ------------------------------- | ---- | ---------- |
| Typecheck                                            | `pnpm tc`                       | 0    | `0:11.89`  |
| JS assets (first attempt, mobile deps not installed) | `pnpm run build:desktop:assets` | 1    | `0:31.72`  |
| Mobile web bundle (after mobile install)             | `pnpm run build:mobile-web`     | 0    | `8.60 s`   |

In the `build:desktop:assets` run, `build:wsl-guest`, `build:cli`, `build:electron-vite` (main `✓ built in 7.25s`, renderer `✓ built in 9.00s`), `verify:built-skills-cli` and `build:web-from-renderer` succeeded. `build:mobile-web` then failed with `Build failed with 577 errors` (`Could not resolve "expo-router"`, `"react-native-safe-area-context"`, `"react-native-web"`, …) because `mobile/node_modules` did not exist. CI installs mobile dependencies through `.github/actions/install-mobile-dependencies` before release builds (`.github/workflows/*-build.yml`). After `mobile/` was installed, `build:mobile-web` passed: `16 route(s), 93 chunk(s) … 144 asset(s), 9830428 bytes`.

Total JS build time: about 52.2 s (11.89 + 31.72 + 8.60). This adds three separate runs, so the 31.72 s includes the failed mobile-web attempt.

Not run: `build:native`, `build:orcad`, electron-builder packaging (`build:linux`, `build:unpack`), `pnpm lint`, Playwright E2E.
