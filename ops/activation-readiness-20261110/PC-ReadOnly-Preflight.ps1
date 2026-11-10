# READ ONLY: no DB connection, password prompt, backup, restore, container start or changes.
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'WINDOWS_PC_REQUIRED'}
$dest='C:\SOLQ_보안백업'
$tools=@{}
foreach($name in @('pg_dump','pg_dumpall','pg_restore','docker')){
 $command=Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
 $path=if($command){$command.Source}else{Join-Path ([Environment]::GetFolderPath('ProgramFiles')) "PostgreSQL\17\bin\$name.exe"}
 if(Test-Path -LiteralPath $path -PathType Leaf){$version=& $path --version 2>$null;$tools[$name]=@{present=$true;version=($version -join ' ')}}
 else{$tools[$name]=@{present=$false}}
}
$folder=@{exists=(Test-Path -LiteralPath $dest -PathType Container);reparse=$null;current_user_acl_present=$null}
if($folder.exists){
 $folder.reparse=[bool]((Get-Item -LiteralPath $dest).Attributes -band [IO.FileAttributes]::ReparsePoint)
 $acl=Get-Acl -LiteralPath $dest
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
 $folder.current_user_acl_present=[bool]($acl.Access | Where-Object {$_.IdentityReference.Value -eq $identity})
}
$encryption='UNVERIFIED'
try{$volume=Get-BitLockerVolume -MountPoint 'C:' -ErrorAction Stop;$encryption=[string]$volume.ProtectionStatus}catch{}
$containers=@()
if($tools.docker.present){
 $docker=(Get-Command docker -CommandType Application).Source
 # Whitelist scalar fields only: never inspect/print container environment or secret sources.
 $names=& $docker ps -a --filter 'name=^/solq-restore-20261106$' --format '{{.Names}}' 2>$null
 if($LASTEXITCODE -eq 0){foreach($name in $names){
  $state=& $docker inspect --format '{{.State.Status}}' $name 2>$null
  $network=& $docker inspect --format '{{.HostConfig.NetworkMode}}' $name 2>$null
  $readOnly=& $docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' $name 2>$null
  $restart=& $docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' $name 2>$null
  $destinations=& $docker inspect --format '{{range .Mounts}}{{.Destination}}|{{.RW}};{{end}}' $name 2>$null
  $containers+=@{name=$name;state=($state -join '');network=($network -join '');readonly_root=($readOnly -join '');restart=($restart -join '');mount_destinations_only=($destinations -join '')}
 }}
}
@{mode='READ_ONLY';tools=$tools;backup_destination=$folder;system_volume_protection=$encryption;restore_container_metadata=$containers;
 secret_files_read=$false;db_connected=$false;container_started=$false;backup_executed=$false;restore_executed=$false;
 verdict='PRECHECK_ONLY_NOT_RESTORE_APPROVAL'} | ConvertTo-Json -Depth 8
