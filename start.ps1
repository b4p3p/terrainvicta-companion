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

# --timeout-graceful-shutdown: lo stream SSE del browser non si chiude mai da
# solo, e senza un limite uvicorn resterebbe ad aspettarlo.
$uvicornArgs = @("-m", "uvicorn", "tiserver.main:app", "--host", "127.0.0.1",
                 "--port", "$ApiPort", "--log-level", "warning",
                 "--timeout-graceful-shutdown", "2")
if ($NoReload) {
    $apiArgs = $uvicornArgs
} else {
    # Il riavvio al cambio dei sorgenti NON e' `uvicorn --reload`: su Windows il
    # suo supervisore ferma il worker con CTRL_C_EVENT e poi lo aspetta senza
    # timeout. Se il worker non condivide la console (finestra minimizzata,
    # processo in background) l'evento non arriva e il supervisore resta
    # bloccato per sempre: il primo reload parte, gli altri no. watchfiles fa
    # lo stesso lavoro ma dopo --sigint-timeout termina il processo.
    # Sorveglia solo ticore/ e tiserver/, non tiweb/ (ci pensa Next) ne' i
    # salvataggi.
    $apiArgs = @("-m", "watchfiles", "--filter", "python",
                 "--sigint-timeout", "2", "--sigkill-timeout", "1",
                 "`"python $($uvicornArgs -join ' ')`"", "ticore", "tiserver")
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
    # taskkill /T perche' watchfiles e npm lanciano processi figli che
    # Stop-Process lascerebbe vivi a tenere occupata la porta.
    foreach ($p in @($api, $web)) {
        if ($p -and -not $p.HasExited) {
            taskkill /PID $p.Id /F /T 2>&1 | Out-Null
        }
    }
}
