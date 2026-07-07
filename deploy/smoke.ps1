param(
  [string]$BaseUrl = "https://www.rxcccccc.icu/ws63-api",
  [string]$Username = "admin",
  [string]$Password = "admin123",
  [string]$DeviceId = "ws63-car-001",
  [string]$BaseStationId = "sle-base-001",
  [string]$DeviceKey = $env:DEVICE_INGEST_KEY
)

$ErrorActionPreference = "Stop"
$base = $BaseUrl.TrimEnd("/")

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )

  $uri = "$base$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers
  }

  return Invoke-RestMethod `
    -Method $Method `
    -Uri $uri `
    -Headers $Headers `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json -Depth 10)
}

Write-Host "Smoke: health $base/api/health"
$health = Invoke-Json -Method GET -Path "/api/health"
if (-not $health.ok) {
  throw "Health check returned ok=false"
}

Write-Host "Smoke: login $Username"
$session = Invoke-Json -Method POST -Path "/api/auth/login" -Body @{
  username = $Username
  password = $Password
}
if (-not $session.token) {
  throw "Login did not return token"
}

$authHeaders = @{ Authorization = "Bearer $($session.token)" }

Write-Host "Smoke: dashboard $DeviceId"
$dashboard = Invoke-Json -Method GET -Path "/api/dashboard?deviceId=$([uri]::EscapeDataString($DeviceId))" -Headers $authHeaders
if (-not $dashboard.devices -or -not $dashboard.baseStations) {
  throw "Dashboard response is missing devices or baseStations"
}

if (-not $DeviceKey) {
  Write-Host "Smoke: skipped base-station protocol because DEVICE_INGEST_KEY is not set"
  exit 0
}

Write-Host "Smoke: create command"
$created = Invoke-Json -Method POST -Path "/api/commands" -Headers $authHeaders -Body @{
  deviceId = $DeviceId
  baseStationId = $BaseStationId
  action = "stop"
  speed = 0
}
if (-not $created.command.id) {
  throw "Command creation did not return command.id"
}

$deviceHeaders = @{ "X-Device-Key" = $DeviceKey }
$jsonDeviceHeaders = @{
  "X-Device-Key" = $DeviceKey
  "Content-Type" = "application/json"
}

Write-Host "Smoke: pull pending command"
$pending = Invoke-Json -Method GET -Path "/api/base-stations/$BaseStationId/commands/pending" -Headers $deviceHeaders
$command = $pending.commands | Where-Object { $_.id -eq $created.command.id } | Select-Object -First 1
if (-not $command) {
  throw "Pending command pull did not include created command $($created.command.id)"
}

Write-Host "Smoke: ack command"
$ack = Invoke-Json -Method PATCH -Path "/api/commands/$($created.command.id)/ack" -Headers $jsonDeviceHeaders -Body @{
  status = "executed"
}
if ($ack.command.status -ne "executed") {
  throw "Command ack did not persist executed status"
}

Write-Host "Smoke: ingest telemetry"
$batchId = "smoke-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
$telemetry = Invoke-Json -Method POST -Path "/api/ingest/base-stations/$BaseStationId/telemetry" -Headers $jsonDeviceHeaders -Body @{
  batchId = $batchId
  sequence = 1
  receivedAt = [DateTimeOffset]::UtcNow.ToString("o")
  link = @{
    rssi = -58
    cachedCount = 0
    mode = "sle"
  }
  devices = @(
    @{
      deviceId = $DeviceId
      temperature = 26.5
      humidity = 52
      lightness = 720
      gear = "N"
      direction = "stop"
      status = "idle"
    }
  )
}
if (-not $telemetry.readings -or $telemetry.duplicate) {
  throw "Telemetry ingest did not create a fresh reading"
}

Write-Host "Smoke: passed"
