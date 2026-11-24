# Tests & Results log

## Environment
- Machine: <CPU model, cores, RAM>
- OS: Windows <11>, Docker Desktop <4.98.0> (WSL2 backend)
- Node v24.0.1, TypeScript 6.0.3 (pinned; TS 7 breaks ts-node), ts-node-dev 2.0.0
- Postgres: Supabase free tier via session pooler; Redis: `redis:latest` in Docker
- LLM: `gemini-3.5-flash`; embeddings: `gemini-embedding-2` (768 dims)
- Test runner: Vitest 5.0.4

## Findings: bugs found by testing

### F1. Ranking tie put the weaker candidate first (Phase 3)
- **Observed:** for the Backend Software Engineer job, resume 10 ranked above resume 9, even though resume 9 covered more of the requirements. Both resumes contain a "REST APIs" skill and returned an identical similarity (`0.713215819618289`).
- **Cause:** the query took the 10 nearest individual entities and grouped them by resume. Nothing measured how many of the job's requirements each candidate covered, so a shared generic skill decided the order.
- **Fix:** retrieve the best match per requirement per resume (`DISTINCT ON (resume_id)`), then average across all requirements. A missing requirement now lowers the score.
- **Regression test:** `tests/ranking.test.ts` — result: <pass, date - 9th October 2026>

### F2. Non-PDF upload returned 500 instead of 400
- **Observed:** uploading `q2.asm` returned `500 {"error":"Internal server error"}`, and the log recorded it as an unhandled error ("Only PDF files are allowed").
- **Cause:** the global error handler only recognised `MulterError`. My `fileFilter` threw a plain `Error`, so it fell through to the 500 branch.
- **Fix:** the error now carries `status = 400`. The handler returns any deliberate 4xx with its own status. The `pdf-parse` call is wrapped, so a fake PDF returns 400 too.
- **Re-test:**
  - [Pass] `q2.asm` returns 400 "Only PDF files are allowed"
  - [Pass] text file renamed `fake.pdf` returns 400 "Could not read PDF"
  - [Pass] PDF over 5 MB returns 400
  - [Pass] valid PDF returns 202

### F3. Gemini 503 killed resume extraction (Phase 3)
- **Observed:** `503 UNAVAILABLE` ("This model is currently experiencing high demand") during resume processing. Retries inside the function fired within seconds of each other, and the job failed permanently (job 7).
- **Cause:** all retries fell inside one short window, and the job itself got only one attempt.
- **Fix:** retries moved to the queue (`attempts: 4`, exponential backoff starting at 5s). A job that exhausts its attempts marks the resume `failed` instead of leaving it `pending` forever.

### F4. LLM unavailable at match time: the endpoint degraded instead of failing
- **Observed:** `GET /matches/<jobId>` returned `200` in 10.25s with the ranked candidate and per-requirement evidence intact, but `explanation: null` and `explanationAvailable: false`.
- **Cause:** not captured. The failure was swallowed silently at the time. That's why `generateWithRetry` and the route now log every failed attempt with the reason. The ~10s is consistent with three failed attempts plus backoff sleeps, but I did not confirm it.
- **Takeaway:** retrieval doesn't depend on the LLM, so an LLM outage costs the explanation and nothing else.

### F5. Recovery from Gemini overload via retry
- **Observed (log):** two `503 UNAVAILABLE` warnings on attempt 1 (`"msg":"gemini call failed"`), and the request still completed with explanations.
- **Result:** `matches_served`, `jobId: 2`, `candidates: 7`, `retrievalMs: 1509`, `totalMs: 44094`. Top candidate: resume 11, score 0.926.

### F6. Match endpoint latency is dominated by the LLM
- **Measured:** 44.1s total, of which 1.5s was retrieval. About 42.6s (44094 − 1509 ms) went to explanation calls and retries.
- **Current mitigation:** explanations for the top 5 candidates run in batches of 2 (`EXPLAIN_CONCURRENCY`) to stay under the free-tier rate limit.
- **Not fixed yet (listed under "What I'd do next"):** cache explanations per job/resume pair, generate them on demand for one candidate at a time, or return the ranking first and fill in explanations afterwards.

### F7. High score, weak evidence: ranker and explainer disagree
- **Observed:** resume 11 scored 0.926, but the generated explanation says its evidence "consists solely of listed skills without accompanying project descriptions" and recommends further screening.
- **Cause:** an exact string such as "Node.js" matches itself at similarity 1.0 whether it appears in a skills list or in a real project, so skills-only resumes score high.
- **Plan:** the Step 18 experiment (down-weight bare skill-list matches versus project/experience evidence). This is the "before" case.

### F8. Redis outage hung the API instead of returning 503
- **Observed:** with Redis stopped, `POST /submissions` never returned (client spinner indefinitely), and the new row stayed `pending`.
- **Cause:** the API shared the worker connection (`maxRetriesPerRequest: null`), so `queue.add()` waited forever for Redis instead of throwing. My `try/catch` and `503` handler could never run.
- **Fix:** separate connections. Workers retry forever. The API uses `enableOfflineQueue: false` and `maxRetriesPerRequest: 1`, so the enqueue fails immediately.
- **Result after fix:** 
| Redis down | 503, row marked System Error | 503 in 1.00 s | <recovery time after restart 1.29s> |
| Docker Desktop stopped | Not a separate case here: Redis runs in Docker, so this is identical to the Redis outage | Same 503 | n/a |
| Sandbox fails (nonexistent image, Redis up) | 3 attempts with 2.134 s / 4.197 s backoff, then System Error | 202 in 0.79 s | 6.331 s |
- **Known limitation:** if the API *starts* while Redis is down, the first enqueue waits until Redis is available. This is a deploy-order issue.

## Successfull Tests: tests executed to check if system is secure and protected

### Ranking Regression Test (`npm run test:unit`)
- **Regression test:** `tests/ranking.test.ts` (`npm run test:unit`): 3 of 3 passed, ~300 ms, on <17th November, 2026>. It covers: full coverage ranks above a tie on one generic skill, a missing requirement is penalised, and ties break deterministically.
- **Scope of this test:** it exercises only the pure aggregation and sorting function (`rankCandidates`) with hand-built inputs (the 0.71 / 0.35 / 0.80 similarities come from the real resume 9 vs 10 case). It does not exercise the SQL retrieval, which is where the original bug lived. The end-to-end check is re-running `GET /matches/<jobId>` on the 9-vs-10 pair and the Part C evaluation.

### Sandbox attack suite (`npm run test:sandbox`)
Run on <18th November, 2026>: **10 of 10 passed** on the first run (12.68s total, Vitest 5.0.4). 
Limits under test: 128 MB memory with no swap, 0.5 CPU, 50 PIDs, no network, read-only root filesystem and bind mount, all capabilities dropped, output capped at 10,000 chars.

|           Test            |            Expected             |Result|  Time   |
|    Normal program (sum)   |          ok, output `5`         | pass | 1193 ms |
|       Multi-line output   |     `a\nb` (CRLF normalised)    | pass | 815 ms  |
|       Crash (`1/0`)       | runtime_error, not wrong answer | pass | 337 ms  |
| Infinite loop (2 s limit) |             timeout             | pass | 2558 ms |
|         Memory bomb       |           memory_limit          | pass | 675 ms  |
|    Fork bomb (3 s limit)  |    not `ok`; worker survives    | pass | 2764 ms |
|       Network access      |           runtime_error         | pass | 886 ms  |
|       Filesystem write    |           runtime_error         | pass | 493 ms  |
|      Huge output (5 MB)   |        output ≤ 10,100 chars    | pass | 1125 ms |
| No containers left behind |                0                | pass |  46 ms  |

**Observations**
- Container start-up plus teardown costs roughly 300–800 ms per run. This is wall-clock overhead, not program runtime.
- The memory bomb died in 675 ms, long before any timeout, so the 128 MB cap does the work, not the timer.
- The fork bomb finished in 2764 ms, under its 3000 ms limit, so it did not end by timeout. The verdict was either `runtime_error` (fork refused by the PID limit) or `memory_limit`. <Record which, see check 2 below.>
- No test failed on the first run, so this run produced no new bug findings. The Phase 2 gaps this phase fixed (exit-code handling, CRLF, orphaned containers) were identified by reading the code, not by a failing test.

**Verification that the tests can fail**
- [Pass] Network: changed `NetworkMode` to `'bridge'`; the network test failed as expected. Restored.
- [Pass] Filesystem: removed `ReadonlyRootfs: true`; the filesystem test failed as expected. Restored.