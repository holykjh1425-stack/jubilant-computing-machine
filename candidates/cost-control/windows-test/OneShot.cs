using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace SolqTest {
 public interface ICredentialSource { string ReadTestKey(); }
 public sealed class WindowsCredentialSource : ICredentialSource {
  public const string Target="SOLQ-TEST-ANTHROPIC-API";
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
  struct Credential { public UInt32 Flags,Type; public string TargetName,Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public UInt32 BlobSize; public IntPtr Blob; public UInt32 Persist,AttributeCount; public IntPtr Attributes; public string Alias,UserName; }
  [DllImport("advapi32.dll",EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)]
  static extern bool CredRead(string target,int type,int flags,out IntPtr pointer);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr pointer);
  public string ReadTestKey() {
   IntPtr pointer;
   if(!CredRead(Target,1,0,out pointer))throw new InvalidOperationException("CREDENTIAL_UNAVAILABLE");
   byte[] bytes=null;
   try {
    var item=(Credential)Marshal.PtrToStructure(pointer,typeof(Credential));
    if(item.BlobSize==0||item.BlobSize>4096)throw new InvalidOperationException("CREDENTIAL_FORMAT_INVALID");
    bytes=new byte[item.BlobSize];Marshal.Copy(item.Blob,bytes,0,bytes.Length);
    bool wide=bytes.Length%2==0;
    for(int i=1;wide&&i<bytes.Length;i+=2)if(bytes[i]!=0)wide=false;
    string key=(wide?Encoding.Unicode:Encoding.UTF8).GetString(bytes).TrimEnd('\0');
    if(!Regex.IsMatch(key,@"\Ask-ant-[A-Za-z0-9_-]{20,500}\z"))throw new InvalidOperationException("CREDENTIAL_FORMAT_INVALID");
    return key;
   } finally {
    if(bytes!=null)Array.Clear(bytes,0,bytes.Length);
    var item=(Credential)Marshal.PtrToStructure(pointer,typeof(Credential));
    if(item.Blob!=IntPtr.Zero)for(int i=0;i<item.BlobSize;i++)Marshal.WriteByte(item.Blob,i,0);
    CredFree(pointer);
   }
  }
 }
 public sealed class Scope {
  public bool Approved,WorkspaceKeyAndAutoReloadOffConfirmed;
  public string WorkspaceId;
 }
 public static class Policy {
  public const string Model="claude-haiku-5-5";
  public const long InputRateNano=100,OutputRateNano=500;
  public const int InputPlanningTokens=1000,MaxOutputTokens=32;
  public const long ReserveNano=1000000; // $0.001, stricter than existing job/day/month planning caps.
  public const string JobId="SOLQ-TEST-20261028-HAIKU-ONCE";
  public static readonly DateTime StopAtUtc=new DateTime(2026,10,28,15,0,0,DateTimeKind.Utc);
  public static long EstimatedNano { get { return InputPlanningTokens*InputRateNano+MaxOutputTokens*OutputRateNano; } }
  public static void Validate(Scope scope,DateTime now) {
   if(scope==null||!scope.Approved)throw new InvalidOperationException("APPROVAL_REQUIRED");
   if(!scope.WorkspaceKeyAndAutoReloadOffConfirmed)throw new InvalidOperationException("SCOPE_CONFIRMATION_REQUIRED");
   if(!Regex.IsMatch(scope.WorkspaceId??"",@"\Awrkspc_[A-Za-z0-9_-]{8,128}\z"))throw new InvalidOperationException("WORKSPACE_ID_REQUIRED");
   if(now.Kind!=DateTimeKind.Utc||now>=StopAtUtc)throw new InvalidOperationException("LOCAL_EXPIRY_CUTOFF");
   if(EstimatedNano>ReserveNano)throw new InvalidOperationException("BUDGET_EXCEEDED");
  }
 }
 public static class PrivateLedger {
  static readonly byte[] entropy=Encoding.UTF8.GetBytes(Policy.JobId);
  public static void EnsurePrivateDirectory(string path) {
   string current=Path.GetFullPath(path);
   while(!String.IsNullOrEmpty(current)){
    if(Directory.Exists(current)&&(File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new IOException("REPARSE_PATH_FORBIDDEN");
    var parent=Directory.GetParent(current);current=parent==null?null:parent.FullName;
   }
   if(!Directory.Exists(path)){
    var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);
    var sid=WindowsIdentity.GetCurrent().User;
    acl.SetOwner(sid);
    acl.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
    acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
    Directory.CreateDirectory(path,acl);
   }
   // Fail on inherited/broad allow rules; don't change an existing directory's ACL.
   var access=Directory.GetAccessControl(path).GetAccessRules(true,true,typeof(SecurityIdentifier));
   var me=WindowsIdentity.GetCurrent().User.Value;var system=new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null).Value;
   foreach(FileSystemAccessRule rule in access)if(rule.AccessControlType==AccessControlType.Allow&&rule.IdentityReference.Value!=me&&rule.IdentityReference.Value!=system)throw new IOException("LEDGER_ACL_REVIEW_REQUIRED");
  }
  public static void SaveNew(string path,Dictionary<string,object> value){
   byte[] plain=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(value));byte[] cipher=null;
   try{
    cipher=ProtectedData.Protect(plain,entropy,DataProtectionScope.CurrentUser);
    using(var file=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.None)){file.Write(cipher,0,cipher.Length);file.Flush(true);}
   }finally{Array.Clear(plain,0,plain.Length);if(cipher!=null)Array.Clear(cipher,0,cipher.Length);}
  }
  // Metadata receipt only; no API key, response body or customer input is ever persisted.
  public static Dictionary<string,object> ReadReceipt(string path){
   byte[] cipher=File.ReadAllBytes(path),plain=null;
   try{plain=ProtectedData.Unprotect(cipher,entropy,DataProtectionScope.CurrentUser);return new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(plain));}
   finally{Array.Clear(cipher,0,cipher.Length);if(plain!=null)Array.Clear(plain,0,plain.Length);}
  }
 }
 public sealed class OneShot {
  readonly HttpClient client;readonly ICredentialSource credentials;readonly Func<DateTime> clock;
  public OneShot(HttpClient client,ICredentialSource credentials,Func<DateTime> clock){this.client=client;this.credentials=credentials;this.clock=clock;}
  public static string DefaultLedgerPath(){return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"SOLQ","OneShot20261028");}
  static string Header(HttpResponseMessage response,string name){
   IEnumerable<string> values;if(!response.Headers.TryGetValues(name,out values))return null;
   string prefix=name=="request-id"?"req_":name=="anthropic-workspace-id"?"wrkspc_":"org_";
   foreach(var value in values)if(value.StartsWith(prefix,StringComparison.Ordinal)&&Regex.IsMatch(value,@"\A[A-Za-z0-9_-]{1,160}\z"))return value;
   return null;
  }
  static int Token(Dictionary<string,object> usage,string name){object value;if(!usage.TryGetValue(name,out value)||!(value is int)||(int)value<0)throw new InvalidOperationException("USAGE_UNVERIFIED");return (int)value;}
  public async Task<Dictionary<string,object>> Run(Scope scope,string ledgerDirectory){
   Policy.Validate(scope,clock()); // Before credential access, filesystem writes or HTTP.
   PrivateLedger.EnsurePrivateDirectory(ledgerDirectory);
   using(var gate=new FileStream(Path.Combine(ledgerDirectory,"execution.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None)){
    var reserved=Path.Combine(ledgerDirectory,"reserved.dpapi");
    if(File.Exists(reserved)||File.Exists(Path.Combine(ledgerDirectory,"result.dpapi")))throw new InvalidOperationException("ALREADY_RESERVED_NO_RETRY");
    PrivateLedger.SaveNew(reserved,new Dictionary<string,object>{{"jobId",Policy.JobId},{"state","dispatch_uncertain_hold"},{"reservedNano",Policy.ReserveNano},{"estimatedNano",Policy.EstimatedNano},{"workspaceId",scope.WorkspaceId},{"utc",clock().ToString("o")}});
    var result=new Dictionary<string,object>{{"jobId",Policy.JobId},{"state","halted_unknown"},{"applicationSendCalls",0},{"billingVerified",false},{"reservedNano",Policy.ReserveNano},{"expiryEvidence","user-confirmed date; conservative local cutoff"}};
    string key=null;
    result["stage"]="credential";
    try{
     key=credentials.ReadTestKey();
     result["stage"]="request_build";
     using(var message=new HttpRequestMessage(HttpMethod.Post,"https://api.anthropic.com/v1/messages")){
      message.Headers.Add("x-api-key",key);key=null;
      message.Headers.Add("anthropic-version","2026-10-21");
      message.Headers.Add("anthropic-workspace-id",scope.WorkspaceId);
      message.Content=new StringContent("{\"model\":\"claude-haiku-5-5\",\"max_tokens\":32,\"thinking\":{\"type\":\"disabled\"},\"messages\":[{\"role\":\"user\",\"content\":\"Reply exactly OK.\"}]}",Encoding.UTF8,"application/json");
      result["applicationSendCalls"]=1;result["stage"]="send";
      using(var cancel=new CancellationTokenSource(TimeSpan.FromSeconds(15)))
      using(var response=await client.SendAsync(message,HttpCompletionOption.ResponseHeadersRead,cancel.Token).ConfigureAwait(false)){
       result["stage"]="response_headers";
       result["httpStatus"]=(int)response.StatusCode;
       result["requestId"]=Header(response,"request-id");
       result["responseWorkspaceId"]=Header(response,"anthropic-workspace-id");
       result["responseOrganizationId"]=Header(response,"anthropic-organization-id");
       if(!response.IsSuccessStatusCode){result["state"]="http_error_no_retry";return SaveResult(ledgerDirectory,result);}
       if(result["responseWorkspaceId"]!=null&&(string)result["responseWorkspaceId"]!=scope.WorkspaceId)throw new InvalidOperationException("WORKSPACE_RESPONSE_MISMATCH");
       result["stage"]="response_parse";
       byte[] bytes=new byte[8192];string body;
       try{
        using(var buffer=new MemoryStream())using(var stream=await response.Content.ReadAsStreamAsync().ConfigureAwait(false)){
         int n;while((n=await stream.ReadAsync(bytes,0,bytes.Length,cancel.Token).ConfigureAwait(false))>0){if(buffer.Length+n>65536)throw new InvalidOperationException("RESPONSE_LIMIT");buffer.Write(bytes,0,n);}
         body=Encoding.UTF8.GetString(buffer.GetBuffer(),0,(int)buffer.Length);
        }
       }finally{Array.Clear(bytes,0,bytes.Length);}
       var parsed=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(body);body=null;
       object model,usageObject,contentObject;
       if(!parsed.TryGetValue("model",out model)||!Regex.IsMatch((model as string)??"",@"\Aclaude-haiku-5-5(?:-[0-9]{8})?\z"))throw new InvalidOperationException("MODEL_RESPONSE_MISMATCH");
       if(!parsed.TryGetValue("usage",out usageObject)||!(usageObject is Dictionary<string,object>))throw new InvalidOperationException("USAGE_UNVERIFIED");
       result["stage"]="usage_validation";
       var usage=(Dictionary<string,object>)usageObject;int input=Token(usage,"input_tokens"),output=Token(usage,"output_tokens");
       if(input>1000||output>32)throw new InvalidOperationException("TOKEN_BOUND_EXCEEDED");
       foreach(var name in new[]{"cache_creation_input_tokens","cache_read_input_tokens"})if(usage.ContainsKey(name)&&Token(usage,name)!=0)throw new InvalidOperationException("UNEXPECTED_CACHE_USAGE");
       long amount=input*Policy.InputRateNano+output*Policy.OutputRateNano;
       if(amount>Policy.ReserveNano)throw new InvalidOperationException("USAGE_COST_BOUND_EXCEEDED");
       if(!parsed.TryGetValue("content",out contentObject)||(!(contentObject is System.Collections.IEnumerable)||contentObject is string))throw new InvalidOperationException("CONTENT_UNVERIFIED");
       var text=new StringBuilder();foreach(var block in (System.Collections.IEnumerable)contentObject){var part=block as Dictionary<string,object>;if(part==null||!part.ContainsKey("type")||(string)part["type"]!="text"||!part.ContainsKey("text"))throw new InvalidOperationException("CONTENT_UNVERIFIED");text.Append((string)part["text"]);}
       bool ok=text.ToString().Trim()=="OK";text.Clear();
       result["replyMatchesOK"]=ok;result["inputTokens"]=input;result["outputTokens"]=output;
       result["estimatedUsageNano"]=amount;result["estimatedUsageUsd"]=amount/1e9;
       result["stage"]="complete";
       result["state"]=ok?"connected":"connected_reply_unexpected";
       return SaveResult(ledgerDirectory,result);
      }
     }
    }catch(Exception error){
     // Only a fixed allowlist may become diagnostics. Never echo exception/body/header text.
     string code="UNCLASSIFIED_FAILURE";
     if(error is OperationCanceledException)code="TIMEOUT_USAGE_UNKNOWN";
     else if(error is HttpRequestException)code="TLS_DNS_OR_NETWORK_FAILURE";
     else if(error is InvalidOperationException) {
      foreach(string allowed in new[]{"CREDENTIAL_UNAVAILABLE","CREDENTIAL_FORMAT_INVALID","WORKSPACE_RESPONSE_MISMATCH","RESPONSE_LIMIT","MODEL_RESPONSE_MISMATCH","USAGE_UNVERIFIED","TOKEN_BOUND_EXCEEDED","UNEXPECTED_CACHE_USAGE","USAGE_COST_BOUND_EXCEEDED","CONTENT_UNVERIFIED"})
       if(error.Message==allowed)code=allowed;
     }
     result["failureCode"]=code;result["state"]="halted_unknown_no_retry";return SaveResult(ledgerDirectory,result);
    }finally{key=null;}
   }
  }
  static Dictionary<string,object> SaveResult(string directory,Dictionary<string,object> result){
   PrivateLedger.SaveNew(Path.Combine(directory,"result.dpapi"),result);return result;
  }
  public static Dictionary<string,object> RunWindows(Scope scope){
   Policy.Validate(scope,DateTime.UtcNow);
   if(Environment.OSVersion.Platform!=PlatformID.Win32NT)throw new InvalidOperationException("WINDOWS_REQUIRED");
   if(ServicePointManager.ServerCertificateValidationCallback!=null)throw new InvalidOperationException("CUSTOM_CERTIFICATE_VALIDATION_FORBIDDEN");
   var previous=ServicePointManager.SecurityProtocol;
   try{
    ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
    using(var handler=new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false,UseDefaultCredentials=false})
    using(var client=new HttpClient(handler)){return new OneShot(client,new WindowsCredentialSource(),()=>DateTime.UtcNow).Run(scope,DefaultLedgerPath()).GetAwaiter().GetResult();}
   }finally{ServicePointManager.SecurityProtocol=previous;}
  }
 }
}
