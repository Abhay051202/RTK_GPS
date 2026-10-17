param([string]$TaskName = "Prosper RTK Base Service")
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Removed startup task: $TaskName"
