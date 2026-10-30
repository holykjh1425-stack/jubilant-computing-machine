[CmdletBinding()]
param([switch]$ApproveReadOnlyDockerProbe)
$ErrorActionPreference = 'Stop'
# Separate user approval is required. This flag is not a replacement for consent.
if (-not $ApproveReadOnlyDockerProbe) {
 Write-Output 'PREPARATION_ONLY: no Docker command, socket access or configuration change.'
 return
}
if ($env:OS -ne 'Windows_NT') { throw 'WINDOWS_PC_REQUIRED' }
function Invoke-FixedDockerRead([string]$Executable,[string]$Arguments) {
 $info = New-Object System.Diagnostics.ProcessStartInfo
 $info.FileName = $Executable
 $info.Arguments = $Arguments
 $info.UseShellExecute = $false
 $info.RedirectStandardOutput = $true
 $info.RedirectStandardError = $true
 $info.CreateNoWindow = $true
 $process = New-Object System.Diagnostics.Process
 $process.StartInfo = $info
 try {
  [void]$process.Start()
  $outTask = $process.StandardOutput.ReadToEndAsync()
  $errTask = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit(8000)) {
   $process.Kill() # Stop this probe client only, never a Docker service/container.
   throw 'READ_PROBE_TIMEOUT_NO_RETRY'
  }
  $output = $outTask.GetAwaiter().GetResult()
  [void]$errTask.GetAwaiter().GetResult() # Raw diagnostics are never printed.
  if ($process.ExitCode -ne 0) { throw 'READ_PROBE_FAILED_NO_RETRY' }
  return $output.Trim()
 } finally { $process.Dispose() }
}
try {
 $dockerCommand = Get-Command docker.exe -CommandType Application -ErrorAction Stop
 # Read existing context metadata only. Never change a context or daemon setting.
 $endpoint = Invoke-FixedDockerRead $dockerCommand.Source 'context inspect desktop-linux --format "{{.Endpoints.docker.Host}}"'
 if ($endpoint -cne 'npipe:////./pipe/dockerDesktopLinuxEngine') { throw 'EXPECTED_LOCAL_CONTEXT_NOT_FOUND' }
 # This is the first real daemon access; read-only /_ping and version negotiation only.
 $server = Invoke-FixedDockerRead $dockerCommand.Source '--context desktop-linux version --format "{{.Server.Os}} {{.Server.Version}}"'
 if ($server -notmatch '^linux ([0-9][0-9A-Za-z.+_-]{0,80})$') { throw 'UNEXPECTED_SERVER_RESPONSE' }
 [ordered]@{
  status = 'HOST_NAMED_PIPE_READ_ONLY_PASS'
  context = 'desktop-linux'
  transport = 'Windows named pipe'
  serverOS = 'linux'
  serverVersion = $Matches[1]
  vectorConnectionVerified = $false
  containersChanged = 0
  proxyCreated = $false
  hostTcp2375Opened = $false
 } | ConvertTo-Json
} catch {
 Write-Output 'STOPPED: read-only prerequisite or Docker probe failed. No retry or configuration change.'
 throw 'SOLQ_READ_ONLY_PROBE_STOPPED'
}
