using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using SolqTest;
public sealed class SyntheticSecret:ICredentialSource {
 public int Reads;public bool Missing;
 public string ReadTestKey(){Interlocked.Increment(ref Reads);if(Missing)throw new InvalidOperationException("CREDENTIAL_UNAVAILABLE");return "SYNTHETIC-NOT-A-REAL-CREDENTIAL";}
}
public sealed class FakeTransport:HttpMessageHandler {
 public int Calls;public string Mode="ok";
 protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token){
  Interlocked.Increment(ref Calls);
  string body=await request.Content.ReadAsStringAsync();var parsed=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(body);
  if(request.RequestUri.AbsoluteUri!="https://api.anthropic.com/v1/messages"||request.Method!=HttpMethod.Post||(string)parsed["model"]!=Policy.Model||(int)parsed["max_tokens"]!=32||body.Contains("SYNTHETIC-NOT-A-REAL-CREDENTIAL")||parsed.ContainsKey("tools")||parsed.ContainsKey("cache_control"))throw new Exception("bad synthetic request envelope");
  if(!request.Headers.Contains("anthropic-workspace-id")||!request.Headers.Contains("x-api-key"))throw new Exception("missing headers");
  if(Mode=="timeout")throw new TaskCanceledException("SYNTHETIC_DIAGNOSTIC_MUST_NOT_LEAK");
  if(Mode=="network")throw new HttpRequestException("SYNTHETIC_DIAGNOSTIC_MUST_NOT_LEAK");
  if(Mode=="delay")await Task.Delay(200);
  int status=Mode=="http401"?401:Mode=="http302"?302:200;
  string payload="{\"model\":\"claude-haiku-5-5\",\"content\":[{\"type\":\"text\",\"text\":\"OK\"}],\"usage\":{\"input_tokens\":20,\"output_tokens\":2}}";
  if(Mode=="bad_json")payload="SYNTHETIC_PRIVATE_BODY_DO_NOT_LOG";
  if(Mode=="missing_usage")payload="{\"model\":\"claude-haiku-5-5\",\"content\":[]}";
  if(Mode=="token_overrun")payload=payload.Replace("\"output_tokens\":2","\"output_tokens\":33");
  if(Mode=="cache")payload=payload.Replace("\"input_tokens\":20","\"input_tokens\":20,\"cache_read_input_tokens\":1");
  if(Mode=="reply")payload=payload.Replace("\"text\":\"OK\"","\"text\":\"NOT EXPECTED PRIVATE RESPONSE\"");
  if(Mode=="huge")payload=new string('x',70000);
  var response=new HttpResponseMessage((HttpStatusCode)status){Content=new StringContent(payload)};
  response.Headers.Add("request-id","req_synthetic");response.Headers.Add("anthropic-workspace-id",Mode=="scope"?"wrkspc_wrong_fixture":"wrkspc_synthetic_fixture");
  response.Headers.Add("anthropic-organization-id","org_synthetic");return response;
 }
}
public static class OneShotFixtures {
 static DateTime Now=new DateTime(2026,10,28,1,0,0,DateTimeKind.Utc);
 static Scope Scope(){return new Scope{Approved=true,WorkspaceKeyAndAutoReloadOffConfirmed=true,WorkspaceId="wrkspc_synthetic_fixture"};}
 static void Check(bool value,string name){if(!value)throw new Exception("SYNTHETIC_ASSERT_"+name);}
 public static Dictionary<string,object> RunAll(string root){
  var checks=new List<string>();int actual=0;
  Func<string,string> dir=name=>Path.Combine(root,name);
  // Fake credentials and a fake HttpMessageHandler only; no CredRead/CredWrite, TLS or provider request.
  foreach(string mode in new[]{"ok","timeout","network","http401","http302","bad_json","missing_usage","token_overrun","cache","reply","scope","huge"}){
   var fake=new FakeTransport{Mode=mode};var secret=new SyntheticSecret();
   using(var client=new HttpClient(fake)){
    var runner=new OneShot(client,secret,()=>Now);var result=runner.Run(Scope(),dir(mode)).GetAwaiter().GetResult();
    Check(fake.Calls==1&&secret.Reads==1,mode+"_single");
    string data=new JavaScriptSerializer().Serialize(result);
    Check(!data.Contains("SYNTHETIC-NOT-A-REAL-CREDENTIAL")&&!data.Contains("PRIVATE")&&!data.Contains("MUST_NOT_LEAK"),mode+"_sanitized");
    if(mode=="ok"){Check((string)result["state"]=="connected","success_stage_"+result["stage"]+"_"+(result.ContainsKey("failureCode")?result["failureCode"]:"none"));Check((long)result["estimatedUsageNano"]==3000,"cost");}
    else Check((string)result["state"]!="connected",mode+"_blocked");
    var receipt=PrivateLedger.ReadReceipt(Path.Combine(dir(mode),"result.dpapi"));Check((string)receipt["state"]==(string)result["state"],mode+"_dpapi");
    byte[] ciphertext=File.ReadAllBytes(Path.Combine(dir(mode),"result.dpapi"));Check(!Encoding.UTF8.GetString(ciphertext).Contains("requestId"),mode+"_not_plaintext");
    bool rejected=false;try{runner.Run(Scope(),dir(mode)).GetAwaiter().GetResult();}catch{rejected=true;}
    Check(rejected&&fake.Calls==1&&secret.Reads==1,mode+"_no_retry");
   }
   checks.Add(mode+": fixed envelope, one send, sanitized encrypted receipt, repeat denied");
  }
  var missing=new SyntheticSecret{Missing=true};var transport=new FakeTransport();
  using(var client=new HttpClient(transport)){
   var result=new OneShot(client,missing,()=>Now).Run(Scope(),dir("credential")).GetAwaiter().GetResult();
   Check(transport.Calls==0&&(string)result["failureCode"]=="CREDENTIAL_UNAVAILABLE","credential_missing");
  }checks.Add("missing credential: zero sends, no fallback");
  foreach(string reason in new[]{"approval","scope","expiry"}){
   var scope=Scope();if(reason=="approval")scope.Approved=false;if(reason=="scope")scope.WorkspaceId="Default";
   var fake=new FakeTransport();var secret=new SyntheticSecret();using(var client=new HttpClient(fake)){
    bool rejected=false;try{new OneShot(client,secret,()=>reason=="expiry"?Policy.StopAtUtc:Now).Run(scope,dir(reason)).GetAwaiter().GetResult();}catch{rejected=true;}
    Check(rejected&&fake.Calls==0&&secret.Reads==0&&!Directory.Exists(dir(reason)),reason+"_before_secret_io");
   }checks.Add(reason+": denied before secrets, ledger and send");
  }
  var simultaneous=new FakeTransport{Mode="delay"};var simultaneousSecret=new SyntheticSecret();
  using(var client=new HttpClient(simultaneous)){
   var runner=new OneShot(client,simultaneousSecret,()=>Now);int successes=0;
   // Create the private directory once; processes/threads then contend on the exclusive file handle.
   PrivateLedger.EnsurePrivateDirectory(dir("concurrent"));
   var calls=new List<Task>();for(int n=0;n<16;n++)calls.Add(Task.Run(async()=>{try{await runner.Run(Scope(),dir("concurrent"));Interlocked.Increment(ref successes);}catch{}}));
   Task.WaitAll(calls.ToArray());Check(successes==1&&simultaneous.Calls==1&&simultaneousSecret.Reads==1,"concurrency");
  }checks.Add("16 concurrent contenders: one encrypted reservation and one mock send");
  return new Dictionary<string,object>{{"pass",checks.Count},{"checks",checks},{"realProviderCalls",actual},{"windowsCredentialStoreAccessed",false},{"actualApiUsd",0},{"actualTlsTested",false},{"actualKeyScopeOrExpiryTested",false}};
 }
}
