$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$taskSids = @($taskIdentity, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
$taskBackup = @()
foreach ($taskName in @('.env', 'storage', 'backups')) {
    $taskPath = [IO.Path]::GetFullPath((Join-Path $taskRoot $taskName))
    if (-not $taskPath.StartsWith($taskRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Private path escaped the project.' }
    if (-not (Test-Path -LiteralPath $taskPath)) { continue }
    $taskAcl = Get-Acl -LiteralPath $taskPath
    $taskBackup += @{ Path = $taskPath; Sddl = $taskAcl.Sddl }
    $taskAcl.SetAccessRuleProtection($true, $false)
    foreach ($taskRule in @($taskAcl.Access)) { $taskAcl.RemoveAccessRuleSpecific($taskRule) }
    $taskInheritance = if ((Get-Item -LiteralPath $taskPath) -is [IO.DirectoryInfo]) { [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
    foreach ($taskSid in $taskSids) {
        $taskRule = [Security.AccessControl.FileSystemAccessRule]::new($taskSid, 'FullControl', $taskInheritance, 'None', 'Allow')
        $taskAcl.AddAccessRule($taskRule)
    }
    Set-Acl -LiteralPath $taskPath -AclObject $taskAcl
}
$taskAuditPath = Join-Path $taskRoot 'storage/runtime/private-acl-before.json'
if (-not (Test-Path -LiteralPath $taskAuditPath)) { $taskBackup | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $taskAuditPath -Encoding utf8 }
Write-Output 'Private project paths now allow only the current Windows account, SYSTEM and Administrators. Existing protected child ACLs require separate review.'
