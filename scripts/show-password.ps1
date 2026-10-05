$taskRoot = Split-Path -Parent $PSScriptRoot
$taskLine = Get-Content -LiteralPath (Join-Path $taskRoot '.env') | Where-Object { $_ -match '^OWNER_PASSWORD=' } | Select-Object -Last 1
if (-not $taskLine) { throw 'Owner password not configured. Run node scripts/configure-app.mjs.' }
Write-Host ($taskLine.Split('=',2)[1])
