import importlib.util,unittest
from pathlib import Path
path=Path(__file__).resolve().parents[2]/'ops/free-generation-approval/readonly_auth_check.py'
spec=importlib.util.spec_from_file_location('checker',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Test(unittest.TestCase):
 def test_write_routes_blocked(self):
  for method,path,body in [('POST','/rest/v1/applications',{}),('POST','/rest/v1/rpc/solq_free_generation',{'p_action':'generate'}),('PATCH','/rest/v1/applications',{}),('POST','/functions/v1/nexus-orchestrator',{'action':'tick'}),('POST','/functions/v1/nexus-orchestrator',{'action':'submit'}),('POST','/auth/v1/token?grant_type=password',{'email':'x','password':'y','extra':True})]:
   self.assertFalse(m.allowed(method,path,body))
 def test_transport_never_runs_blocked_route(self):
  class Never:
   def open(self,*a,**kw):raise AssertionError('network reached')
  with self.assertRaisesRegex(RuntimeError,'NOT_ALLOWLISTED'):m.call('POST','/rest/v1/applications','synthetic',body={},opener=Never())
 def test_minimal_no_personal_data_result(self):
  calls=[];uid='aaaaaaaa-0000-4000-8000-000000000001'
  def fake(method,path,key,token=None,body=None):
   self.assertTrue(m.allowed(method,path,body));calls.append((method,path))
   if '/token?' in path:return {'access_token':'synthetic-only'},{}
   if path=='/auth/v1/user':return {'id':uid,'email':'synthetic@example.invalid'},{}
   if 'admin_users' in path:return [{'user_id':uid}],{}
   if method=='HEAD':return None,{'Content-Range':'0-0/9'}
   return {'paid_calls':0,'external_execution_enabled':False},{}
  result=m.check('publishable','synthetic@example.invalid','synthetic',fake)
  self.assertEqual(result['business_writes'],0);self.assertEqual(len(calls),7)
  self.assertNotIn('token',str(result));self.assertNotIn(uid,str(result));self.assertNotIn('email',str(result))
 def test_failed_login_no_retry(self):
  calls=[]
  def fake(*a,**kw):calls.append(a);raise RuntimeError('HTTP_400')
  with self.assertRaisesRegex(RuntimeError,'HTTP_400'):m.check('publishable','synthetic','synthetic',fake)
  self.assertEqual(len(calls),1)
if __name__=='__main__':unittest.main()
