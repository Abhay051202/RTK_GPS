param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [string]$PythonExe = "python"
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $ProjectRoot "backend")
& $PythonExe -m uvicorn main:app --host 0.0.0.0 --port 8000
exit $LASTEXITCODE
