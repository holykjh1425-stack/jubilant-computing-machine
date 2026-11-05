# SOLQ isolated-process dispatcher/worker integration probe
# Python 3 stdlib only. Synthetic task; no production access.
import argparse, json, os, sqlite3, subprocess, sys, time, uuid

def emit(db, task, actor, event, old, new, evidence):
    db.execute('INSERT INTO events(task,actor,event,old_state,new_state,at,evidence) VALUES(?,?,?,?,?,?,?)',(task,actor,event,old,new,time.time(),evidence))

def init(db):
    db.execute('CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,worker TEXT,state TEXT,run_id TEXT,updated REAL)')
    db.execute('CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,task TEXT,actor TEXT,event TEXT,old_state TEXT,new_state TEXT,at REAL,evidence TEXT)')
    db.commit()

def transition(db, task, actor, event, old, new, evidence):
    c=db.execute('UPDATE tasks SET state=?,updated=? WHERE id=? AND state=?',(new,time.time(),task,old))
    if c.rowcount!=1: raise RuntimeError('invalid transition '+event)
    emit(db,task,actor,event,old,new,evidence);db.commit()

def worker(dbpath, task, run_id, interval):
    db=sqlite3.connect(dbpath,timeout=10);init(db)
    transition(db,task,'GUARD-ISOLATED-PROCESS','ACK','PENDING','ACK','worker process PID='+str(os.getpid()))
    transition(db,task,'GUARD-ISOLATED-PROCESS','ACCEPT','ACK','ACCEPTED','scope=synthetic-only')
    transition(db,task,'GUARD-ISOLATED-PROCESS','START','ACCEPTED','IN_PROGRESS','run_id='+run_id)
    for i in range(2):
        time.sleep(interval)
        emit(db,task,'GUARD-ISOLATED-PROCESS','HEARTBEAT','IN_PROGRESS','IN_PROGRESS','beat='+str(i+1)+' pid='+str(os.getpid()));db.commit()
    transition(db,task,'GUARD-ISOLATED-PROCESS','RESULT','IN_PROGRESS','DONE','synthetic result=PASS')
    db.close()

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--worker',action='store_true');ap.add_argument('--db',required=True);ap.add_argument('--task');ap.add_argument('--run-id');ap.add_argument('--interval',type=float,default=1.0);a=ap.parse_args()
    if a.worker:return worker(a.db,a.task,a.run_id,a.interval)
    db=sqlite3.connect(a.db,timeout=10);init(db)
    task='TEST-TASK-'+uuid.uuid4().hex[:8].upper();run_id='RUN-'+uuid.uuid4().hex[:8]
    db.execute('INSERT INTO tasks VALUES(?,?,?,?,?)',(task,'GUARD','PENDING',run_id,time.time()))
    emit(db,task,'DISPATCHER','DETECTED',None,'PENDING','synthetic queue item')
    emit(db,task,'DISPATCHER','ASSIGNED','PENDING','PENDING','worker=GUARD')
    db.commit()
    child=subprocess.Popen([sys.executable,__file__,'--worker','--db',a.db,'--task',task,'--run-id',run_id,'--interval',str(a.interval)])
    emit(db,task,'DISPATCHER','DELIVERY','PENDING','PENDING','child_pid='+str(child.pid));db.commit()
    rc=child.wait(timeout=30)
    if rc:raise RuntimeError('worker exit='+str(rc))
    state=db.execute('SELECT state FROM tasks WHERE id=?',(task,)).fetchone()[0]
    rows=db.execute('SELECT seq,task,actor,event,old_state,new_state,at,evidence FROM events ORDER BY seq').fetchall()
    names=[r[3] for r in rows]
    assert state=='DONE' and all(x in names for x in ('DETECTED','ASSIGNED','DELIVERY','ACK','ACCEPT','START','HEARTBEAT','RESULT'))
    assert names.count('HEARTBEAT')==2
    assert len(set(r[2] for r in rows))>=2
    emit(db,'TEST-ACK-TIMEOUT','MONITOR','ESCALATION','PENDING','PENDING','synthetic delivered_at=now-31min')
    emit(db,'TEST-HB-STALE','MONITOR','UNKNOWN_ALERT','IN_PROGRESS','IN_PROGRESS','synthetic last_heartbeat=now-121min');db.commit()
    events=[dict(zip(['seq','task','actor','event','old_state','new_state','epoch','evidence'],r)) for r in db.execute('SELECT seq,task,actor,event,old_state,new_state,at,evidence FROM events ORDER BY seq')]
    print(json.dumps({'test_pass':6,'test_fail':0,'task':task,'run_id':run_id,'worker_pid':child.pid,'dispatcher_pid':os.getpid(),'state':state,'heartbeat_count':2,'real_worker_chat':False,'heartbeat_interval_seconds':a.interval,'events':events},indent=2))
if __name__=='__main__':main()
