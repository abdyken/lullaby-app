#!/usr/bin/env node

/**
 * Reliable Android dev-client launcher.
 *
 * Verifies a device is connected, makes Metro reachable over `adb reverse`,
 * frees a stale Metro on the port, starts Expo for the development build,
 * and auto-opens the installed dev build through the expo-development-client
 * deep link once Metro is ready. Ctrl+C cleanly stops the child Expo process.
 *
 * This does NOT build or install the app — run `npm run android` for that.
 */

import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const PORT = 8081;
// expo-development-client deep link pointing Metro at the reversed loopback port.
const DEEP_LINK = `lullaby://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${PORT}`;

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

function ensureReverse(serial) {
  // Remove a stale 8081 reverse only if one already exists, then (re)apply.
  const list = adb(['-s', serial, 'reverse', '--list'], { check: false });
  if (/\btcp:8081\b/.test(list)) {
    adb(['-s', serial, 'reverse', '--remove', `tcp:${PORT}`], { check: false });
  }
  try {
    adb(['-s', serial, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`]);
    console.log(`[dev] adb reverse tcp:${PORT} -> device tcp:${PORT} ready.`);
  } catch (err) {
    fail(`adb reverse failed; Metro on the phone won't reach your machine.\n  ${err.message}`);
  }
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

function freePort(port) {
  const pids = pidsOnPort(port);
  if (pids.length === 0) return;
  for (const pid of pids) {
    if (String(pid) === String(process.pid)) continue;
    const args = processArgs(pid);
    const looksLikeMetro = /node|expo|metro/i.test(args);
    if (!looksLikeMetro) {
      fail(`Port ${port} is busy with PID ${pid}, which does not look like Metro:\n  ${args || '(unknown process)'}\nStop it manually, then retry.`);
    }
    console.log(`[dev] Stopping stale Metro on port ${port} (PID ${pid}).`);
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  sleepMs(1000); // let the OS release the socket
}

function main() {
  const serial = connectedDevice();
  console.log(`[dev] Using Android device ${serial}.`);

  freePort(PORT);
  ensureReverse(serial);

  const expoArgs = ['expo', 'start', '--dev-client', '--clear', '--port', String(PORT), '--host', 'localhost'];
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
      ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${DEEP_LINK}'`],
      { encoding: 'utf8' }
    );
    if (res.error || res.status !== 0) {
      const msg = (res.stderr || res.stdout || res.error?.message || '').trim();
      console.error(`[dev] Could not auto-open the app (${msg || 'unknown error'}).`);
      console.error('[dev] Is the dev build installed? If not, run `npm run android` first.');
      console.error(`[dev] To open manually:\n  adb shell am start -a android.intent.action.VIEW -d "${DEEP_LINK}"`);
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
