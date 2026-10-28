param([switch]$RestartProbe,[string]$FixturePath)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$refs=@('System','System.Core','System.Net.Http','System.Security','System.Web.Extensions') | ForEach-Object { [Reflection.Assembly]::LoadWithPartialName($_).Location }
Add-Type -Path @((Join-Path $root 'candidates/cost-control/windows-test/OneShot.cs'),(Join-Path $PSScriptRoot 'Fixtures.cs')) -ReferencedAssemblies $refs
if($RestartProbe){
 $scope=New-Object SolqTest.Scope
 $scope.Approved=$true;$scope.WorkspaceKeyAndAutoReloadOffConfirmed=$true;$scope.WorkspaceId='wrkspc_synthetic_fixture'
 $transport=New-Object FakeTransport;$secret=New-Object SyntheticSecret
 $client=New-Object Net.Http.HttpClient($transport)
 try {
  $runner=New-Object SolqTest.OneShot($client,$secret,[Func[DateTime]]{[DateTime]::SpecifyKind([DateTime]'2026-10-28T01:00:00',[DateTimeKind]::Utc)})
  $blocked=$false
  try{$runner.Run($scope,$FixturePath).GetAwaiter().GetResult() | Out-Null}catch{$blocked=$true}
  if(-not $blocked -or $transport.Calls -ne 0 -or $secret.Reads -ne 0){throw 'RESTART_DUPLICATE_GUARD_FAILED'}
  Write-Output '{"restartBlocked":true,"mockSends":0,"secretReads":0}'
 } finally {$client.Dispose()}
 return
}
$fixtureRoot=Join-Path $env:TEMP ('sq-shot-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
try {
 $report=[OneShotFixtures]::RunAll($fixtureRoot)
 $process=New-Object Diagnostics.Process
 $process.StartInfo=New-Object Diagnostics.ProcessStartInfo
 $process.StartInfo.FileName=Join-Path $PSHOME 'powershell.exe'
 $process.StartInfo.Arguments='-NoProfile -NonInteractive -File "'+$PSCommandPath+'" -RestartProbe -FixturePath "'+(Join-Path $fixtureRoot 'ok')+'"'
 $process.StartInfo.UseShellExecute=$false;$process.StartInfo.RedirectStandardOutput=$true;$process.StartInfo.RedirectStandardError=$true
 [void]$process.Start();$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
 if(-not $process.WaitForExit(45000)){$process.Kill();throw 'RESTART_PROBE_TIMEOUT'}
 if($process.ExitCode -ne 0 -or $stdout.Result -notmatch '"restartBlocked":true'){throw 'RESTART_PROBE_FAILED'}
 $process.Dispose()
 $report['checks'].Add('new PowerShell process: existing encrypted reservation blocks before key access and send')
 $report['pass']=[int]$report['pass']+1
 $report['environment']='Windows PowerShell5.1 disposable CI; fake HTTP and synthetic key source; actual Windows DPAPI/ACL/file lock'
 $report['powershell']=$PSVersionTable.PSVersion.ToString()
 $report | ConvertTo-Json -Depth 5
} finally {
 if(Test-Path -LiteralPath $fixtureRoot){Remove-Item -LiteralPath $fixtureRoot -Recurse -Force}
}
