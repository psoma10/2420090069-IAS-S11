# Start Sentinel backend and frontend. Default ports are 48731 / 48732; if a port is taken the next free one is used.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Venv = Join-Path $Root 'backend\.venv'

function Get-FreePort([int]$Start, [int[]]$Skip = @()) {
    for ($p = $Start; $p -lt $Start + 200; $p++) {
        if ($Skip -contains $p) { continue }
        $l = $null
        try {
            $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
            $l.Start(); $l.Stop()
            if (-not (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue)) { return $p }
        } catch { } finally { if ($l) { $l.Stop() } }
    }
    throw "No free port found from $Start"
}

if (-not (Test-Path $Venv)) {
    Write-Host '[sentinel] creating backend virtualenv'
    python -m venv $Venv
}
$Py = Join-Path $Venv 'Scripts\python.exe'
& $Py -m pip install --quiet --upgrade pip
& $Py -m pip install --quiet -r (Join-Path $Root 'backend\requirements.txt')

if (-not (Test-Path (Join-Path $Root 'frontend\node_modules'))) {
    Write-Host '[sentinel] installing frontend dependencies'
    Push-Location (Join-Path $Root 'frontend'); npm install; Pop-Location
}

$bePort = Get-FreePort 48731
$fePort = Get-FreePort 48732 @($bePort)
if ($bePort -ne 48731) { Write-Host "[sentinel] 48731 busy, backend using $bePort" }
if ($fePort -ne 48732) { Write-Host "[sentinel] 48732 busy, frontend using $fePort" }
$env:SENTINEL_API_PORT = "$bePort"
$env:SENTINEL_FE_PORT = "$fePort"

$be = Start-Process -PassThru -WindowStyle Hidden -FilePath $Py -WorkingDirectory (Join-Path $Root 'backend') `
      -ArgumentList '-m','uvicorn','app.main:app','--port',"$bePort"
$fe = Start-Process -PassThru -WindowStyle Hidden -FilePath 'cmd.exe' -WorkingDirectory (Join-Path $Root 'frontend') `
      -ArgumentList '/c','npm run dev'

Start-Sleep -Seconds 4
Write-Host "[sentinel] UI: http://localhost:$fePort   API docs: http://localhost:$bePort/docs"
Start-Process "http://localhost:$fePort"
Write-Host 'Press Enter to stop both servers.'
[void](Read-Host)
foreach ($p in @($be, $fe)) { if ($p -and -not $p.HasExited) { taskkill /PID $p.Id /T /F | Out-Null } }
