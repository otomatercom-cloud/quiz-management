# Odoo 19 Quiz & Scholarship Management

* `odoo-addons/otm_quiz_management` – Odoo 19 CE addon (all business logic, security, audit).
* `frontend` – Next.js (App Router, TypeScript, Tailwind) public/student/admin portal. It only talks to Odoo through a server-side JSON-2 client; the browser never sees Odoo or the DB.

## Architecture
Browser → Next.js route handlers (BFF, signed httpOnly cookies) → Odoo JSON-2 `/json/2/otm.quiz.api/<method>` (service user, Bearer API key) → PostgreSQL.
Student/staff identity is verified by `student_login` / `admin_login`; admin calls run as the acting Odoo user so Odoo ACLs and record rules apply.

## Install – Odoo
1. Copy `odoo-addons/otm_quiz_management` to your addons path; optional: `pip install openpyxl` for XLSX import/export.
2. `odoo-bin -d <db> -i otm_quiz_management` (add `--test-enable --test-tags=/otm_quiz_management` to run the 39 tests).
3. Create a user in group **Quiz API Service** (internal user); in its Preferences → Account Security create an API key. Create staff users in the Quiz Admin / Manager / Evaluator groups.
4. Ensure outgoing mail is configured (registration/password-reset mails).

## Install – Frontend
```
cd frontend && cp .env.example .env.local   # fill ODOO_BASE_URL, ODOO_DATABASE, ODOO_USERNAME, ODOO_API_KEY, SESSION_SECRET (>=32 random chars), NEXT_PUBLIC_APP_URL
npm ci && npm run build && npm start   # serves on port 3007
```
Tests: `npm test`, `npx tsc --noEmit`.

## Deployment notes
* Put Odoo and Next.js behind an HTTPS reverse proxy (nginx/Caddy). Odoo's `/json/2` need not be public – only reachable from the Next.js server.
* `proxy_mode = True` in odoo.conf when behind the proxy; set `db_filter`, `list_db = False`.
* Back up PostgreSQL + filestore before upgrades; upgrade addon with `-u otm_quiz_management`. Rollback = restore backup.
* The in-memory rate limiter is per-process; use a shared store (Redis) or proxy-level limits when running several instances.
* Cron "Quiz: auto-submit expired attempts" must be active (default).

## Scoring rules
Percentage rounded half-up to 2 decimals; pass when `>=` threshold; unanswered = 0; negative marks only for wrong answers (optional zero floor); answers evaluated against snapshots taken at attempt start; submissions after deadline+grace become `expired` and only in-time saved answers count; submit is idempotent. Scholarship: lowest priority number wins among overlapping rules; "eligible" ≠ "approved" (manager approval, admin override needs justification, all audited).

## Known limitations
* Descriptive questions need manual grading (attempt stays `submitted` until graded).
* Direct single-option writes bypass option validation (use the question form/import).
* Rate limiter is single-process. Admin quiz page shows details/workflow; deep structure edits of an existing draft are done in the Odoo back-office.
* Frontend end-to-end (browser) tests were not run; only unit tests (vitest) and type-check/build.

## Troubleshooting
* 401/AccessDenied from API → wrong `ODOO_API_KEY`/user not in *Quiz API Service*.
* "Database not found" → set `ODOO_DATABASE` / `X-Odoo-Database`.
* Publish blocked → open the quiz; the red box lists exactly what to fix.

## Bridge module `otm_quiz_bridge` (optional)
Depends on `otm_quiz_management`, `student_details_19`, `custom_leads_19`.
* **Assign to quiz** – Student Management: select students (list) or batches → Action → *Assign to Quiz* / *Assign Batch to Quiz*; or Quiz form → *Assign Students / Batches*. Students are approved immediately; a portal login is created from the student email if missing (setup link emailed). Students without a valid email are reported and skipped. Open quizzes (no registration) cannot be assigned.
* **Convert to leads** – Quizzes → Registrations: select rows → Action → *Convert to Leads*, or Quiz form → *Convert Registrations to Leads* (all, optionally only attempted). Duplicates (same last-10-digit phone) are linked, not recreated; a registration converts once. Result summary lists failures.
* Install: copy next to the other addons, `-i otm_quiz_bridge` (restart Odoo before installing/upgrading after adding files).

## Teachers (question authors)
Odoo group **Teacher (question author)**. Teachers sign in at the same staff login and see only *My questions*, *Add question* and *Import questions*. They can add/edit/import/export/archive **only their own** questions (record rule on author); they cannot create quizzes or see students, attempts or other teachers' questions. Administrators add or deactivate teachers in the frontend: **Teachers** (creates the Odoo login and emails a password-setup link, or sets the password you type). Managers/admins see all questions with an Author column. Questions are usable in quizzes immediately; review them in the Question bank before publishing a quiz.

## Frontend admin feature map
Quizzes: create wizard, edit, publish/close/cancel/archive/reset/publish results/recalculate scholarships, delete draft · Question bank: filters, bulk archive/restore/delete, tags, image, MCQ/True-False/Descriptive · Import/export (CSV/XLSX, validate → import, error report, template, answer-key export for admins) · Registrations (approve/reject/disqualify) · Attempts with answer review and manual grading of descriptive answers · Results · Scholarships (approve/reject/override) · Reports · Teachers · Audit log. Assigning student batches to a quiz and converting registrations to leads are Odoo-side (module `otm_quiz_bridge`).

## Rooms, XP and avatars (student community UI)
* **Rooms** (`otm.quiz.room`): class room (10th Standard) with subject rooms inside (Maths ...). Access mode: open / approval / invite only. Joining the class room opens its subject rooms. Create and manage them in the frontend at `/admin/rooms` (managers; teachers can post announcements in rooms they moderate) or in Odoo > Quizzes > Rooms.
* **Room-restricted quizzes**: put a quiz in a room (room form > Quizzes). Only members can see, register for and start it; it disappears from the public list. Quizzes with no room behave as before.
* **XP** (`otm.quiz.xp.log`): one row per student and quiz, best attempt only. XP = round(percentage x 2) + 20 for a pass (max 220); late/expired attempts earn nothing. Level = 1 + XP // 200. Badges (First Quiz, 100% Score, 5-day Streak, 10 Quizzes, 1,000 XP) and the streak are computed on demand. Weekly leaderboard = XP earned in the last 7 days from the room's quizzes.
* **Privacy (students are minors)**: other students only ever see nickname + character, never real name, phone or photo. A photo needs the parent/guardian consent tick, is resized to 256 px in the browser, and is served only to its owner (`/api/student-photo`). Teachers/staff can see photos in Odoo (Student form).
* Student UI: `/student/dashboard` (Home), `/student/rooms`, `/student/rooms/<id>`, `/student/stats`, `/student/profile` (character / photo picker). Mobile gets a bottom nav, desktop a top nav.
* Not included yet: comments/chat, live challenge mode, auto-add of a student batch to a room (bridge module), staff view of student photos in the frontend.

### Deploy script (Odoo module update, then frontend)
See `deploy/deploy_rooms.sh`. The `elysians` service is stopped before the module update and started after it.

## Public Phase 1: guest quizzes, email OTP, CAPTCHA, rate limits

- **Guest quizzes**: on an *Open* quiz, tick "Also allow guests" in the wizard (or the Odoo form). Visitors enter name + phone (email optional) and start at once. Guests earn no XP or scholarship, cannot join rooms and see only their own result. Attempt limits count per person (phone/email) across guest sessions. Not allowed on room quizzes.
- **Email OTP** (registration and guests): Settings > Technical > System Parameters, `otm_quiz.require_email_otp` = `1`. Needs a working outgoing mail server. Codes: 6 digits, 10 min, 60 s resend wait, 5 codes/hour/email, locked after 5 wrong guesses; only a hash is stored.
- **Turnstile**: set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in `frontend/.env`, then rebuild (the site key is baked at build). Applies to register, OTP, guest start and forgot-password. Unset = off.
- **Rate limits**: BFF per IP, per email (OTP) and per phone (guest); add `deploy/nginx_ratelimit.conf` at nginx too. The in-app limiter is per process; nginx covers restarts and multiple instances.
- **Deploy**: `deploy/deploy_public.sh` (stops `elysians`, `-u otm_quiz_management`, starts `elysians`, rebuilds, pm2 restart).
- Tests: 52 Odoo tests and 24 frontend unit tests pass locally. Not covered by tests: real Cloudflare calls, real mail delivery, and the production separate-cursor path.
