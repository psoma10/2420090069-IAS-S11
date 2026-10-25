param([string]$BaseUrl = "http://127.0.0.1:48731", [string[]]$PytestArgs = @())
$ErrorActionPreference = "Stop"
$qa = $PSScriptRoot
$root = Split-Path $qa -Parent
$venv = Join-Path $qa ".venv"
if (-not (Test-Path "$venv\Scripts\python.exe")) {
  python -m venv $venv
  & "$venv\Scripts\python.exe" -m pip install -q -r "$qa\requirements.txt"
}
function Test-Up { try { (Invoke-WebRequest -UseBasicParsing "$BaseUrl/api/health" -TimeoutSec 2).StatusCode -eq 200 } catch { $false } }
$proc = $null
if (-not (Test-Up)) {
  $py = Join-Path $root "backend\.venv\Scripts\python.exe"
  $proc = Start-Process -FilePath $py -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","48731" -WorkingDirectory (Join-Path $root "backend") -PassThru -WindowStyle Hidden -RedirectStandardError (Join-Path $env:TEMP "sentinel_be_err.txt") -RedirectStandardOutput (Join-Path $env:TEMP "sentinel_be_out.txt")
  $ok = $false
  for ($i = 0; $i -lt 120; $i++) { Start-Sleep -Milliseconds 500; if (Test-Up) { $ok = $true; break } }
  if (-not $ok) { if ($proc) { Stop-Process -Id $proc.Id -Force }; throw "Backend failed to start" }
}
$env:BASE_URL = $BaseUrl
$code = 0
try {
  Push-Location $qa
  & "$venv\Scripts\python.exe" -m pytest contract_tests @PytestArgs
  $code = $LASTEXITCODE
} finally {
  Pop-Location
  if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
exit $code
