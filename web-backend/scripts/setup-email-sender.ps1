param([switch]$SelfTest, [switch]$Update)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop

function Test-SenderAddress([string]$Address) {
    return $Address -cmatch '^[a-zA-Z0-9][a-zA-Z0-9._%+\-]{0,63}@gmail\.com$'
}

function Protect-AppPassword([Security.SecureString]$Secret) {
    $pointer = [IntPtr]::Zero
    $normalizedSecret = $null
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $normalized = $plain -replace '\s', ''
        if ($normalized -cnotmatch '^[a-z]{16}$') {
            throw 'Enter the 16-letter Google app password, not your normal Google password.'
        }
        $normalizedSecret = ConvertTo-SecureString $normalized -AsPlainText -Force
        # Windows DPAPI: decryptable by this Windows user on this PC.
        return ConvertFrom-SecureString $normalizedSecret
    }
    finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        if ($null -ne $normalizedSecret) { $normalizedSecret.Dispose() }
        $plain = $null
        $normalized = $null
    }
}

if ($SelfTest) {
    if (!(Test-SenderAddress 'sender.example@gmail.com')) { throw 'Address validation failed' }
    foreach ($bad in @('bad', 'a@gmail.com.evil', "a@gmail.com`r`nBcc: other@example.com", 'a@outlook.com')) {
        if (Test-SenderAddress $bad) { throw 'Invalid address was accepted' }
    }
    # Synthetic fixture only. No file writes, network access or real credentials.
    $sample = ConvertTo-SecureString 'abcd efgh ijkl mnop' -AsPlainText -Force
    try {
        $protected = Protect-AppPassword $sample
        $restored = ConvertTo-SecureString $protected
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($restored)
        try {
            if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) -cne 'abcdefghijklmnop') { throw 'DPAPI roundtrip failed' }
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            $restored.Dispose()
        }
    } finally { $sample.Dispose() }
    Write-Host 'PASS: sender validation and Windows-encrypted credential roundtrip. No settings saved.'
    exit 0
}

$secret = $null
$stream = $null
$created = $false
$configPath = $null
$stage = 'configuration'
try {
    $projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $secretDirectory = Join-Path $projectRoot '.secrets'
    if (!(Test-Path -LiteralPath $secretDirectory)) {
        New-Item -ItemType Directory -Path $secretDirectory | Out-Null
    }
    if (((Get-Item -LiteralPath $secretDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'The secrets folder must not be a link. Setup stopped.'
    }
    $configPath = Join-Path $secretDirectory 'email-sender.json'
    $destinationPath = $configPath
    if ((Test-Path -LiteralPath $configPath) -and !$Update) {
        throw 'Sender settings already exist. Nothing was overwritten. Ask for the credential-update procedure if needed.'
    }
    if ($Update) {
        if (!(Test-Path -LiteralPath $destinationPath)) { throw 'No existing sender configuration to update.' }
        $configPath = Join-Path $secretDirectory ('email-sender-update-' + [Guid]::NewGuid().ToString('N') + '.json')
    }
    Write-Host 'AuthentiScan email sender setup - local only'
    Write-Host 'No email will be sent. Do not share the app password in chat or screenshots.'
    $address = (Read-Host 'AuthentiScan Gmail address').Trim().ToLowerInvariant()
    if (!(Test-SenderAddress $address)) { throw 'Enter the full Gmail address created for AuthentiScan.' }
    $secret = Read-Host 'Google app password (hidden; NOT your normal Gmail password)' -AsSecureString
    $stage = 'password validation'
    $encrypted = Protect-AppPassword $secret
    $stage = 'encrypted file preparation'
    $record = [ordered]@{
        schema_version = 1
        provider = 'gmail-smtp'
        host = 'smtp.gmail.com'
        port = 465
        secure = $true
        sender_name = 'AuthentiScan'
        sender_email = $address
        password_protection = 'windows-dpapi-current-user'
        protected_password = $encrypted
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($record | ConvertTo-Json))
    $stream = [IO.File]::Open($configPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $created = $true
    $stream.Close()
    $stream = $null
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($identity)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $configPath -AclObject $acl
    $stream = [IO.File]::Open($configPath, [IO.FileMode]::Open, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    $stream = $null
    $stage = 'replacing saved settings'
    if ($Update) { [IO.File]::Replace($configPath, $destinationPath, [NullString]::Value) }
    Write-Host 'Sender settings saved with Windows user encryption and restricted file access.'
    Write-Host 'This stores credentials only. Restart the updated backend to use email verification. No email was sent.'
    Write-Host 'You can now tell the assistant: sender saved. Do not send the file or password.'
} catch {
    if ($null -ne $stream) { $stream.Dispose(); $stream = $null }
    # Remove only the new, incomplete file created by this invocation.
    if ($created -and $configPath -and (Test-Path -LiteralPath $configPath)) {
        Remove-Item -LiteralPath $configPath -Force
    }
    Write-Host 'Setup did not finish. No existing sender settings were changed.'
    Write-Host ('Stopped during ' + $stage + '.')
    if ($stage -eq 'password validation') {
        Write-Host 'Copy only the 16 letters shown by Google. Spaces are accepted. Exclude the app name, quotation marks and other text.'
    }
    # Never print raw exception objects: they can contain user input or secrets.
    Write-Host 'Check the full Gmail address, the 16-letter app password, and whether settings already exist.'
    exit 1
} finally {
    if ($null -ne $secret) { $secret.Dispose() }
    if ($null -ne $stream) { $stream.Dispose() }
    $encrypted = $null
    $record = $null
}
