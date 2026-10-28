from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
source=(ROOT/'candidates/cost-control/windows-test/OneShot.cs').read_text()
wrapper='''[CmdletBinding()]
param(
 [switch]$ExecuteApprovedHaikuOnce,
 [switch]$ConfirmSolqTestKeyAndAutoReloadOff,
 [string]$WorkspaceId
)
$ErrorActionPreference='Stop'
if(-not $ExecuteApprovedHaikuOnce){
 Write-Output 'PREPARATION_ONLY: no credential access, no files written, no HTTP. Separate Haiku one-call approval required.'
 return
}
if($env:OS -ne 'Windows_NT'){throw 'WINDOWS_PC_REQUIRED'}
if(-not $ConfirmSolqTestKeyAndAutoReloadOff){throw 'SOLQ_TEST_SCOPE_CONFIRMATION_REQUIRED'}
if([string]::IsNullOrWhiteSpace($WorkspaceId)){$WorkspaceId=Read-Host 'SOLQ-TEST Workspace ID only (wrkspc_...), never an API key'}
if($WorkspaceId -notmatch '^wrkspc_[A-Za-z0-9_-]{8,128}$'){throw 'WORKSPACE_ID_INVALID'}
try {
 $refs=@('System','System.Core','System.Net.Http','System.Security','System.Web.Extensions') | ForEach-Object { [Reflection.Assembly]::LoadWithPartialName($_).Location }
 Add-Type -ReferencedAssemblies $refs -TypeDefinition @'
'''+source+'''\n'@
 $scope=New-Object SolqTest.Scope
 $scope.Approved=$true
 $scope.WorkspaceKeyAndAutoReloadOffConfirmed=$true
 $scope.WorkspaceId=$WorkspaceId
 $result=[SolqTest.OneShot]::RunWindows($scope)
 $result | ConvertTo-Json -Depth 5
} catch {
 Write-Output 'STOPPED: local approval/scope/expiry/TLS prerequisite or private ledger failed. No retry, reset or key fallback was performed.'
 throw 'SOLQ_TEST_STOPPED_NO_RETRY'
}
'''
(ROOT/'candidates/cost-control/windows-test/SOLQ-Test-Once.ps1').write_text(wrapper,encoding='utf-8-sig')
