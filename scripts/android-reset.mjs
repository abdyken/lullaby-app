#!/usr/bin/env node

/**
 * Clean-slate reset for first-run testing.
 *
 * `adb shell pm clear` fails on some devices (CLEAR_APP_USER_DATA permission),
 * so this uninstalls the dev build instead. After it finishes, run
 * `npm run android` to build + install fresh. This is intentionally NOT part
 * of the normal `npm run dev` flow.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PACKAGE = 'com.lullaby.app';

function adbBin() {
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdkRoot) return 'adb';
  return path.join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
}

function adb(args, { check = true } = {}) {
  const result = spawnSync(adbBin(), args, { encoding: 'utf8' });
  if (result.error) {
    if (check) {
      console.error(`\n[reset] Could not run adb. Install the Android SDK platform-tools or set ANDROID_HOME.\n  ${result.error.message}\n`);
      process.exit(1);
    }
    return '';
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

  console.error('\n[reset] No authorized Android device found. Connect a device and retry.\n');
  process.exit(1);
}

const serial = connectedDevice();
console.log(`[reset] Uninstalling ${PACKAGE} from ${serial} (ignored if not installed)...`);
// Mirror `adb uninstall ... || true`: a missing package must not fail the reset.
const res = spawnSync(adbBin(), ['-s', serial, 'uninstall', PACKAGE], { stdio: 'inherit' });
if (res.status !== 0) {
  console.log('[reset] Package was not installed (nothing to remove).');
}

console.log('');
console.log('[reset] Done. Now run: npm run android');
