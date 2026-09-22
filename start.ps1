# Avvia API e interfaccia del companion, poi apre il browser.
#   .\start.ps1            porte 8732 / 3000
#   .\start.ps1 -NoBrowser

param(
    [int]$ApiPort = 8732,
    [int]$WebPort = 3000,
    [switch]$NoBrowser,
    [switch]$NoReload      # l'API non si ricarica da sola al cambio dei sorgenti
)

$root = $PSScriptRoot
Write-Host "API      -> http://127.0.0.1:$ApiPort" -ForegroundColor Cyan
Write-Host "Interfaccia -> http://localhost:$WebPort" -ForegroundColor Cyan

# --reload: riavvia l'API quando cambiano i sorgenti, come runserver di Django.
# Sorveglia solo ticore/ e tiserver/, non tiweb/ (ci pensa Next) ne' i salvataggi.
$apiArgs = @("-m", "uvicorn", "tiserver.main:app", "--host", "127.0.0.1",
             "--port", "$ApiPort", "--log-level", "warning")
if (-not $NoReload) {
    $apiArgs += @("--reload", "--reload-dir", "ticore", "--reload-dir", "tiserver")
}

$api = Start-Process -PassThru -WindowStyle Minimized python `
    -ArgumentList $apiArgs `
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
    # taskkill /T perche' uvicorn --reload e npm lanciano processi figli che
    # Stop-Process lascerebbe vivi a tenere occupata la porta.
    foreach ($p in @($api, $web)) {
        if ($p -and -not $p.HasExited) {
            taskkill /PID $p.Id /F /T 2>&1 | Out-Null
        }
    }
}
