param([Parameter(Mandatory = $true)][ValidateSet('start','stop','status')][string]$Action)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskRuntime = Join-Path $taskRoot 'storage/runtime'
New-Item -ItemType Directory -Force -Path $taskRuntime | Out-Null
$taskServices = @(
    @{ Name='api'; Port=43171; Entry=(Join-Path $taskRoot 'apps/api/dist/main.js'); Args=@(); Directory=(Join-Path $taskRoot 'apps/api') },
    @{ Name='web'; Port=43170; Entry=(Join-Path $taskRoot 'apps/web/node_modules/next/dist/bin/next'); Args=@('start','--hostname','127.0.0.1','--port','43170'); Directory=(Join-Path $taskRoot 'apps/web') }
)
foreach ($taskService in $taskServices) {
    $taskPidFile = Join-Path $taskRuntime "$($taskService.Name).pid"
    $taskProcess = $null
    if (Test-Path -LiteralPath $taskPidFile) {
        $taskStoredId = [int](Get-Content -LiteralPath $taskPidFile)
        $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$taskStoredId"
        if ($taskProcess -and -not $taskProcess.CommandLine.Contains($taskService.Entry)) { throw 'PID belongs to a different process. Refusing to control it.' }
    }
    if ($Action -eq 'status') { Write-Host "$($taskService.Name): $(if ($taskProcess) { 'running' } else { 'stopped' }) (port $($taskService.Port))"; continue }
    if ($Action -eq 'stop') {
        if ($taskProcess) { Stop-Process -Id $taskProcess.ProcessId }
        if (Test-Path -LiteralPath $taskPidFile) { Remove-Item -LiteralPath $taskPidFile }
        Write-Host "$($taskService.Name): stopped"; continue
    }
    if ($taskProcess) { Write-Host "$($taskService.Name): already running"; continue }
    if (-not (Test-Path -LiteralPath $taskService.Entry)) { throw 'Build artifacts missing. Run pnpm db:generate and pnpm build first.' }
    $taskListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $taskService.Port)
    try { $taskListener.Start() } catch { throw "Port $($taskService.Port) is occupied. No other project was stopped." } finally { $taskListener.Stop() }
    $taskArguments = @('"' + $taskService.Entry + '"') + $taskService.Args
    $taskStarted = Start-Process -FilePath (Get-Command node).Source -ArgumentList $taskArguments -WorkingDirectory $taskService.Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime "$($taskService.Name).log") -RedirectStandardError (Join-Path $taskRuntime "$($taskService.Name).error.log")
    Set-Content -LiteralPath $taskPidFile -Value $taskStarted.Id
    $taskUrl = if ($taskService.Name -eq 'api') { 'http://127.0.0.1:43171/api/v1/health/ready' } else { 'http://127.0.0.1:43170' }
    $taskReady = $false
    for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
        try { Invoke-WebRequest -Uri $taskUrl -UseBasicParsing -TimeoutSec 2 | Out-Null; $taskReady = $true; break } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $taskReady) { throw "$($taskService.Name) did not become ready. Inspect storage/runtime logs and run scripts/app.ps1 status." }
    Write-Host "$($taskService.Name): ready at $taskUrl"
}
