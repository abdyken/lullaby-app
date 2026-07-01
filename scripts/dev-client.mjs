#!/usr/bin/env node

/**
 * Reliable Android dev-client launcher.
 *
 * Verifies a device is connected, picks a usable Metro port, makes Metro reachable
 * over `adb reverse` on that port, starts Expo for the development build, and
 * auto-opens the installed dev build through the expo-development-client deep link
 * once Metro is ready. Ctrl+C cleanly stops the child Expo process.
 *
 * Port selection (never fails just because a port is taken):
 *   - Preferred port = `--port <n>` CLI arg, else EXPO_DEV_PORT, else 8081.
 *   - Preferred port free                       → use it.
 *   - Preferred port held by THIS script's own
 *     stale Metro (node/expo/metro)             → stop it (SIGTERM) and reuse the
 *                                                  port. Pre-existing behavior; the
 *                                                  script owns its own port.
 *   - Preferred port held by an UNRELATED,
 *     non-Metro process (a browser, some server) → never touch it; scan upward
 *                                                  (8082, 8083, …) for the next free
 *                                                  port and use that instead.
 *
 * This does NOT build or install the app — run `npm run android` for that.
 */

import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();

const DEFAULT_PORT = 8081;
// How far above the preferred port to look for a free one before giving up.
const MAX_PORT_SCAN = 20;

// Default the local-dev feature flag unless the caller already set it.
if (!process.env.EXPO_PUBLIC_LOGGING_V2) {
  process.env.EXPO_PUBLIC_LOGGING_V2 = '1';
}

function fail(message) {
  console.error(`\n[dev] ${message}\n`);
  process.exit(1);
}

function sleepMs(ms) {
  // Blocking sleep with no extra child process.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function adbBin() {
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdkRoot) return 'adb';
  return path.join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
}

function adb(args, { check = true } = {}) {
  const result = spawnSync(adbBin(), args, { encoding: 'utf8' });
  if (result.error) {
    if (check) fail(`Could not run adb. Install the Android SDK platform-tools or set ANDROID_HOME.\n  ${result.error.message}`);
    return '';
  }
  if (check && result.status !== 0) {
    const msg = (result.stderr || result.stdout || '').trim();
    throw new Error(`adb ${args.join(' ')} failed: ${msg || `exit ${result.status}`}`);
  }
  return (result.stdout || '').trim();
}

function connectedDevice() {
  const output = adb(['devices']);
  const devices = output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial);

  const preferred = process.env.ANDROID_SERIAL;
  if (preferred && devices.includes(preferred)) return preferred;
  if (devices.length > 0) return devices[0];

  fail('No authorized Android device found. Plug in your phone (USB debugging on) or start an emulator, then run `npm run dev` again.');
}

// --- port selection -------------------------------------------------------

/** A process on our port is "ours to reclaim" only if it looks like Metro/Expo. */
function looksLikeMetro(args) {
  return /node|expo|metro/i.test(args);
}

function pidsOnPort(port) {
  const res = spawnSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' });
  if (res.error || res.status !== 0) return [];
  return res.stdout.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

function processArgs(pid) {
  const res = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' });
  return (res.stdout || '').trim();
}

/** Classify a port: 'free', 'metro' (only our stale dev server), or 'blocked'. */
function classifyPort(port) {
  const pids = pidsOnPort(port).filter((pid) => String(pid) !== String(process.pid));
  if (pids.length === 0) return { state: 'free', infos: [] };
  const infos = pids.map((pid) => ({ pid, args: processArgs(pid) }));
  const allMetro = infos.every((info) => looksLikeMetro(info.args));
  return { state: allMetro ? 'metro' : 'blocked', infos };
}

/** Read the caller's preferred port from `--port <n>` / `--port=<n>` or EXPO_DEV_PORT. */
function preferredPort() {
  const argv = process.argv.slice(2);
  let fromCli = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port' && argv[i + 1]) fromCli = argv[i + 1];
    else if (argv[i].startsWith('--port=')) fromCli = argv[i].slice('--port='.length);
  }
  const raw = fromCli ?? process.env.EXPO_DEV_PORT ?? String(DEFAULT_PORT);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    console.warn(`[dev] Ignoring invalid port "${raw}"; using ${DEFAULT_PORT}.`);
    return DEFAULT_PORT;
  }
  return parsed;
}

/**
 * Resolve a usable Metro port starting from `preferred`. Reclaims ONLY this
 * script's own stale Metro on the preferred port (SIGTERM); a non-Metro process is
 * never killed — we fall back to the next free port instead, so `npm run dev`
 * never fails just because 8081 is taken by an unrelated app.
 */
function resolvePort(preferred) {
  const primary = classifyPort(preferred);

  if (primary.state === 'free') return preferred;

  if (primary.state === 'metro') {
    for (const { pid } of primary.infos) {
      console.log(`[dev] Stopping stale Metro on port ${preferred} (PID ${pid}).`);
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
    sleepMs(1000); // let the OS release the socket
    return preferred;
  }

  // 'blocked' — an unrelated, non-Metro process holds the preferred port. Leave it
  // running and scan upward for the next genuinely free port (no killing).
  const heldBy = primary.infos.map((info) => info.args || '(unknown process)').join(', ');
  for (let port = preferred + 1; port <= preferred + MAX_PORT_SCAN; port += 1) {
    if (classifyPort(port).state === 'free') {
      console.log(`[dev] Port ${preferred} is busy with non-Metro process, using ${port} instead.`);
      console.log(`[dev]   (${preferred} is held by: ${heldBy})`);
      return port;
    }
  }

  fail(
    `Port ${preferred} is busy with a non-Metro process and no free port was found in ` +
      `${preferred + 1}-${preferred + MAX_PORT_SCAN}.\n  ${preferred} is held by: ${heldBy}\n` +
      `Free a port, or set EXPO_DEV_PORT=<n> / pass \`-- --port <n>\`, then retry.`,
  );
}

function ensureReverse(serial, port) {
  // Remove a stale reverse for this port only if one already exists, then (re)apply.
  const list = adb(['-s', serial, 'reverse', '--list'], { check: false });
  if (new RegExp(`\\btcp:${port}\\b`).test(list)) {
    adb(['-s', serial, 'reverse', '--remove', `tcp:${port}`], { check: false });
  }
  try {
    adb(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    console.log(`[dev] adb reverse tcp:${port} -> device tcp:${port} ready.`);
  } catch (err) {
    fail(`adb reverse failed; Metro on the phone won't reach your machine.\n  ${err.message}`);
  }
}

function main() {
  const serial = connectedDevice();
  console.log(`[dev] Using Android device ${serial}.`);

  const port = resolvePort(preferredPort());
  // expo-development-client deep link pointing Metro at the reversed loopback port.
  const deepLink = `lullaby://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${port}`;

  ensureReverse(serial, port);

  const expoArgs = ['expo', 'start', '--dev-client', '--clear', '--port', String(port), '--host', 'localhost'];
  console.log(`[dev] Starting Metro: npx ${expoArgs.join(' ')}`);

  const child = spawn('npx', expoArgs, {
    cwd: root,
    env: process.env,
    // stdin inherited so Expo's interactive keys still work; stdout piped so we can watch for readiness.
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let opened = false;
  let scheduled = false;
  let buffer = '';
  const READY_RE = /(Waiting on http|Logs for your project will appear below|Metro waiting|Bundler ready|exp:\/\/)/i;

  function openApp() {
    if (opened) return;
    opened = true;
    clearTimeout(fallbackTimer);
    console.log('\n[dev] Opening the dev build via the development-client deep link...');
    // No shell involved: args are passed literally; the URL is single-quoted so the
    // device-side shell treats `?` as a literal, not a glob.
    const res = spawnSync(
      adbBin(),
      ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${deepLink}'`],
      { encoding: 'utf8' }
    );
    if (res.error || res.status !== 0) {
      const msg = (res.stderr || res.stdout || res.error?.message || '').trim();
      console.error(`[dev] Could not auto-open the app (${msg || 'unknown error'}).`);
      console.error('[dev] Is the dev build installed? If not, run `npm run android` first.');
      console.error(`[dev] To open manually:\n  adb shell am start -a android.intent.action.VIEW -d "${deepLink}"`);
    } else {
      console.log('[dev] App launched. Metro is running here — press Ctrl+C to stop.');
    }
  }

  // Fallback: open even if we never match a readiness marker.
  const fallbackTimer = setTimeout(() => {
    if (!opened) openApp();
  }, 25000);

  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    buffer += chunk.toString();
    if (!opened && !scheduled && READY_RE.test(buffer)) {
      scheduled = true;
      setTimeout(openApp, 1500); // let the bundler settle before the deep link
    }
  });

  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  function shutdown() {
    clearTimeout(fallbackTimer);
    if (child && child.exitCode === null && !child.killed) {
      child.kill('SIGINT');
    }
  }

  process.on('SIGINT', () => {
    console.log('\n[dev] Shutting down Metro...');
    shutdown();
  });
  process.on('SIGTERM', shutdown);

  child.on('error', (err) => fail(`Failed to start Expo: ${err.message}`));
  child.on('exit', (code) => {
    clearTimeout(fallbackTimer);
    process.exit(code ?? 0);
  });
}

main();
