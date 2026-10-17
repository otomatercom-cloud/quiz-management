# -*- coding: utf-8 -*-
"""Server-side API consumed by the Next.js BFF through Odoo's JSON-2 external API (/json/2/otm.quiz.api/<method>).

The BFF authenticates with a dedicated service user (API key). Student / staff identity is verified HERE
(student_login / admin_login) and then carried by the BFF in a signed, httpOnly session. Every method re-validates
ownership / role on the server; admin methods execute with the acting user's own ACLs and record rules.
"""
import re
from datetime import timedelta

import logging
from odoo import api, fields, models
from odoo.exceptions import AccessDenied, AccessError, UserError

from .attempt import FINAL_STATES

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_logger = logging.getLogger(__name__)
G_ADMIN = "otm_quiz_management.group_otm_quiz_admin"
G_MANAGER = "otm_quiz_management.group_otm_quiz_manager"
G_EVAL = "otm_quiz_management.group_otm_quiz_evaluator"

ADMIN_MODELS = {
    "otm.quiz": G_MANAGER, "otm.quiz.question": G_MANAGER, "otm.quiz.question.option": G_MANAGER, "otm.quiz.question.pool": G_MANAGER,
    "otm.quiz.scholarship.rule": G_MANAGER, "otm.quiz.registration": G_MANAGER, "otm.quiz.tag": G_MANAGER,
    "otm.quiz.attempt": G_EVAL, "otm.quiz.attempt.answer": G_EVAL, "otm.quiz.audit.log": G_ADMIN,
}
ADMIN_WRITABLE = {"otm.quiz", "otm.quiz.question", "otm.quiz.question.pool", "otm.quiz.scholarship.rule",
                  "otm.quiz.tag"}
ADMIN_METHODS = {
    "otm.quiz": {"action_publish", "action_close", "action_cancel", "action_archive_quiz", "action_reset_draft",
                 "action_publish_results", "action_recalculate_scholarships"},
    "otm.quiz.question": {"action_archive_selected", "action_activate_selected"},
    "otm.quiz.registration": {"action_confirm", "action_cancel", "action_disqualify"},
    "otm.quiz.attempt": {"decide_scholarship", "override_scholarship"},
    "otm.quiz.attempt.answer": {"grade_descriptive"},
}


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def _page(page, limit, maxlimit=100):
    limit = max(1, min(int(limit or 20), maxlimit))
    page = max(1, int(page or 1))
    return (page - 1) * limit, limit


class OtmQuizApi(models.AbstractModel):
    _name = "otm.quiz.api"
    _description = "Quiz API (called by the Next.js server)"

    # ================================================================== helpers
    def _partner(self, partner_id):
        p = self.env["res.partner"].sudo().browse(int(partner_id or 0)).exists()
        if not p or not p.otm_is_quiz_student:
            raise AccessError("Unknown student.")
        return p

    def _quiz_by_public(self, public_id):
        q = self.env["otm.quiz"].sudo().search([("public_id", "=", public_id)], limit=1)
        if not q:
            raise UserError("Quiz not found.")
        return q

    def _attempt_for(self, partner, public_id):
        a = self.env["otm.quiz.attempt"].sudo().search([("public_id", "=", public_id)], limit=1)
        if not a or a.student_id != partner:
            raise AccessError("Attempt not found.")  # same message: no ownership oracle
        return a

    def _acting(self, acting_user_id, group):
        user = self.env["res.users"].sudo().browse(int(acting_user_id or 0)).exists()
        if not user or not user.active or user.share or not user.has_group(group):
            raise AccessError("Not allowed.")
        return self.env(user=user.id)

    def _quiz_card(self, q, partner=None):
        now = fields.Datetime.now()
        data = {
            "id": q.public_id, "slug": q.slug, "title": q.name, "code": q.code or "", "description": q.description or "",
            "subject": q.subject or "", "state": q.state, "duration_minutes": q.duration_minutes,
            "total_marks": q.total_marks, "question_total": q.question_total, "passing_percentage": q.passing_percentage,
            "maximum_attempts": q.maximum_attempts, "registration_required": q.registration_required,
            "registration_start": _iso(q.registration_start), "registration_end": _iso(q.registration_end),
            "quiz_start": _iso(q.quiz_start), "quiz_end": _iso(q.quiz_end),
            "registration_open": q._registration_open(now), "window_open": q._window_open(now),
            "scholarship_enabled": q.scholarship_enabled, "eligibility_notes": q.eligibility_notes or "",
            "negative_marking": q.negative_marking_enabled, "has_thumbnail": bool(q.thumbnail),
        }
        if partner:
            reg = self.env["otm.quiz.registration"].sudo().search(
                [("quiz_id", "=", q.id), ("student_id", "=", partner.id)], order="id desc", limit=1)
            atts = self.env["otm.quiz.attempt"].sudo().search(
                [("quiz_id", "=", q.id), ("student_id", "=", partner.id), ("state", "!=", "not_started")])
            running = atts.filtered(lambda a: a.state == "in_progress")
            data.update(
                registration_status=reg.state if reg else None,
                registration_id=reg.public_id if reg else None,
                attempts_used=len(atts - running) + len(running),
                active_attempt=running[:1].public_id or None,
                can_start=bool(q._window_open(now) and (len(atts) < q.maximum_attempts or running) and
                               (not q.registration_required or (reg and reg.state in ("registered", "confirmed")))),
            )
        return data

    # ================================================================== public
    @api.model
    def public_quizzes(self, search="", page=1, limit=12):
        offset, limit = _page(page, limit, 50)
        now = fields.Datetime.now()
        domain = [("state", "=", "published"), ("quiz_end", ">", now)]
        if search:
            domain.append(("name", "ilike", search))
        Quiz = self.env["otm.quiz"].sudo()
        return {"total": Quiz.search_count(domain),
                "items": [self._quiz_card(q) for q in Quiz.search(domain, order="quiz_start asc", offset=offset, limit=limit)]}

    @api.model
    def public_quiz(self, public_id):
        q = self._quiz_by_public(public_id)
        if q.state not in ("published", "closed"):
            raise UserError("Quiz not found.")
        card = self._quiz_card(q)
        card["instructions"] = q.instructions or ""
        card["scholarship_bands"] = [
            {"name": r.name, "min": r.minimum_percentage, "max": r.maximum_percentage or None,
             "type": r.scholarship_type, "value": r.scholarship_value, "must_pass": r.minimum_passing_required}
            for r in q.scholarship_rule_ids.filtered("active")] if q.scholarship_enabled else []
        return card

    @api.model
    def quiz_thumbnail(self, public_id):
        q = self._quiz_by_public(public_id)
        return q.thumbnail.decode() if q.thumbnail and q.state in ("published", "closed") else False

    # ================================================================== student identity
    @api.model
    def student_register(self, name, email, phone, password, student_code="", education=""):
        name, email = (name or "").strip(), (email or "").strip().lower()
        phone = re.sub(r"[^\d+]", "", phone or "")
        if len(name) < 2:
            raise UserError("Please enter your full name.")
        if not EMAIL_RE.match(email):
            raise UserError("Please enter a valid email address.")
        if not (7 <= len(phone.replace("+", "")) <= 15):
            raise UserError("Please enter a valid mobile number.")
        if len(password or "") < 8:
            raise UserError("Password must have at least 8 characters.")
        Users = self.env["res.users"].sudo()
        if Users.with_context(active_test=False).search_count([("login", "=", email)]):
            raise UserError("An account with this email already exists. Please sign in.")
        user = Users.with_context(no_reset_password=True).create({
            "name": name, "login": email, "email": email, "password": password,
            "group_ids": [(6, 0, [self.env.ref("base.group_portal").id])],
        })
        user.partner_id.write({"phone": phone, "otm_student_code": student_code or False,
                               "otm_education": education or False, "otm_is_quiz_student": True})
        return self._student_payload(user.partner_id)

    def _student_payload(self, p):
        return {"partner_id": p.id, "name": p.name, "email": p.email or "", "phone": p.phone or "",
                "student_code": p.otm_student_code or "", "education": p.otm_education or ""}

    def _check_password(self, user, password):
        try:
            user.with_user(user)._check_credentials({"type": "password", "password": password}, {"interactive": False})
        except AccessDenied:
            return False
        return True

    @api.model
    def student_forgot_password(self, email):
        """Send Odoo's standard reset mail to a quiz student. Always returns True (no account enumeration)."""
        user = self.env["res.users"].sudo().search([("login", "=", (email or "").strip().lower())], limit=1)
        if user and user.active and user.partner_id.otm_is_quiz_student:
            try:
                user.action_reset_password()
            except Exception:  # mail not configured etc. -> never reveal, just log
                _logger.warning("Password reset mail failed for a student account", exc_info=True)
        return True

    @api.model
    def student_login(self, login, password):
        user = self.env["res.users"].sudo().search([("login", "=", (login or "").strip().lower())], limit=1)
        if not user or not user.active or not user.partner_id.otm_is_quiz_student or not self._check_password(user, password or ""):
            raise AccessDenied("Invalid email or password.")
        return self._student_payload(user.partner_id)

    @api.model
    def student_profile(self, partner_id):
        return self._student_payload(self._partner(partner_id))

    @api.model
    def student_update_profile(self, partner_id, name, phone, student_code="", education=""):
        p = self._partner(partner_id)
        phone = re.sub(r"[^\d+]", "", phone or "")
        if len((name or "").strip()) < 2 or not (7 <= len(phone.replace("+", "")) <= 15):
            raise UserError("Please provide a valid name and mobile number.")
        p.write({"name": name.strip(), "phone": phone, "otm_student_code": student_code or False,
                 "otm_education": education or False})
        return self._student_payload(p)

    # ================================================================== student quizzes & registration
    @api.model
    def student_quizzes(self, partner_id, search="", page=1, limit=12):
        p = self._partner(partner_id)
        offset, limit = _page(page, limit, 50)
        domain = [("state", "=", "published"), ("quiz_end", ">", fields.Datetime.now())]
        if search:
            domain.append(("name", "ilike", search))
        Quiz = self.env["otm.quiz"].sudo()
        return {"total": Quiz.search_count(domain),
                "items": [self._quiz_card(q, p) for q in Quiz.search(domain, order="quiz_start asc", offset=offset, limit=limit)]}

    @api.model
    def register_quiz(self, partner_id, quiz_public_id):
        p = self._partner(partner_id)
        reg = self.env["otm.quiz.registration"].register(self._quiz_by_public(quiz_public_id), p)
        return self._reg_payload(reg)

    @api.model
    def cancel_registration(self, partner_id, registration_public_id):
        p = self._partner(partner_id)
        reg = self.env["otm.quiz.registration"].sudo().search(
            [("public_id", "=", registration_public_id), ("student_id", "=", p.id)], limit=1)
        if not reg:
            raise AccessError("Registration not found.")
        return self._reg_payload(reg.cancel_by_student())

    def _reg_payload(self, r):
        return {"id": r.public_id, "reference": r.reference, "state": r.state, "date": _iso(r.registration_date),
                "quiz": self._quiz_card(r.quiz_id)}

    @api.model
    def my_registrations(self, partner_id, page=1, limit=20):
        p = self._partner(partner_id)
        offset, limit = _page(page, limit)
        Reg = self.env["otm.quiz.registration"].sudo()
        domain = [("student_id", "=", p.id)]
        return {"total": Reg.search_count(domain),
                "items": [self._reg_payload(r) for r in Reg.search(domain, offset=offset, limit=limit)]}

    # ================================================================== attempts
    @api.model
    def start_attempt(self, partner_id, quiz_public_id):
        p = self._partner(partner_id)
        att = self.env["otm.quiz.attempt"].start_for(self._quiz_by_public(quiz_public_id), p)
        return {"attempt_id": att.public_id}

    def _attempt_payload(self, att):
        quiz = att.quiz_id
        return {
            "id": att.public_id, "state": att.state, "attempt_number": att.attempt_number,
            "quiz": {"id": quiz.public_id, "title": quiz.name, "instructions": quiz.instructions or "",
                     "duration_minutes": quiz.duration_minutes},
            "started_at": _iso(att.started_at), "deadline_at": _iso(att.deadline_at),
            "server_now": _iso(fields.Datetime.now()), "total_marks": att.total_marks,
            "questions": [{
                "seq": a.sequence, "type": a.question_type, "text": a.snapshot["text"], "marks": a.marks_available,
                "options": [{"id": o["id"], "text": o["text"]} for o in a.snapshot["options"]],  # NO correctness flag
                "selected": a.selected_option_ids or [], "text_answer": a.textual_answer or "",
                "marked": a.marked_for_review,
            } for a in att.answer_ids.sorted("sequence")],
        }

    @api.model
    def get_attempt(self, partner_id, attempt_public_id):
        p = self._partner(partner_id)
        att = self._attempt_for(p, attempt_public_id)
        if att.state == "in_progress" and fields.Datetime.now() > att.deadline_at + timedelta(seconds=att.quiz_id.grace_seconds):
            att.submit()  # time is over: finalise server-side
        if att.state != "in_progress":
            return {"id": att.public_id, "state": att.state, "finished": True}
        return self._attempt_payload(att)

    @api.model
    def save_answer(self, partner_id, attempt_public_id, seq, option_ids=None, text=None, marked=None):
        p = self._partner(partner_id)
        att = self._attempt_for(p, attempt_public_id)
        att.save_answer(p, int(seq), option_ids, text, marked)
        return {"saved": True, "server_now": _iso(fields.Datetime.now())}

    @api.model
    def submit_attempt(self, partner_id, attempt_public_id):
        p = self._partner(partner_id)
        att = self._attempt_for(p, attempt_public_id)
        att.submit_by_student(p)
        return self._receipt(att)

    def _receipt(self, att):
        vis = att.state in FINAL_STATES and (att.quiz_id.show_results_immediately or att.quiz_id.results_published)
        return {"id": att.public_id, "reference": att.reference, "state": att.state,
                "submitted_at": _iso(att.submitted_at), "late": att.late_submission,
                "result_visible": bool(vis), "quiz_title": att.quiz_id.name}

    # ================================================================== results
    def _result_visible(self, att):
        q = att.quiz_id
        return att.state in FINAL_STATES and (q.show_results_immediately or q.results_published)

    def _result_row(self, att):
        row = {"id": att.public_id, "reference": att.reference, "quiz_title": att.quiz_id.name,
               "attempt_number": att.attempt_number, "state": att.state, "submitted_at": _iso(att.submitted_at),
               "visible": bool(self._result_visible(att))}
        if row["visible"]:
            row.update(total_marks=att.total_marks, marks_obtained=att.marks_obtained, percentage=att.percentage,
                       result_status=att.result_status, scholarship_status=att.scholarship_status,
                       scholarship_type=att.scholarship_type, scholarship_value=att.scholarship_value,
                       scholarship_amount=att.scholarship_amount)
        return row

    @api.model
    def my_results(self, partner_id, page=1, limit=20):
        p = self._partner(partner_id)
        offset, limit = _page(page, limit)
        Att = self.env["otm.quiz.attempt"].sudo()
        domain = [("student_id", "=", p.id), ("state", "in", FINAL_STATES)]
        return {"total": Att.search_count(domain),
                "items": [self._result_row(a) for a in Att.search(domain, offset=offset, limit=limit)]}

    @api.model
    def result_detail(self, partner_id, attempt_public_id):
        p = self._partner(partner_id)
        att = self._attempt_for(p, attempt_public_id)
        row = self._result_row(att)
        if not row["visible"]:
            return row
        row["scholarship_explanation"] = att.scholarship_explanation or ""
        row["time_taken_seconds"] = att.time_taken_seconds
        row["passing_percentage"] = att.passing_percentage_snapshot
        if att.quiz_id.show_correct_answers_after_submission:
            row["review"] = [{
                "seq": a.sequence, "text": a.snapshot["text"], "marks_available": a.marks_available,
                "marks_awarded": a.marks_awarded, "is_correct": a.is_correct, "selected": a.selected_option_ids or [],
                "options": a.snapshot["options"], "explanation": a.snapshot.get("explanation", ""),
            } for a in att.answer_ids.sorted("sequence")]
        return row

    @api.model
    def my_scholarships(self, partner_id):
        p = self._partner(partner_id)
        atts = self.env["otm.quiz.attempt"].sudo().search(
            [("student_id", "=", p.id), ("state", "in", FINAL_STATES),
             ("scholarship_status", "in", ("eligible", "approved", "rejected"))])
        return [self._result_row(a) for a in atts if self._result_visible(a)]

    @api.model
    def student_dashboard(self, partner_id):
        p = self._partner(partner_id)
        now = fields.Datetime.now()
        Quiz = self.env["otm.quiz"].sudo()
        available = Quiz.search([("state", "=", "published"), ("quiz_end", ">", now)], order="quiz_start asc", limit=6)
        regs = self.env["otm.quiz.registration"].sudo().search(
            [("student_id", "=", p.id), ("state", "in", ("registered", "confirmed")), ("quiz_id.quiz_end", ">", now)],
            limit=10)
        running = self.env["otm.quiz.attempt"].sudo().search(
            [("student_id", "=", p.id), ("state", "=", "in_progress")], limit=1)
        recent = self.env["otm.quiz.attempt"].sudo().search(
            [("student_id", "=", p.id), ("state", "in", FINAL_STATES)], limit=5)
        return {
            "student": self._student_payload(p),
            "available": [self._quiz_card(q, p) for q in available],
            "registered": [self._reg_payload(r) for r in regs],
            "deadlines": [{"quiz": r.quiz_id.name, "registration_end": _iso(r.quiz_id.registration_end)} for r in regs],
            "active_attempt": {"id": running.public_id, "quiz_title": running.quiz_id.name,
                               "deadline_at": _iso(running.deadline_at)} if running else None,
            "recent_results": [self._result_row(a) for a in recent],
            "scholarships": self.my_scholarships(partner_id),
        }

    # ================================================================== staff (admin portal)
    @api.model
    def admin_login(self, login, password):
        user = self.env["res.users"].sudo().search([("login", "=", (login or "").strip())], limit=1)
        if not user or not user.active or user.share or not self._check_password(user, password or ""):
            raise AccessDenied("Invalid credentials.")
        roles = [r for r, g in (("admin", G_ADMIN), ("manager", G_MANAGER), ("evaluator", G_EVAL)) if user.has_group(g)]
        if not roles:
            raise AccessDenied("This account has no quiz role.")
        return {"user_id": user.id, "name": user.name, "roles": roles}

    def _admin_check(self, acting_user_id, model):
        if model not in ADMIN_MODELS:
            raise AccessError("Model not available.")
        return self._acting(acting_user_id, ADMIN_MODELS[model])

    @api.model
    def admin_search_read(self, acting_user_id, model, domain=None, fields=None, offset=0, limit=20, order=None):
        env = self._admin_check(acting_user_id, model)
        Model = env[model]
        limit = max(1, min(int(limit or 20), 200))
        return {"total": Model.search_count(domain or []),
                "records": Model.search_read(domain or [], fields or ["id"], offset=int(offset or 0), limit=limit, order=order)}

    @api.model
    def admin_create(self, acting_user_id, model, vals):
        if model not in ADMIN_WRITABLE:
            raise AccessError("Model is read-only.")
        return self._admin_check(acting_user_id, model)[model].create(vals).id

    @api.model
    def admin_write(self, acting_user_id, model, ids, vals):
        if model not in ADMIN_WRITABLE:
            raise AccessError("Model is read-only.")
        self._admin_check(acting_user_id, model)[model].browse(ids).write(vals)
        return True

    @api.model
    def admin_delete(self, acting_user_id, model, ids):
        if model not in ADMIN_WRITABLE:
            raise AccessError("Model is read-only.")
        self._admin_check(acting_user_id, model)[model].browse(ids).unlink()
        return True

    @api.model
    def admin_call(self, acting_user_id, model, ids, method, args=None, kwargs=None):
        if method not in ADMIN_METHODS.get(model, ()):
            raise AccessError("Action not allowed.")
        env = self._admin_check(acting_user_id, model)
        getattr(env[model].browse(ids), method)(*(args or []), **(kwargs or {}))
        return True

    @api.model
    def admin_import(self, acting_user_id, filename, content_b64, mode="validate", allow_duplicates=False):
        env = self._acting(acting_user_id, G_MANAGER)
        return env["otm.quiz.import.wizard"].api_run(filename, content_b64, mode, allow_duplicates)

    @api.model
    def admin_import_template(self, acting_user_id):
        env = self._acting(acting_user_id, G_MANAGER)
        return env["otm.quiz.import.wizard"].template_csv()

    @api.model
    def admin_export_questions(self, acting_user_id, include_answers=False, domain=None):
        env = self._acting(acting_user_id, G_ADMIN if include_answers else G_MANAGER)
        return env["otm.quiz.import.wizard"].export_csv(include_answers, domain or [])

    @api.model
    def admin_dashboard(self, acting_user_id):
        env = self._acting(acting_user_id, G_MANAGER)
        Quiz, Att, Reg = env["otm.quiz"], env["otm.quiz.attempt"], env["otm.quiz.registration"]
        now = fields.Datetime.now()
        done = Att.search_count([("state", "in", FINAL_STATES)])
        passed = Att.search_count([("result_status", "=", "pass")])
        graded = Att.search_count([("result_status", "in", ("pass", "fail"))])
        since = now - timedelta(days=14)
        trend = Att._read_group([("submitted_at", ">=", since)], ["submitted_at:day"], ["__count"])
        return {
            "cards": {
                "total_quizzes": Quiz.search_count([]), "published_quizzes": Quiz.search_count([("state", "=", "published")]),
                "total_questions": env["otm.quiz.question"].search_count([]),
                "registered_students": len(set(Reg.search([("state", "in", ("registered", "confirmed"))]).mapped("student_id").ids)),
                "active_attempts": Att.search_count([("state", "=", "in_progress")]), "completed_attempts": done,
                "pass_rate": round(passed * 100.0 / graded, 2) if graded else None,
                "scholarship_eligible": Att.search_count([("scholarship_status", "in", ("eligible", "approved"))]),
            },
            "recent_quizzes": Quiz.search_read([], ["name", "state", "public_id", "quiz_start"], limit=5, order="id desc"),
            "upcoming": Quiz.search_read([("state", "=", "published"), ("quiz_start", ">", now)],
                                         ["name", "public_id", "quiz_start"], limit=5, order="quiz_start asc"),
            "recent_registrations": Reg.search_read([], ["reference", "student_id", "quiz_id", "state", "registration_date"],
                                                    limit=6, order="id desc"),
            "completion_trend": [{"day": d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d), "count": c}
                                 for d, c in trend],
        }

    @api.model
    def admin_reports(self, acting_user_id, quiz_public_id):
        env = self._acting(acting_user_id, G_MANAGER)
        quiz = env["otm.quiz"].search([("public_id", "=", quiz_public_id)], limit=1)
        if not quiz:
            raise UserError("Quiz not found.")
        Att = env["otm.quiz.attempt"]
        atts = Att.search([("quiz_id", "=", quiz.id), ("state", "in", FINAL_STATES), ("result_status", "!=", "pending")])
        buckets = [0] * 10
        for a in atts:
            buckets[min(int(a.percentage // 10), 9)] += 1
        # ranking: best attempt per student, marks desc, time asc, then earliest submission; ties share a rank
        best = {}
        for a in atts:
            cur = best.get(a.student_id.id)
            key = (-a.marks_obtained, a.time_taken_seconds, a.submitted_at, a.id)
            if cur is None or key < cur[0]:
                best[a.student_id.id] = (key, a)
        ordered = sorted(best.values(), key=lambda x: x[0])
        ranking, rank, last = [], 0, None
        for i, (key, a) in enumerate(ordered, start=1):
            tie_key = (key[0], key[1])
            if tie_key != last:
                rank, last = i, tie_key
            ranking.append({"rank": rank, "student": a.student_id.name, "marks": a.marks_obtained,
                            "percentage": a.percentage, "time_seconds": a.time_taken_seconds,
                            "result": a.result_status, "attempt": a.reference})
        subj = env["otm.quiz.attempt.answer"]._read_group(
            [("attempt_id", "in", atts.ids), ("question_type", "!=", "descriptive")],
            ["subject", "is_correct"], ["__count"])
        subject_perf = {}
        for s, ok, c in subj:
            d = subject_perf.setdefault(s or "General", {"correct": 0, "wrong": 0})
            d["correct" if ok else "wrong"] += c
        return {
            "quiz": {"id": quiz.public_id, "title": quiz.name},
            "registrations": quiz.registration_count, "confirmed": quiz.confirmed_count, "cancelled": quiz.cancelled_count,
            "started": quiz.started_count, "completed": quiz.completed_count, "passed": quiz.passed_count,
            "failed": quiz.failed_count,
            "pass_rate": round(quiz.passed_count * 100.0 / (quiz.passed_count + quiz.failed_count), 2)
            if (quiz.passed_count + quiz.failed_count) else None,
            "average_percentage": round(sum(atts.mapped("percentage")) / len(atts), 2) if atts else None,
            "score_distribution": [{"range": "%d-%d" % (i * 10, i * 10 + 10), "count": c} for i, c in enumerate(buckets)],
            "subject_performance": [{"subject": k, **v} for k, v in subject_perf.items()],
            "ranking": ranking[:200],
        }
