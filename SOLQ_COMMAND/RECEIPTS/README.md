# SOLQ COMMAND — ACK receipt channel

Status: CANDIDATE / NO-GO. This is a public, non-operational receipt channel, not an execution authorization.

## Receipt format (one file per task)

Write only to `SOLQ_COMMAND/RECEIPTS/<TASK_ID>.json` on branch `docs/solq-ack-receipts-20261121`.
Use ASCII task IDs; never overwrite an existing receipt without a separate approval. Keep the existing ledger files unchanged.

Required fields: schemaVersion (1), taskNumber, baselineCommit, instructionPath, instructionSha256, receiptKey, receiptStatus, executionStatus, executedTasks, verifiedAtUtc, reportStatus, evidenceRefs, requiresApproval.

No secrets, customer data, credentials, internal PC paths, personal identifiers, or operational connection information. Never claim PASS for tests not actually performed. A receipt is not permission to execute. GitHub publication by Windows Codex requires a separate instruction to that Codex session and confirmation of its write permissions. No polling agent, hook, deployment, or production modifications are authorized by this file.
