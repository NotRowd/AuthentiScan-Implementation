param([switch]$Check, [switch]$BackendPipe)
# Private child-process bridge. For interactive diagnostics, always use -Check.
$ErrorActionPreference = 'Stop'
$secret = $null
$pointer = [IntPtr]::Zero
$stage = 'read'
try {
    # Use the security module belonging to this Windows PowerShell executable.
    # A parent PowerShell 7 session can supply an incompatible PSModulePath.
    Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
    $path = Join-Path $PSScriptRoot '../.secrets/email-sender.json'
    $record = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $stage = 'schema'
    if ($record.schema_version -ne 1 -or $record.password_protection -ne 'windows-dpapi-current-user') { throw 'Invalid config' }
    $stage = 'decrypt'
    $secret = ConvertTo-SecureString $record.protected_password
    $stage = 'marshal'
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($Check -or !$BackendPipe) {
        if ($password -cnotmatch '^[a-z]{16}$') { throw 'Invalid password format' }
        Write-Host 'PASS: saved sender settings can be decrypted by this Windows session. No email sent.'
    } else {
        [Console]::Out.Write((@{email=$record.sender_email; password=$password} | ConvertTo-Json -Compress))
    }
} catch { [Console]::Error.Write('Sender bridge failed at ' + $stage); exit 1 }
finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($null -ne $secret) { $secret.Dispose() }
    $password = $null
}
