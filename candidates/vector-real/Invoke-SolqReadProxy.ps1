[CmdletBinding()]
param([switch]$ApproveLocalReadProxy)
$ErrorActionPreference='Stop'
if(-not $ApproveLocalReadProxy){Write-Output 'PREPARATION_ONLY: no Docker, PKI, listener or configuration change.';return}
if($env:OS -ne 'Windows_NT'){throw 'WINDOWS_REQUIRED'}
$node=(Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
$docker=(Get-Command docker.exe -CommandType Application -ErrorAction Stop).Source
$openssl=(Get-Command openssl.exe -CommandType Application -ErrorAction Stop).Source
$version=& $node --version
if($version -notmatch '^v(2[2-9]|[3-9][0-9])\.'){throw 'EXISTING_NODE_22_OR_NEWER_REQUIRED'}
$run=Join-Path $env:LOCALAPPDATA ('SOLQVectorReadProbe-'+[guid]::NewGuid().ToString())
if(Test-Path -LiteralPath $run){throw 'NEW_RUN_DIRECTORY_REQUIRED'}
$acl=New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.SetOwner($sid)
$system=New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
foreach($who in @($sid,$system)){
 $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($who,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($rule)
}
[void][IO.Directory]::CreateDirectory($run,$acl)
$observed=(Get-Acl -LiteralPath $run).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])
foreach($rule in $observed){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($sid.Value,'S-1-5-18')){throw 'PRIVATE_ACL_REQUIRED'}}
[IO.File]::WriteAllText((Join-Path $run 'private-acl.marker'),'OWNER_AND_SYSTEM_ONLY')
# No execution-policy bypass or installation. Driver self-tests, shuts down and removes its new PKI.
& $node --experimental-strip-types (Join-Path $PSScriptRoot 'windows-probe.mjs') --approved-local-read-proxy $run $docker $openssl
Write-Output ('Sanitized report folder: '+$run)
