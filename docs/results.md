# Tests & Results log

## Phase 4 - Step 7: Resume route hardening

- Build: `npm run build` passed.
- Invalid resume ID: HTTP 400 with `Invalid id`.
- Ownership: owner access succeeded; cross-student access returned 404.
- Non-PDF upload (`q2.asm`): HTTP 400, `Only PDF files are allowed`.
- Fake PDF: parser rejected the disguised text file with `Could not read PDF`.
- Oversized upload (6 MB): HTTP 400, `File too large`.
- Genuine PDF: HTTP 202; resume ID 11, student ID 3,
  initial status `pending`.

Bug found: invalid uploads initially returned HTTP 500 even
when the application correctly rejected the file.

Fix: validation errors now receive suitable 4xx statuses,
and PDF parsing failures return HTTP 400.

## Phase 4 - Step 8: Sandbox v2 and Worker v2

- Docker Python 3.11 image pulled successfully.
- Execution worker v2 started successfully.
- Sum-of-two-numbers happy path: Accepted.
- Submission ID 11: Accepted, execution_ms 657.
- GET /submissions/11: HTTP 200, persisted verdict verified.
- Resume worker v2 started successfully.
- Resume ID 13: Genuine PDF processed successfully.
- GET /resumes/13: HTTP 200, status ready.
- Parsed skills successfully extracted and persisted.

Result: Execution and resume worker happy paths verified.