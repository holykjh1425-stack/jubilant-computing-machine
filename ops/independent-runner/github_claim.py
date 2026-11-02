"""GitHub Contents API compare-and-swap task claim (candidate).
Only use a dedicated non-production ledger branch. No automatic retry on 409.
"""
import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request

def claim_remote(owner, repo, branch, path, task_id, worker_id, run_id, token):
    if not token or not all([repo, branch, path, task_id, worker_id, run_id]):
        raise ValueError("missing required input")
    if branch == "main" or branch == "master":
        raise ValueError("protected branch not allowed")
    url = "https://api.github.com/repos/" + repo + "/contents/" + urllib.parse.quote(path)
    headers = {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "SOLQ-candidate-claim"}
    def request(method, payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(url + ("?ref=" + urllib.parse.quote(branch) if method == "GET" else ""),
                                     data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            if exc.code in (409, 422):
                raise RuntimeError("CLAIM_CONFLICT: refresh evidence, do not auto-retry") from None
            raise
    current = request("GET")
    ledger = json.loads(base64.b64decode(current["content"]))
    tasks = ledger["tasks"]
    task = next((t for t in tasks if t["id"] == task_id), None)
    if task is None or task.get("status") != "ready" or task.get("owner") != worker_id:
        raise ValueError("task unavailable or wrong owner")
    if any(next((t for t in tasks if t["id"] == d), {}).get("status") != "done" for d in task.get("depends_on", [])):
        raise ValueError("dependencies incomplete")
    task["status"] = "in_progress"
    task["claim"] = {"worker": worker_id, "run_id": run_id}
    payload = {"message": "SOLQ claim " + task_id + " by " + worker_id,
               "content": base64.b64encode((json.dumps(ledger, ensure_ascii=False, indent=2) + "\n").encode()).decode(),
               "sha": current["sha"], "branch": branch}
    response = request("PUT", payload)
    return {"task_id": task_id, "run_id": run_id, "commit_sha": response["commit"]["sha"]}

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 5:
        raise SystemExit("usage: github_claim.py TASK_ID WORKER_ID RUN_ID BRANCH")
    print(json.dumps(claim_remote("SOLQ", "holykjh1425-stack/jubilant-computing-machine",
        sys.argv[4], "ops/independent-runner/tasks.json", sys.argv[1], sys.argv[2], sys.argv[3],
        os.environ["GITHUB_TOKEN"])))
