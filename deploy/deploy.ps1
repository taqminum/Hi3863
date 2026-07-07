param(
  [string]$HostName = "101.132.21.134",
  [string]$User = "rxcccccc",
  [string]$RemoteDir = "/home/rxcccccc/ws63-platform"
)

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$archive = Join-Path $env:TEMP "ws63-platform-deploy.tar.gz"
$remoteScriptPath = Join-Path $env:TEMP "ws63-platform-remote-deploy.sh"

Push-Location $repo
try {
  npm run test
  npm run build
  if (Test-Path $archive) {
    Remove-Item -LiteralPath $archive -Force
  }
  tar `
    --exclude=node_modules `
    --exclude=.git `
    --exclude=data `
    --exclude=fb_code/src/output `
    --exclude=apps/web/node_modules `
    --exclude=apps/web/android `
    --exclude=apps/server/data `
    -czf $archive `
    package.json package-lock.json apps deploy .gitignore
} finally {
  Pop-Location
}

ssh "$User@$HostName" "mkdir -p '$RemoteDir' '$RemoteDir/releases' '$RemoteDir/data'"
scp $archive "${User}@${HostName}:$RemoteDir/releases/ws63-platform-deploy.tar.gz"

$remoteScript = @"
set -euo pipefail
cd '$RemoteDir'
tar -xzf releases/ws63-platform-deploy.tar.gz
npm ci
VITE_BASE_PATH=/ws63/ VITE_API_BASE_URL=/ws63-api npm run build
sudo rm -rf /var/www/ws63-platform
sudo mkdir -p /var/www/ws63-platform
sudo cp -r apps/web/dist/. /var/www/ws63-platform/
sudo chown -R www-data:www-data /var/www/ws63-platform
pm2 describe ws63-platform >/dev/null 2>&1 && pm2 restart ws63-platform || pm2 start deploy/run-server.sh --name ws63-platform
pm2 save
sudo nginx -s reload
"@

[System.IO.File]::WriteAllText(
  $remoteScriptPath,
  (($remoteScript -replace "`r", "").Trim() + "`n"),
  [System.Text.UTF8Encoding]::new($false)
)
scp $remoteScriptPath "${User}@${HostName}:$RemoteDir/releases/remote-deploy.sh"
ssh "$User@$HostName" "bash '$RemoteDir/releases/remote-deploy.sh'"

$smokeScript = Join-Path $PSScriptRoot "smoke.ps1"
if ($env:DEVICE_INGEST_KEY) {
  powershell -NoProfile -ExecutionPolicy Bypass -File $smokeScript -BaseUrl "https://www.rxcccccc.icu/ws63-api" -DeviceKey $env:DEVICE_INGEST_KEY
} else {
  powershell -NoProfile -ExecutionPolicy Bypass -File $smokeScript -BaseUrl "https://www.rxcccccc.icu/ws63-api"
}

Write-Host "Deployed to https://www.rxcccccc.icu/ws63/"
Write-Host "API smoke test passed at https://www.rxcccccc.icu/ws63-api"
