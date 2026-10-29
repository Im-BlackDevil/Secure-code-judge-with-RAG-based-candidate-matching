# Results log

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