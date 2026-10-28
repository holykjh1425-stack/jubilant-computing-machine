$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$refs=@('System','System.Core','System.Net.Http','System.Security','System.Web.Extensions') | ForEach-Object { [Reflection.Assembly]::LoadWithPartialName($_).Location }
Add-Type -Path @((Join-Path $root 'candidates/cost-control/windows-test/OneShot.cs'),(Join-Path $PSScriptRoot 'Fixtures.cs')) -ReferencedAssemblies $refs
$fixtureRoot=Join-Path $env:TEMP ('sq-shot-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
try {
 $report=[OneShotFixtures]::RunAll($fixtureRoot)
 $report['environment']='Windows PowerShell5.1 disposable CI; fake HTTP and synthetic key source; actual Windows DPAPI/ACL/file lock'
 $report['powershell']=$PSVersionTable.PSVersion.ToString()
 $report | ConvertTo-Json -Depth 5
} finally {
 if(Test-Path -LiteralPath $fixtureRoot){Remove-Item -LiteralPath $fixtureRoot -Recurse -Force}
}
