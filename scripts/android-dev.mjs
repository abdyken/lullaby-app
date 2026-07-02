#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const androidDir = path.join(root, 'android');
const gradlew = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const apkPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? 'development', ...options.env },
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr ?? '');
      process.stdout.write(result.stdout ?? '');
    }
    process.exit(result.status ?? 1);
  }

  return result.stdout?.trim() ?? '';
}

function adbPath() {
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdkRoot) return 'adb';
  return path.join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
}

function connectedDevice(adb) {
  const output = run(adb, ['devices'], { capture: true });
  const devices = output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial);

  const preferred = process.env.ANDROID_SERIAL;
  if (preferred && devices.includes(preferred)) return preferred;
  if (devices.length > 0) return devices[0];

  console.error('No authorized Android device found. Connect a phone or start an emulator, then run again.');
  process.exit(1);
}

function deviceAbi(adb, serial) {
  return run(adb, ['-s', serial, 'shell', 'getprop', 'ro.product.cpu.abi'], { capture: true });
}

if (!existsSync(gradlew)) {
  console.error('Missing android/gradlew. Run Expo prebuild or restore the native Android project.');
  process.exit(1);
}

const adb = adbPath();
const serial = connectedDevice(adb);
const abi = deviceAbi(adb, serial);
const gradleArgs = [':app:assembleDebug', '-PreactNativeDevServerPort=8081'];
if (abi) gradleArgs.push(`-PreactNativeArchitectures=${abi}`);

console.log(`Building Android debug APK for ${serial}${abi ? ` (${abi})` : ''}...`);
run(gradlew, gradleArgs, { cwd: androidDir });

if (!existsSync(apkPath)) {
  console.error(`APK was not created at ${apkPath}`);
  process.exit(1);
}

console.log(`Installing ${path.relative(root, apkPath)} on ${serial}...`);
run(adb, ['-s', serial, 'install', '-r', '-d', '--user', '0', apkPath]);

run(adb, ['-s', serial, 'reverse', 'tcp:8081', 'tcp:8081']);
console.log('');
console.log('Installed. Now run: npm run dev');
