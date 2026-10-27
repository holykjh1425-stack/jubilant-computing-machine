$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Add-Type -Path (Join-Path $root 'ops/windows-backup/EncryptedStream.cs')
foreach($name in @('Backup-Encrypted.ps1','Check-BackupTools.ps1')) {
    $tok=$null; $err=$null
    [Management.Automation.Language.Parser]::ParseFile((Join-Path $root ('ops/windows-backup/'+$name)),[ref]$tok,[ref]$err) | Out-Null
    if($err.Count) { throw 'PARSE_FAILED' }
}
$command=Get-Command gpg.exe -ErrorAction SilentlyContinue
$gpg=if($command) { $command.Source } else { 'C:\Program Files\Git\usr\bin\gpg.exe' }
if(-not (Test-Path $gpg)) { throw 'RUNNER_GPG_UNAVAILABLE' }
$gpgconf=Join-Path (Split-Path $gpg) 'gpgconf.exe'
$base=Join-Path $env:TEMP ('sq-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
$priv=Join-Path $base 'k'; $pub=Join-Path $base 'p'
New-Item -ItemType Directory -Path $priv,$pub | Out-Null
function GpgPath([string]$nativePath) {
    if($gpg -match '\\Git\\usr\\bin\\') {
        return ('/'+$nativePath.Substring(0,1).ToLowerInvariant()+$nativePath.Substring(2).Replace('\','/'))
    }
    return $nativePath
}
$gpriv=GpgPath $priv; $gpub=GpgPath $pub
$results=New-Object Collections.Generic.List[string]
function Cipher([string]$recipient=$script:fpr) {
    return [SolqEncryptedStream]::StartInfo($gpg,('--no-options --homedir "{0}" --batch --no-tty --trust-model always --recipient {1} --cipher-algo AES256 --compress-algo none --encrypt --output -' -f $gpub,$recipient))
}
function Source([string]$mode='ok') {
    return [SolqEncryptedStream]::StartInfo((Join-Path $PSHOME 'powershell.exe'),('-NoProfile -NonInteractive -File "{0}" -Mode {1}' -f (Join-Path $PSScriptRoot 'producer.ps1'),$mode))
}
function Reject([string]$label,$source,$cipher,[string]$target,[int]$timeout=20000) {
    $rejected=$false
    try { [void][SolqEncryptedStream]::Run($source,$cipher,$target,$timeout) } catch { $rejected=$true }
    if(-not $rejected -or (Test-Path $target)) { throw ('FAILED_'+$label) }
    $results.Add($label)
}
try {
    $keygen=New-Object Diagnostics.Process
    $keygen.StartInfo=[SolqEncryptedStream]::StartInfo($gpg,('--no-options --homedir "{0}" --batch --pinentry-mode loopback --passphrase "" --quick-generate-key "SOLQ SYNTHETIC ONLY <synthetic@example.invalid>" rsa2048 encr 1d' -f $gpriv))
    [void]$keygen.Start(); $keygen.StandardInput.Close()
    $keygenOut=$keygen.StandardOutput.ReadToEndAsync(); $keygenErr=$keygen.StandardError.ReadToEndAsync()
    if(-not $keygen.WaitForExit(60000)) { $keygen.Kill(); throw 'SYNTHETIC_KEY_TIMEOUT' }
    if($keygen.ExitCode -ne 0) {
        # Disposable CI-key diagnostics ONLY; never used by production script.
        Write-Output ('Synthetic-only key generator diagnostic: '+$keygenErr.Result)
        throw 'SYNTHETIC_KEY_FAILED'
    }
    $keygen.Dispose()
    $lines=[SolqEncryptedStream]::PublicMetadata($gpg,('--no-options --homedir "{0}" --batch --with-colons --list-keys' -f $gpriv)) -split "`n"
    $script:fpr=($lines | Where-Object { $_ -match '^fpr:' } | Select-Object -First 1).Split(':')[9]
    # Only disposable PUBLIC key bytes are written; never exports a secret key.
    $publicFile=Join-Path $base 'synthetic-public.asc'
    [void][SolqEncryptedStream]::PublicMetadata($gpg,('--no-options --homedir "{0}" --batch --armor --output "{1}" --export {2}' -f $gpriv,(GpgPath $publicFile),$fpr))
    [void][SolqEncryptedStream]::PublicMetadata($gpg,('--no-options --homedir "{0}" --batch --import "{1}"' -f $gpub,(GpgPath $publicFile)))
    $sec=[SolqEncryptedStream]::PublicMetadata($gpg,('--no-options --homedir "{0}" --batch --with-colons --list-secret-keys' -f $gpub)) -split "`n"
    if($sec -match '^sec:') { throw 'PUBLIC_ONLY_FAILED' }; $results.Add('public-only recipient')
    $good=Join-Path $base 'binary.gpg'
    $actual=[SolqEncryptedStream]::Run((Source),(Cipher),$good,30000)
    if($actual -ne (Get-FileHash $good -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'CIPHER_HASH_FAILED' }
    $results.Add('ciphertext SHA256')
    # Decrypt synthetic bytes to memory only; no plaintext file.
    $dec=New-Object Diagnostics.Process
    $dec.StartInfo=[SolqEncryptedStream]::StartInfo($gpg,('--no-options --homedir "{0}" --batch --decrypt "{1}"' -f $gpriv,(GpgPath $good)))
    [void]$dec.Start(); $dec.StandardInput.Close()
    $stderr=$dec.StandardError.ReadToEndAsync()
    $mem=New-Object IO.MemoryStream
    $dec.StandardOutput.BaseStream.CopyTo($mem); $dec.WaitForExit()
    if($dec.ExitCode -ne 0) { throw 'ROUNDTRIP_EXIT_FAILED' }
    $bytes=$mem.ToArray()
    if($bytes.Length -ne 1048593) { throw ('ROUNDTRIP_LENGTH_FAILED_SYNTHETIC_BYTES_'+$bytes.Length) }
    for($i=0;$i -lt $bytes.Length;$i++) { if($bytes[$i] -ne [byte]($i % 256)) { throw 'BINARY_CHANGED' } }
    [Array]::Clear($bytes,0,$bytes.Length); $mem.Dispose(); $dec.Dispose()
    $results.Add('binary roundtrip all byte values')
    Reject 'producer exit17 never promoted' (Source 'fail') (Cipher) (Join-Path $base 'failed-source.gpg')
    Reject 'invalid recipient rejected' (Source) (Cipher '0000000000000000000000000000000000000000') (Join-Path $base 'bad-recipient.gpg')
    Reject 'timeout never promoted' (Source 'timeout') (Cipher) (Join-Path $base 'timed-out.gpg') 1000
    Reject 'missing executable rejected' ([SolqEncryptedStream]::StartInfo('Z:\not-present\solq.exe','')) (Cipher) (Join-Path $base 'missing.gpg')
    $before=(Get-FileHash $good).Hash; $blocked=$false
    try { [void][SolqEncryptedStream]::Run((Source),(Cipher),$good,1000) } catch { $blocked=$true }
    if(-not $blocked -or (Get-FileHash $good).Hash -ne $before) { throw 'OVERWRITE_FAILED' }
    $results.Add('existing ciphertext protected')
    $damaged=[IO.File]::ReadAllBytes($good); $damaged[[int]($damaged.Length/2)]=$damaged[[int]($damaged.Length/2)] -bxor 1
    $bad=Join-Path $base 'damaged.gpg'; [IO.File]::WriteAllBytes($bad,$damaged)
    $p=New-Object Diagnostics.Process
    $p.StartInfo=[SolqEncryptedStream]::StartInfo($gpg,('--no-options --homedir "{0}" --batch --decrypt "{1}"' -f $gpriv,(GpgPath $bad)))
    [void]$p.Start(); $p.StandardInput.Close(); $e=$p.StandardError.ReadToEndAsync()
    $p.StandardOutput.BaseStream.CopyTo([IO.Stream]::Null); $p.WaitForExit()
    if($p.ExitCode -eq 0) { throw 'CORRUPTION_UNDETECTED' }; $p.Dispose()
    $results.Add('corruption integrity rejection')
    $default=& (Join-Path $root 'ops/windows-backup/Backup-Encrypted.ps1')
    if($default -notmatch '^PREPARATION_ONLY:') { throw 'DEFAULT_GATE_FAILED' }
    $results.Add('default production gate no DB contact')
    $report=[ordered]@{ utc=[DateTime]::UtcNow.ToString('o'); environment='GitHub existing repository disposable Windows runner, not user PC'; powershell=$PSVersionTable.PSVersion.ToString(); cases=$results.ToArray(); pass=$results.Count; production_db_contact=$false; user_key_access=$false; plaintext_customer_data=$false; operating_backup_executed=$false }
    $report | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $PSScriptRoot 'results.json')
    $report | ConvertTo-Json -Depth 4
} finally {
    foreach($syntheticKeyHome in @($priv,$pub)) { try { [void][SolqEncryptedStream]::PublicMetadata($gpgconf,('--homedir "{0}" --kill all' -f (GpgPath $syntheticKeyHome))) } catch {} }
    if(Test-Path $base) { Remove-Item -LiteralPath $base -Recurse -Force }
}
