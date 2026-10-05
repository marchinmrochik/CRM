param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('init', 'start', 'status', 'logs', 'stop', 'restart', 'shell')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRoot
try {
    if ($Action -eq 'init') {
        if (Test-Path -LiteralPath '.env') {
            Write-Host 'Existing .env preserved.'
            return
        }
        $taskBytes = New-Object byte[] 32
        $taskRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $taskRng.GetBytes($taskBytes) } finally { $taskRng.Dispose() }
        $taskPassword = -join ($taskBytes | ForEach-Object { $_.ToString('x2') })
        $taskEnv = (Get-Content -LiteralPath '.env.example' -Raw).Replace('replace_with_a_random_local_password', $taskPassword)
        foreach ($taskPlaceholder in @('replace_with_a_random_session_secret', 'replace_with_a_random_owner_password')) {
            $taskSecretBytes = New-Object byte[] 32
            $taskSecretRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            try { $taskSecretRng.GetBytes($taskSecretBytes) } finally { $taskSecretRng.Dispose() }
            $taskSecret = -join ($taskSecretBytes | ForEach-Object { $_.ToString('x2') })
            $taskEnv = $taskEnv.Replace($taskPlaceholder, $taskSecret)
        }
        [System.IO.File]::WriteAllText((Join-Path $taskRoot '.env'), $taskEnv, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host 'Created ignored .env with random database, session and owner credentials. Do not share it.'
        return
    }
    if (-not (Test-Path -LiteralPath '.env')) { throw 'Missing .env. Run: ./scripts/db.ps1 init' }
    Get-Command docker -ErrorAction Stop | Out-Null
    & docker info --format '{{.ServerVersion}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is unavailable. Start the Linux container engine and retry.' }
    & docker compose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Compose configuration validation failed.' }
    $taskPortLine = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^POSTGRES_PORT=' } | Select-Object -Last 1
    $taskPort = 45432
    if ($taskPortLine) { $taskPort = [int]($taskPortLine.Split('=', 2)[1].Trim()) }
    if ($taskPort -lt 1024 -or $taskPort -gt 65535 -or $taskPort -in @(3000, 5000, 8000, 1433, 5432, 6379)) {
        throw 'POSTGRES_PORT must be a valid non-default project host port.'
    }
    if ($env:POSTGRES_PORT -and [int]$env:POSTGRES_PORT -ne $taskPort) {
        throw 'Shell POSTGRES_PORT conflicts with .env. Clear the override before running this script.'
    }
    switch ($Action) {
        'start' {
            $taskRunning = & docker compose ps --status running --quiet postgres
            if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the project container.' }
            if (-not $taskRunning) {
                $taskListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $taskPort)
                try { $taskListener.Start() } catch { throw "Port $taskPort is occupied or unavailable. No other service was stopped." } finally { $taskListener.Stop() }
            }
            & docker compose up --detach --wait --wait-timeout 120 postgres
        }
        'status' {
            & docker compose ps --all
            if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect project services.' }
            $taskContainer = & docker compose ps --all --quiet postgres
            if ($taskContainer) {
                & docker inspect --format 'State={{.State.Status}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}} RestartCount={{.RestartCount}} StartedAt={{.State.StartedAt}} ExitCode={{.State.ExitCode}} Error={{.State.Error}}' $taskContainer
            }
        }
        'logs' { & docker compose logs --tail 100 --timestamps postgres }
        'stop' { & docker compose stop postgres }
        'restart' { & docker compose restart postgres }
        'shell' { & docker compose exec postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' }
    }
    if ($LASTEXITCODE -ne 0) { throw "Database action '$Action' failed. Run status and logs for details." }
} finally {
    Pop-Location
}
