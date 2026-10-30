[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RunDirectory)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($RunDirectory)
if([IO.Path]::GetDirectoryName($root) -ne $env:LOCALAPPDATA -or [IO.Path]::GetFileName($root) -notmatch '^SOLQVectorReadProbe-[a-f0-9-]{36}$'){throw 'EXACT_PRIVATE_RUN_REQUIRED'}
# Reads the safe result only; does not connect Docker or inspect any certificate/key.
$r=Get-Content -LiteralPath (Join-Path $root 'result.json') -Raw | ConvertFrom-Json
[ordered]@{status=$r.status;mtlsReadProxy=$r.mtlsReadProxy;vectorRecovered=$r.vectorRecovered;newDockerObjects=$r.newDockerObjects;cleanupIncomplete=$r.cleanupIncomplete}|ConvertTo-Json
