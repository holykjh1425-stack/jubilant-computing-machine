# Windows encrypted backup / TLS preparation — 2026-10-28 KST

Preparation only. No operating database connection from Windows, dump, restore, USB access, login, production deployment or paid API ran in this work.

## Reused evidence and current access boundary

- User confirmed Windows pg_dump17.11 and matching Kleopatra public fingerprint. No repeated PC version/key check requested.
- Existing public fingerprint is fixed in Backup-Encrypted.ps1. No secret key or passphrase is in source.
- Previous connector observation: server17.11, ssl=on, minimumTLS1.2, connector sessionTLS1.3. This does NOT establish PC TLS, client hostname/CA validation or project SSL-enforcement policy.
- Current Work browser inventory has no open tabs. The user's Owner browser session is not accessible here. No sign-in/retry was performed; Connect settings, downloaded certificate and its provenance on the PC remain unverified.
- Previous six Linux crypto cases, application Auth/PostgREST and native approval concurrency PASS are reused, not rerun. New tests exercise the Windows binary transport only.

## Official secure connection preparation

1. In the existing Owner session, select the existing project and its top Connect menu. Prefer Direct connection. If the PC/network cannot use its IPv6 route and there is no existing IPv4 add-on, use the official Session pooler. Do not purchase an add-on or use transaction mode for this backup. Obtain the host/user from Connect, never compose a regional pooler hostname.
2. In Database Settings / SSL Configuration, obtain the official database CA certificate. This is a public certificate, not a client private key or DB credential. Preserve its official provenance; never obtain a CA from an error-message link or bypass a certificate warning.
3. Configure libpq with sslmode=verify-full and sslrootcert pointing to the trusted CA. Keep the official hostname, not an IP replacement. Certificate chain, expiry or hostname errors must stop the operation; never downgrade to require/prefer/disable.
4. The existing connector cannot expose project SSL-enforcement status with its current tools. ssl=on and an encrypted connector session do not prove rejection of plaintext connections. Do not change SSL enforcement: that can reboot the database. Client verify-full is mandatory independently of the global enforcement setting.
5. Do not send passwords, connection strings, tokens or screenshots containing them into chat/GitHub. Use local protected input only when a later one-time backup is expressly approved.

Official references:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/platform/ssl-enforcement
- https://www.postgresql.org/docs/17/libpq-ssl.html
- https://www.postgresql.org/docs/17/app-pgdump.html

## Implementation

Files: Backup-Encrypted.ps1 and EncryptedStream.cs must remain together in the same private local tools directory, outside the backup destination. Check-BackupTools.ps1 is the earlier optional tool preflight; its completed PC check need not be rerun.

- Default invocation stops PREPARATION_ONLY before any password prompt, key access or DB connection. Later explicit operating-backup and security-checklist flags are execution guards, not substitutes for user authorization.
- Actual mode requires Windows, all three PG tools17.11, the existing destination, official Direct/Session configuration and a CA file that parses and is currently valid. Official certificate provenance still requires verification; parsing alone does not establish trust. Actual PC pg_dumpall/pg_restore availability remains unverified until checked; a pg_dump version alone does not prove them.
- Uses only a dedicated C:\SOLQ_public_key home containing the verified public recipient; not the default keyring or USB. The script does not create/import/export keys. Public-only home preparation is pending. Secret-key listings there inspect metadata only and reject a home containing a secret key.
- GPG receives the full verified fingerprint and AES256. Native Gpg4win is required for operating exports (Git MSYS GPG is rejected). GPG configuration files are not loaded. An expired/missing/non-encrypting recipient must fail; no network key retrieval or replacement key should be used.
- A secure local password prompt supplies only the child process environment, never arguments, a connection URL, repository, plaintext credential file or process-global environment. Password characters necessarily exist transiently in process memory/environment; this does not protect against a compromised PC or an administrator inspecting the process. Do not claim zero memory exposure.
- PGSSLMODE=verify-full, PGSSLROOTCERT, PGCONNECT_TIMEOUT and read-only session options are fixed for child processes; conflicting inherited connection-service settings are removed. No SQL writes or free-worker calls exist.
- pg_dump custom binary output moves via .NET BaseStream, not the Windows PowerShell text pipeline. pg_dumpall roles-only uses no-role-passwords. Child diagnostics are drained/discarded; only generic stop categories and ciphertext hashes can be displayed.
- Only encrypted .gpg / .partial.gpg output is written in C:\SOLQ_보안백업. No plaintext SQL/archive/temp/customer file. Both producer and encryptor exit status, stream transfer and timeout must succeed before a single artifact is promoted. A zero-byte source or any producer stderr (including an exit-zero dump warning) rejects promotion; the raw copy buffer is cleared when its transfer finishes. Existing files are never overwritten. A failed role export can leave a successful DB artifact; that is an INCOMPLETE SET, never a complete backup.
- SHA256 is over ciphertext and detects changes relative to a trusted recorded digest. It is not proof of database completeness or successful restoration. OpenPGP integrity/decryption and isolated restore remain separate checks.

## Scope and remaining risks

The executable exports DATABASE + ROLE DEFINITION artifacts only. It is not a full Supabase project exporter. Edge code/config, Storage object bodies, project/Auth/OAuth/SMTP/JWT/domain settings, and Vault managed-key recovery remain separately required according to READINESS_20261028.md. Do not call these two files a full system recovery backup.

Before real export, verify destination ACL/capacity/no reparse ancestor or cloud synchronization; CA authenticity; public-key-only home/recipient encryption validity; protected credential availability; managed-schema/role coverage; safe operating window/egress allowance; encrypted manifest/supplement coverage; and an approved isolated encrypted restore target. No operating customer material belongs in public CI or ChatGPT uploads. The existing folder itself is not proof of disk encryption, and no zero-pagefile/zero-crashdump guarantee is made for Windows memory.

User-PC Gpg4win5.1.1 behavior and its actual key are not proven by a Windows CI synthetic key. USB secret-key recoverability remains unverified and outside scope. No need to reconnect the USB for public-key encryption preparation.

## Synthetic Windows evidence

Tests use the existing public repository's disposable Windows CI resource and a disposable SYNTHETIC key only. No repository secrets, DB endpoint/credential or user key is supplied. Test bytes include every byte value and never represent customer data. First attempted Windows test exposed a reserved PowerShell variable in cleanup; it was corrected. Native GPG diagnostics are suppressed in production; synthetic-only generator diagnostics may be used to identify runner incompatibilities. The Git MSYS GPG runner required POSIX path mapping and shorter disposable key-home paths for its agent. This adapter is synthetic-test-only; operating exports require native Gpg4win. Windows .NET Framework creates redirected stdin using Console.InputEncoding with AutoFlush; UTF8 with a preamble can add three bytes before binary input. StartRaw now sets UTF8-without-BOM only during Process.Start under a lock and immediately restores the prior console input encoding; raw BaseStream is closed directly. No credential/plaintext is sent through Console. This small temporary code-page change is part of the script and is restored even on failure; it does not change execution/security policy. Final result and provenance are recorded only after completion, never presumed from script creation. The production coordinator does not reference any synthetic-key generation or test private key.

## Minimal next user steps / approvals

Only unresolved preparation is needed: existing Owner Connect method and official CA download; private local public-only key home; remaining PG tools and destination protection; isolated restore readiness. Never repeat successful Auth/PC-version/fingerprint checks.

No actual backup command should be run yet. Separate approval is needed for the one-time encrypted operating export and, independently, isolated restore or USB recovery. No main merge/Pages/Sites/Edge deployment is needed for this work.

## Final result

Windows Server2022 / Windows PowerShell5.1.20348.5756, synthetic-only final run40603167026/job122536058310: **11 PASS**, 2026-10-28 08:36 KST. Tested source fa8332ab2ecb803eef3c36fd548399bec4d0540f. Public-only encryption, ciphertext SHA256, all-byte binary roundtrip, empty-source rejection, source-exit17 rejection, missing-recipient/executable rejection, timeout handling, existing-file protection, corrupted-ciphertext rejection and default no-DB gate passed. Earlier failures are not PASS evidence.

Evidence: WINDOWS_SYNTHETIC_RESULT_20261028.json and https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/40603167026/job/122536058310 . No source was changed after this successful tested revision; subsequent commit records documentation/evidence only. No passed suite needs repeating without a new implementation change.

**Decision:** Windows stream implementation preparation PASS in the isolated synthetic environment; user-PC secure DB connection NOT VERIFIED; native user Gpg4win recipient execution NOT VERIFIED; complete project backup/recovery NOT READY. Actual operating backup/restore remains unexecuted and requires separate approval after the unresolved prerequisites are met.
