param(
  [string]$ApiBaseUrl = "https://www.rxcccccc.icu/ws63-api",
  [string]$BasePath = "/"
)

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$webDir = Join-Path $repo "apps/web"
$androidDir = Join-Path $webDir "android"

function Invoke-NativeChecked {
  param(
    [scriptblock]$Command,
    [string]$Name
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

Push-Location $webDir
try {
  $env:VITE_BASE_PATH = $BasePath
  $env:VITE_API_BASE_URL = $ApiBaseUrl
  Invoke-NativeChecked { npm run build } "npm run build"
  Invoke-NativeChecked { npx cap sync android } "npx cap sync android"
} finally {
  Pop-Location
}

Push-Location $androidDir
try {
  Invoke-NativeChecked { .\gradlew.bat -I gradle-mirror.init.gradle assembleDebug } "Gradle assembleDebug"
} finally {
  Pop-Location
}

Write-Host "APK built: apps/web/android/app/build/outputs/apk/debug/app-debug.apk"
