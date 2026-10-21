# Contributing

Thanks for taking the time to improve Quiz App.

## Development setup

```bash
cd backend
cp ../.env.example .env
npm ci
npm run seed
npm run dev          # http://localhost:3001

cd ../frontend
npm ci
npm run dev          # http://localhost:5173
```

The backend needs a `JWT_SECRET` of at least 24 characters. Without `questions.json` the seed script falls back to `questions.demo.json`.

## Before opening a pull request

```bash
cd backend && npm test
cd ../frontend && npm run build
```

Both commands must pass. The backend test boots a real HTTP server against a temporary database, so it also catches routing and middleware regressions.

## Rules that keep the project safe

- **Never send answers to the client.** `GET /api/questions` and `POST /api/exams/generate` must not include `answer`.
- **Grade on the server.** `submitExam` resolves question ids from the server-side session and reads answers from the database.
- **Do not commit private data.** `.env`, `*.db`, `questions.json`, `*.docx` and `更新文件/` are gitignored; keep it that way.
- **Keep service boundaries.** Routes validate input and shape responses; business logic belongs in `src/services`.
- **Prefer small, focused changes.** One concern per pull request.

## Commit messages

Conventional Commits are preferred:

```
feat: add exam scheduling
fix: reject replayed exam sessions
docs: clarify JWT_SECRET requirement
test: cover device ban on login
```

## Reporting bugs

Open an issue with the bug report template. Include the deployment mode, the exact error text, and a minimal reproduction. Do not paste real exam content or credentials.

## Security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## Good first issues

- Add integration tests for invite code expiry.
- Add a question import CLI that validates option/answer consistency.
- Improve mobile layout of the answer card.
- Add English translations for the UI.
