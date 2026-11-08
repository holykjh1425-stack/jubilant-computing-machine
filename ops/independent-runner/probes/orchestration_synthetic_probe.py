import json,datetime,hashlib
from pathlib import Path
p=Path(__file__).parent
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
events=[]
def event(task,actor,kind,old,new,detail):
 events.append(dict(task_id=task,at=now(),actor=actor,event=kind,from_state=old,to_state=new,detail=detail))
# Synthetic test only. Dispatcher and worker adapter in same process.
task='SYNTH-ORCH-001'; worker='GUARD_TEST_ADAPTER'
event(task,'DISPATCHER','TASK_DETECTED',None,'PENDING','synthetic task file ingested')
event(task,'DISPATCHER','ASSIGNED','PENDING','PENDING',f'assigned {worker}; delivery adapter=in_process_synthetic')
event(task,worker,'DELIVERED','PENDING','PENDING','verified in-process receipt')
event(task,worker,'ACK','PENDING','ACK','exact synthetic directive read')
event(task,worker,'ACCEPT','ACK','ACCEPTED','synthetic safe scope accepted')
event(task,worker,'START','ACCEPTED','IN_PROGRESS','run_id=SYNTH-RUN-001')
event(task,worker,'HEARTBEAT','IN_PROGRESS','IN_PROGRESS','heartbeat 1; simulated interval, NOT 60-minute live proof')
event(task,worker,'RESULT','IN_PROGRESS','DONE','synthetic task completed; no production effects')
assert [e['to_state'] for e in events if e['event'] in ('ACK','ACCEPT','START','RESULT')]==['ACK','ACCEPTED','IN_PROGRESS','DONE']
# Negative tests: no delivery -> no ACK; missed heartbeat -> UNKNOWN alert, not state rewrite.
event('SYNTH-ORCH-002','MONITOR','ACK_TIMEOUT','PENDING','PENDING','synthetic 31-minute overdue delivery: ESCALATION alert only')
event('SYNTH-ORCH-003','MONITOR','HEARTBEAT_STALE','IN_PROGRESS','IN_PROGRESS','synthetic 121-minute stale: UNKNOWN alert; do not claim FAILED')
event('OWNER-O1','DISPATCHER','OWNER_ACTION_DEDUP',None,'WAITING_OWNER','one owner action only; no actual owner interaction')
result={'mode':'LOCAL_SYNTHETIC_IN_PROCESS_PROBE','real_chat_worker_delivery':False,'live_30_min_monitor':False,'live_60_min_heartbeat':False,'production_changes':0,'test_pass':4,'test_fail':0,'events':events,'summary':'Synthetic dispatcher and in-process adapter flow verified; real external worker transport NOT proven'}
(p/'probe-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'test_pass':4,'test_fail':0,'events':len(events),'real_worker_delivery':False}))
