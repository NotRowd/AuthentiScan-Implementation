param([string]$OutputPath = '')
$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent (Split-Path -Parent $mobileRoot)
if (!$OutputPath) { $OutputPath = Join-Path $workspaceRoot 'output/mobile-apk-20261118/AuthentiScan-1.0.0.apk' }
if (!$env:JAVA_HOME) { $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent (Get-Command java).Source) }
if (!$env:ANDROID_HOME) { $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT }
if (!$env:ANDROID_HOME) { throw 'Set ANDROID_HOME to your Android SDK folder.' }
$env:GRADLE_USER_HOME = Join-Path $workspaceRoot 'output/android-build-cache'
$env:AUTHENTISCAN_CXX_ROOT = Join-Path $workspaceRoot 'output/android-cxx'
$env:EXPO_PUBLIC_API_MODE = 'backend'
$env:EXPO_PUBLIC_API_BASE_URL = 'https://authentiscan.52-65-43-68.sslip.io'
$env:NODE_ENV = 'production'
$env:CI = '1'
Push-Location $mobileRoot
try {
    & npx.cmd tsc --noEmit
    if ($LASTEXITCODE) { throw 'TypeScript check failed.' }
    if (!(Test-Path 'android/gradlew.bat')) {
        & npx.cmd expo prebuild --platform android --no-install
        if ($LASTEXITCODE) { throw 'Android prebuild failed.' }
    }
    Push-Location 'android'
    try {
        & ./gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a' '-Pexpo.useLegacyPackaging=true' --init-script '../scripts/android-short-paths.gradle' --no-daemon --max-workers=2 --console=plain
        if ($LASTEXITCODE) { throw 'Android release build failed.' }
    } finally { Pop-Location }
    & node scripts/sign-apk.cjs $OutputPath
    if ($LASTEXITCODE) { throw 'APK signing/verification failed.' }
} finally {
    Pop-Location
}
