param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [string]$PythonExe = "python",
  [string]$TaskName = "Prosper RTK Base Service"
)
$ErrorActionPreference = "Stop"
$runner = Join-Path $ProjectRoot "deploy\windows\run_base_service.ps1"
if (-not (Test-Path $runner)) { throw "Runner not found: $runner" }
if (-not (Test-Path (Join-Path $ProjectRoot "backend\.env"))) {
  throw "Create backend\.env from backend\.env.base.example before installing the startup task."
}
$args = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -ProjectRoot `"$ProjectRoot`" -PythonExe `"$PythonExe`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $args
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force
Write-Host "Installed startup task: $TaskName"
Write-Host "The Base backend will start at Windows boot and restart after failures."
