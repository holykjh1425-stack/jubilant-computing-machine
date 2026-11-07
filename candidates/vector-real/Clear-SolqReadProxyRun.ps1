[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RunDirectory,[switch]$ApproveOwnRunCleanup)
$ErrorActionPreference='Stop'
if(-not $ApproveOwnRunCleanup){Write-Output 'PREPARATION_ONLY: no deletion.';return}
$root=[IO.Path]::GetFullPath($RunDirectory)
if([IO.Path]::GetDirectoryName($root) -ne $env:LOCALAPPDATA -or [IO.Path]::GetFileName($root) -notmatch '^SOLQVectorReadProbe-[a-f0-9-]{36}$'){throw 'EXACT_PRIVATE_RUN_REQUIRED'}
if((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE_POINT_FORBIDDEN'}
if((Get-Content -LiteralPath (Join-Path $root 'private-acl.marker') -Raw) -cne 'OWNER_AND_SYSTEM_ONLY'){throw 'MARKER_REQUIRED'}
if(-not(Test-Path -LiteralPath (Join-Path $root 'result.json'))){throw 'PROBE_NOT_FINISHED_NO_CLEANUP'}
$files=Get-ChildItem -LiteralPath $root -Force
foreach($f in $files){if($f.PSIsContainer -or (($f.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or ($f.Name -notmatch '^(private-acl\.marker|result\.json|(ca|server|client|other)\.(key|crt|csr|srl|ext))$')){throw 'UNEXPECTED_FILE_NO_CLEANUP'}}
foreach($f in $files){Remove-Item -LiteralPath $f.FullName}
Remove-Item -LiteralPath $root
Write-Output 'OWN_PRIVATE_RUN_CLEANED. No Docker or firewall command executed.'
