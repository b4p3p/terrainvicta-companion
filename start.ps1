# Avvia API e interfaccia del companion, poi apre il browser.
#   .\start.ps1            porte 8732 / 3000
#   .\start.ps1 -NoBrowser

param(
    [int]$ApiPort = 8732,
    [int]$WebPort = 3000,
    [switch]$NoBrowser
)

$root = $PSScriptRoot
Write-Host "API      -> http://127.0.0.1:$ApiPort" -ForegroundColor Cyan
Write-Host "Interfaccia -> http://localhost:$WebPort" -ForegroundColor Cyan

$api = Start-Process -PassThru -WindowStyle Minimized python `
    -ArgumentList "-m", "uvicorn", "tiserver.main:app", "--host", "127.0.0.1",
                  "--port", "$ApiPort", "--log-level", "warning" `
    -WorkingDirectory $root

$web = Start-Process -PassThru -WindowStyle Minimized npm `
    -ArgumentList "run", "dev" `
    -WorkingDirectory (Join-Path $root "tiweb")

if (-not $NoBrowser) {
    Start-Sleep -Seconds 4
    Start-Process "http://localhost:$WebPort"
}

Write-Host "`nCtrl+C per fermare entrambi." -ForegroundColor DarkGray
try {
    Wait-Process -Id $api.Id
} finally {
    foreach ($p in @($api, $web)) {
        if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    }
}
