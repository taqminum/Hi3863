param(
    [string]$BaseUrl = "http://192.168.5.1:8080",
    [ValidateSet("root", "data", "forward", "backward", "left", "right", "stop", "auto_start", "auto_stop")]
    [string]$Action = "data",
    [ValidateRange(0, 100)]
    [int]$Speed = 35,
    [ValidateRange(0, 3000)]
    [int]$DurationMs = 600,
    [switch]$DryRun
)

function Invoke-CarGet {
    param(
        [string]$Uri
    )

    Write-Host "GET $Uri"
    if ($DryRun) {
        return
    }

    Invoke-RestMethod -Method Get -Uri $Uri
}

function Invoke-CarPost {
    param(
        [string]$Uri,
        [hashtable]$Payload
    )

    $json = $Payload | ConvertTo-Json -Compress
    Write-Host "POST $Uri"
    Write-Host $json
    if ($DryRun) {
        return
    }

    Invoke-RestMethod -Method Post -Uri $Uri -ContentType "application/json" -Body $json
}

switch ($Action) {
    "root" {
        Invoke-CarGet -Uri "$BaseUrl/"
    }
    "data" {
        Invoke-CarGet -Uri "$BaseUrl/api/data"
    }
    "auto_start" {
        Invoke-CarPost -Uri "$BaseUrl/api/control" -Payload @{
            cmd = "auto_start"
        }
    }
    "auto_stop" {
        Invoke-CarPost -Uri "$BaseUrl/api/control" -Payload @{
            cmd = "auto_stop"
        }
    }
    default {
        Invoke-CarPost -Uri "$BaseUrl/api/control" -Payload @{
            cmd = $Action
            speed = $Speed
            duration_ms = $DurationMs
        }
    }
}
