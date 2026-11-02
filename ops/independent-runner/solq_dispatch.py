#!/usr/bin/env python3
"""Credential-free SOLQ ATLAS planning runner. No network, no writes to source ledger."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path

ROLES = {"ATLAS","FIN","CORE","AUTO","GUARD","SENTINEL","GROW","INNO","EDU","ESTATE","MODU","CARE"}
SAFE_EXECUTORS = {"planning_read_only", "github_actions_manual_dispatch"}
PRIORITIES = {"GUARD":0,"SENTINEL":0,"CORE":0,"AUTO":0,"GROW":1,"FIN":1,"INNO":2,"EDU":2,"ESTATE":2,"MODU":2,"CARE":2,"ATLAS":0}

def plan(ledger, run_id):
    tasks = ledger["tasks"]
    if len({t["id"] for t in tasks}) != len(tasks):
        raise ValueError("duplicate task IDs")
    by_id = {t["id"]:t for t in tasks}
    messages = []
    for t in tasks:
        owner=t.get("owner")
        if owner not in ROLES:
            raise ValueError("unknown owner")
        if t.get("status") != "ready" or t.get("requires_approval",False) or t.get("executor") not in SAFE_EXECUTORS:
            continue
        if any(by_id.get(dep,{}).get("status")!="done" for dep in t.get("depends_on",[])):
            continue
        # Proposals only: never claim tasks, execute tools or impersonate worker chats.
        msg={"task_id":t["id"],"owner":owner,"action":"REVIEW_PROPOSAL_ONLY",
             "title":t["title"],"run_id":run_id,"approval":"not_granted",
             "source_status":t["status"]}
        msg["idempotency_key"]=hashlib.sha256((t["id"]+"|"+owner+"|"+run_id).encode()).hexdigest()[:24]
        messages.append(msg)
    messages.sort(key=lambda m:(PRIORITIES[m["owner"]],m["task_id"]))
    agenda=[{"topic":"P0 운영 안전성","roles":["GUARD","SENTINEL","CORE","AUTO"],"gate":"NO-GO until actual evidence"},
            {"topic":"P1 첫 유료 고객","roles":["GROW","FIN","CORE"],"gate":"No ads, payments or customer contact without approval"},
            {"topic":"P2 무비용 타당성","roles":["INNO","EDU","ESTATE","MODU","CARE","FIN"],"gate":"Public research only"}]
    return {"mode":"dry_run_proposals_only","run_id":run_id,"messages":messages,"meeting_agenda":agenda,
            "warnings":["Does not send messages to ChatGPT worker chats","Does not claim locks or execute tasks","Does not change production or ledger"]}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--ledger",default="ops/independent-runner/tasks.json")
    p.add_argument("--output",default="artifacts/solq-dispatch.json")
    p.add_argument("--run-id",default=None)
    args=p.parse_args()
    run_id=args.run_id or dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    data=plan(json.loads(Path(args.ledger).read_text(encoding="utf-8")),run_id)
    dest=Path(args.output);dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"status":"PASS","mode":data["mode"],"proposals":len(data["messages"]),"output":str(dest)}))
if __name__=="__main__":
    main()
