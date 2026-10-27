# READ ONLY. No dump, key export/import, installation, policy change or DB connection.
$ErrorActionPreference = 'Stop'
$dest = 'C:\SOLQ_보안백업'
function Find-Tool([string]$name, [string[]]$fallbacks) {
    $found = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { return $found.Source }
    foreach ($p in $fallbacks) { if (Test-Path -LiteralPath $p -PathType Leaf) { return $p } }
    return $null
}
$pf = [Environment]::GetFolderPath('ProgramFiles')
$pf86 = [Environment]::GetFolderPath('ProgramFilesX86')
$tools = @{}
foreach ($name in @('pg_dump','pg_dumpall','pg_restore')) {
    $p = Find-Tool $name @((Join-Path $pf "PostgreSQL\17\bin\$name.exe"))
    if ($p) {
        $version = & $p --version 2>$null
        $tools[$name] = @{ found=$true; path=$p; version=($version -join ' '); exit_code=$LASTEXITCODE }
    } else { $tools[$name] = @{ found=$false; note='Not found in PATH or standard PostgreSQL17 bin; not proof of absence everywhere.' } }
}
$gpg = Find-Tool 'gpg' @((Join-Path $pf 'GnuPG\bin\gpg.exe'),(Join-Path $pf86 'GnuPG\bin\gpg.exe'))
if ($gpg) {
    $v = & $gpg --version 2>$null
    $tools['gpg'] = @{ found=$true; path=$gpg; version=($v | Select-Object -First 1) }
} else { $tools['gpg'] = @{found=$false} }
$folder = @{ path=$dest; exists=(Test-Path -LiteralPath $dest -PathType Container); encryption_verified=$false; write_test_performed=$false }
if ($folder.exists) { $folder['reparse_point'] = [bool]((Get-Item -LiteralPath $dest).Attributes -band [IO.FileAttributes]::ReparsePoint) }
@{ windows_pc_checked=$true; tools=$tools; destination=$folder; usb_accessed=$false; keys_accessed=$false; database_connected=$false } | ConvertTo-Json -Depth 5
