# Tests & Results log

## Environment
- Machine: <CPU model, cores, RAM>
- OS: Windows <11>, Docker Desktop <4.98.0> (WSL2 backend)
- Node v24.0.1, TypeScript 6.0.3 (pinned; TS 7 breaks ts-node), ts-node-dev 2.0.0
- Postgres: Supabase free tier via session pooler; Redis: `redis:latest` in Docker
- LLM: `gemini-3.5-flash`; embeddings: `gemini-embedding-2` (768 dims)

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