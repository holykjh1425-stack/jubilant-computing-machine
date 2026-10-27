param([ValidateSet('ok','fail','timeout')][string]$Mode='ok')
if($Mode -eq 'timeout') { Start-Sleep -Seconds 30; exit 0 }
$bytes=New-Object byte[] 1048593
for($i=0;$i -lt $bytes.Length;$i++) { $bytes[$i]=[byte]($i % 256) }
$s=[Console]::OpenStandardOutput()
$s.Write($bytes,0,$bytes.Length); $s.Flush()
[Array]::Clear($bytes,0,$bytes.Length)
if($Mode -eq 'fail') { exit 17 }
