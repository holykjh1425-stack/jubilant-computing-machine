[CmdletBinding()]
param(
    [switch]$ApproveOperatingBackup,
    [switch]$SecurityChecklistConfirmed,
    [string]$PgBin,
    [string]$GpgExe,
    [string]$PublicKeyHome,
    [string]$CaFile,
    [string]$DbHost,
    [string]$DbUser,
    [ValidateSet('Direct','Session')][string]$ConnectionMode='Direct',
    [string]$Destination='C:\SOLQ_보안백업'
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
# Default is a preparation-only stop. No password prompt, DB contact, or key operation.
if (-not $ApproveOperatingBackup) { Write-Output 'PREPARATION_ONLY: operating backup requires separate approval.'; return }
$secure=$null; $credential=$null
try {
    if(-not $SecurityChecklistConfirmed) { throw 'SECURITY_CHECKLIST_REQUIRED' }
    if ($env:OS -ne 'Windows_NT') { throw 'WINDOWS_REQUIRED' }
    foreach($value in @($PgBin,$GpgExe,$PublicKeyHome,$CaFile,$DbHost,$DbUser)) {
        if([string]::IsNullOrWhiteSpace($value) -or $value.Contains('"') -or $value.Contains("`r") -or $value.Contains("`n")) { throw 'CONFIG_INVALID' }
    }
    if($Destination -cne 'C:\SOLQ_보안백업') { throw 'DESTINATION_NOT_APPROVED' }
    if($GpgExe -match '\\Git\\usr\\bin\\') { throw 'NATIVE_GPG4WIN_REQUIRED' }
    if($PublicKeyHome -cne 'C:\SOLQ_public_key') { throw 'DEDICATED_LOCAL_PUBLIC_HOME_REQUIRED' }
    foreach($folder in @($Destination,$PublicKeyHome)) {
        $item=Get-Item -LiteralPath $folder
        if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'DIRECTORY_INVALID' }
    }
    if(-not (Test-Path -LiteralPath $CaFile -PathType Leaf)) { throw 'CA_REQUIRED' }
    $ca=New-Object Security.Cryptography.X509Certificates.X509Certificate2((Resolve-Path -LiteralPath $CaFile).Path)
    try {
        if($ca.NotAfter.ToUniversalTime() -le [DateTime]::UtcNow -or $ca.NotBefore.ToUniversalTime() -gt [DateTime]::UtcNow) { throw 'CA_TIME_INVALID' }
    } finally { $ca.Dispose() }
    if($ConnectionMode -eq 'Direct') {
        if($DbHost -cne 'db.elfacqmvygnwjlklqhiz.supabase.co' -or $DbUser -cne 'postgres') { throw 'DIRECT_CONFIG_INVALID' }
    } else {
        if($DbHost -notmatch '^[a-z0-9-]+\.pooler\.supabase\.com$' -or $DbUser -cne 'postgres.elfacqmvygnwjlklqhiz') { throw 'SESSION_CONFIG_INVALID' }
    }
    # ACL, synchronization, CA provenance, recipient validity and restore readiness
    # require the operator checklist; this switch does not grant organizational approval.
    foreach($name in @('pg_dump','pg_dumpall','pg_restore')) {
        $exe=Join-Path $PgBin ($name+'.exe')
        $v=& $exe --version 2>$null
        if($LASTEXITCODE -ne 0 -or "$v" -notmatch '\b17\.11\b') { throw 'PG_VERSION_REQUIRED' }
    }
    Add-Type -Path (Join-Path $PSScriptRoot 'EncryptedStream.cs')
    $fingerprint='609E0AE7A674BDBE2AE580B27C7867DEDBD04E11'
    # Dedicated public-only home, never the default PC key home or USB.
    $public=[SolqEncryptedStream]::PublicMetadata($GpgExe,('--no-options --homedir "{0}" --batch --with-colons --list-keys {1}' -f $PublicKeyHome,$fingerprint)) -split "`n"
    if(-not ($public -match ('^fpr:::::::::'+ $fingerprint +':'))) { throw 'PUBLIC_RECIPIENT_MISSING' }
    $secret=[SolqEncryptedStream]::PublicMetadata($GpgExe,('--no-options --homedir "{0}" --batch --with-colons --list-secret-keys' -f $PublicKeyHome)) -split "`n"
    if($secret -match '^sec:') { throw 'PUBLIC_ONLY_HOME_REQUIRED' }
    $secure=Read-Host 'Enter existing database password locally (never paste into chat)' -AsSecureString
    $credential=New-Object System.Net.NetworkCredential('', $secure)
    $stamp=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
    foreach($part in @('database','roles')) {
        if($part -eq 'database') {
            $source=[SolqEncryptedStream]::StartInfo((Join-Path $PgBin 'pg_dump.exe'),'--format=custom --no-password --lock-wait-timeout=5000')
        } else {
            $source=[SolqEncryptedStream]::StartInfo((Join-Path $PgBin 'pg_dumpall.exe'),'--roles-only --no-role-passwords --no-password')
        }
        foreach($k in @('PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGREQUIRESSL','PGSSLMODE','PGSSLROOTCERT','PGSSLCRL','PGSSLCRLDIR','PGOPTIONS','PGDATABASE','PGUSER','PGHOST','PGPORT','PGPASSWORD','PGGSSENCMODE')) {
            $source.EnvironmentVariables.Remove($k)
        }
        $source.EnvironmentVariables['PGHOST']=$DbHost
        $source.EnvironmentVariables['PGPORT']='5432'
        $source.EnvironmentVariables['PGDATABASE']='postgres'
        $source.EnvironmentVariables['PGUSER']=$DbUser
        $source.EnvironmentVariables['PGSSLMODE']='verify-full'
        $source.EnvironmentVariables['PGSSLROOTCERT']=(Resolve-Path -LiteralPath $CaFile).Path
        $source.EnvironmentVariables['PGGSSENCMODE']='disable'
        $source.EnvironmentVariables['PGCONNECT_TIMEOUT']='15'
        $source.EnvironmentVariables['PGOPTIONS']='-c default_transaction_read_only=on -c statement_timeout=600000 -c lock_timeout=5000'
        $source.EnvironmentVariables['PGPASSWORD']=$credential.Password
        $cipher=[SolqEncryptedStream]::StartInfo($GpgExe,('--no-options --homedir "{0}" --batch --no-tty --trust-model always --recipient {1} --cipher-algo AES256 --compress-algo none --encrypt --output -' -f $PublicKeyHome,$fingerprint))
        $target=Join-Path $Destination ('SOLQ-'+$stamp+'-'+$part+'.gpg')
        $hash=[SolqEncryptedStream]::Run($source,$cipher,$target,900000)
        Write-Output ($part+': encrypted stream completed; ciphertext SHA256 '+$hash)
    }
    Write-Output 'DB_AND_ROLES_ONLY: platform supplements and isolated restore remain required; NOT full-recovery PASS.'
} catch {
    Write-Output 'STOPPED: validation or encrypted export incomplete. No child diagnostics or credentials are displayed. Do not treat files as a complete backup.'
    throw 'SOLQ_BACKUP_STOPPED'
} finally {
    if($secure) { $secure.Dispose() }
    $credential=$null
}
