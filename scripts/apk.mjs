// Build the debug APK (requires Android SDK + local Gradle zip)
// Usage: node scripts/apk.mjs
import { spawn } from 'node:child_process';
import { join } from 'node:path';
const app = new URL('../app/', import.meta.url).pathname;
const android = join(app, 'android');
const env = {
  ...process.env,
  ANDROID_HOME: process.env.ANDROID_HOME || 'H:\\android-sdk',
  ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || 'H:\\android-sdk',
  JAVA_HOME: process.env.JAVA_HOME || 'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.19.10-hotspot',
};
const child = spawn('cmd.exe', ['/c', 'gradlew.bat', 'assembleDebug'], { cwd: android, stdio: 'inherit', env, shell: true });
child.on('exit', (code) => process.exit(code ?? 1));
