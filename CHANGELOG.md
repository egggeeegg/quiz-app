# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Question banks (`question_banks`) with a default bank created by an idempotent, versioned migration; existing questions are moved into it automatically.
- Admin question-bank import: JSON / CSV / XLSX parsing, normalisation, per-row validation, dry-run preview, downloadable error CSV, and `append` / `upsert` / `replace` modes.
- Import batches with per-question before/after snapshots and transactional rollback. `replace` archives old questions instead of deleting them, so exam history keeps its references.
- Admin API under `/api/admin` and a “题库管理” page with bank cards, upload wizard, history and rollback.
- Bank-scoped paper generation (`bank_ids`) and bank-scoped question counts; public `/api/banks` list.
- Exam sessions now snapshot each question's type and answer at generation time, so imports or edits during an exam cannot change grading.

### Changed

- Database migrations are versioned (`schema_migrations`) and take a one-off backup before applying.
- `questions` gained `bank_id`, `external_id`, `status`, `content_hash`, `analysis` and `updated_at`.

## [1.0.0] - 2026-10-21

First public release.

### Added

- Server-side exam sessions: `POST /api/exams/generate` returns `{ questions, sessionId }`; `POST /api/exams/submit` requires `session_id` and grades against database answers. Sessions are user-bound, expire after 6 hours, and can be submitted once.
- `backend/test/smoke.mjs` covering auth, answer isolation, paper generation, grading, replay rejection, mistake updates, device bans, and user deletion.
- GitHub Actions CI for backend tests and frontend build.
- MIT license, contribution guide, security policy, issue and pull request templates.
- `questions.demo.json`: 90 self-authored demo questions (60 single choice, 10 multiple choice, 20 true/false).

### Changed

- `GET /api/questions` no longer returns the `answer` field to non-admin users.
- Admin bootstrap uses `ADMIN_USERNAME` / `ADMIN_PASSWORD` or a random password printed once, instead of a hardcoded default account.
- `JWT_SECRET` is mandatory and validated at startup.
- Database writes are coalesced and never persisted mid-transaction.
- Frontend no longer performs client-side grading as a fallback.
- Docker Compose refuses to start without a real `JWT_SECRET`.

### Fixed

- Device bans were bypassed on login.
- Registration crashed when a device id header was present.
- Wrong answers in the mistake book were never refreshed after a repeat mistake.
- Smart papers filled missing slots with "no question" placeholders instead of real questions.
- Templates escaped question text twice, displaying `&lt;` instead of `<`.
- `index.html` was served with a one-year immutable cache header.
- `device_id` was wiped on logout and on 401, defeating device bans.
- Deleted users could keep using their existing JWT.
- Invite codes could be used after being disabled.
