# Security Policy

## Supported versions

Only the latest commit on `main` receives security fixes.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting (Security → Advisories → Report a vulnerability) instead of a public issue. Include:

- affected endpoint or file
- reproduction steps
- impact (data leak, privilege escalation, grading bypass, etc.)
- suggested fix if you have one

You will get an acknowledgement as soon as possible. Please allow time for a fix before public disclosure.

## Security model

| Area | Design |
|---|---|
| Grading | Server-side only. Answers are never returned to ordinary clients; the paper is identified by a server-issued `sessionId` bound to the user, with a 6-hour TTL and single submission. |
| Authentication | JWT (7 days) with a `jti` value stored on the user row, so a new login invalidates older tokens. A deleted or kicked user is rejected on every request. |
| Passwords | bcrypt with a per-password salt. Plaintext is never stored. |
| Secrets | `JWT_SECRET` must be at least 24 characters; the process refuses to start with an empty, short or placeholder secret. |
| Registration | Invite-code only. Disabled or exhausted codes are rejected. |
| Device bans | Keyed on a client-generated `X-Device-Id` that survives logout. This is a deterrent, not a security boundary: a user who clears storage gets a new id. Do not rely on it as the only anti-abuse control. |
| Persistence | sql.js keeps the database in memory and writes a snapshot on a debounced interval, on commit, and on shutdown. |

## Known limitations

- Exam sessions live in process memory. Restarting the backend invalidates unsubmitted papers and logs everyone out of an in-progress exam.
- There is no rate limiting on login or registration; put the service behind a reverse proxy with limits if it is internet-facing.
- The bundled `questions.demo.json` is sample content. Operators are responsible for the licensing of any question bank they import.
