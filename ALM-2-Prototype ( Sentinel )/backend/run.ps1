# Sentinel backend helper. Usage: .\run.ps1 [setup|run|test]   (default: run)
param([string]$Task = "run", [int]$Port = 48731)
Set-Location $PSScriptRoot
$venvPy = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

function Ensure-Venv {
    if (-not (Test-Path $venvPy)) {
        if (Get-Command py -ErrorAction SilentlyContinue) { py -3.11 -m venv .venv } else { python -m venv .venv }
        & $venvPy -m pip install -r requirements.txt
    }
}

switch ($Task) {
    "setup" { Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue; Ensure-Venv }
    "test"  { Ensure-Venv; & $venvPy -m pytest -q }
    default { Ensure-Venv; & $venvPy -m uvicorn app.main:app --port $Port }
}
