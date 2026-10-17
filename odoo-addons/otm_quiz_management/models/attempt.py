# -*- coding: utf-8 -*-
import random
from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError
from odoo.tools import float_compare, float_round

from .quiz import new_public_id

FINAL_STATES = ("submitted", "evaluated", "expired")
PCT_DIGITS = 2  # rounding policy: percentage rounded half-up to 2 decimals; all thresholds use that value


def to_pct(marks, total):
    if total <= 0:
        return 0.0
    return float_round(marks * 100.0 / total, precision_digits=PCT_DIGITS, rounding_method="HALF-UP")


class OtmQuizAttempt(models.Model):
    _name = "otm.quiz.attempt"
    _description = "Quiz Attempt"
    _order = "id desc"
    _rec_name = "reference"

    reference = fields.Char(readonly=True, copy=False, default="New", index=True)
    public_id = fields.Char(readonly=True, copy=False, index=True, default=lambda s: new_public_id())
    quiz_id = fields.Many2one("otm.quiz", required=True, ondelete="restrict", index=True)
    registration_id = fields.Many2one("otm.quiz.registration", ondelete="restrict", index=True)
    student_id = fields.Many2one("res.partner", string="Student", required=True, ondelete="restrict", index=True)
    started_at = fields.Datetime(readonly=True)
    deadline_at = fields.Datetime(readonly=True)
    submitted_at = fields.Datetime(readonly=True)
    state = fields.Selection(
        [("not_started", "Not Started"), ("in_progress", "In Progress"), ("submitted", "Submitted (pending review)"),
         ("evaluated", "Evaluated"), ("expired", "Expired (auto-submitted)")],
        default="not_started", required=True, index=True)
    attempt_number = fields.Integer(readonly=True)
    late_submission = fields.Boolean(readonly=True)
    total_marks = fields.Float(readonly=True)
    marks_obtained = fields.Float(readonly=True)
    percentage = fields.Float(readonly=True, digits=(16, 2))
    passing_percentage_snapshot = fields.Float(readonly=True)
    result_status = fields.Selection(
        [("pending", "Pending"), ("pass", "Pass"), ("fail", "Fail")], default="pending", index=True, readonly=True)
    time_taken_seconds = fields.Integer(readonly=True)
    answer_ids = fields.One2many("otm.quiz.attempt.answer", "attempt_id")
    # scholarship
    scholarship_status = fields.Selection(
        [("pending", "Pending"), ("not_applicable", "Not applicable"), ("not_eligible", "Not eligible"),
         ("eligible", "Eligible"), ("approved", "Approved"), ("rejected", "Rejected")],
        default="pending", index=True, readonly=True)
    scholarship_rule_id = fields.Many2one("otm.quiz.scholarship.rule", readonly=True, ondelete="set null")
    scholarship_type = fields.Selection(
        [("percentage", "Fee waiver (%)"), ("fixed_amount", "Fixed amount")], readonly=True)
    scholarship_value = fields.Float(readonly=True)
    scholarship_amount = fields.Float(readonly=True)
    scholarship_explanation = fields.Text(readonly=True)
    scholarship_overridden = fields.Boolean(readonly=True)

    _quiz_student_number_uniq = models.Constraint(
        "unique(quiz_id, student_id, attempt_number)", "Attempt number must be unique per student and quiz.")

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("reference", "New") == "New":
                vals["reference"] = self.env["ir.sequence"].sudo().next_by_code("otm.quiz.attempt") or "New"
        return super().create(vals_list)

    # ------------------------------------------------------------------ locking
    def _lock(self):
        self.ensure_one()
        self.flush_recordset()  # flush ALL pending writes before raw SQL (see Odoo 19 notes #7/#70)
        self.env.cr.execute("SELECT id FROM otm_quiz_attempt WHERE id = %s FOR UPDATE", [self.id])
        self.invalidate_recordset()

    # ------------------------------------------------------------------ start
    @api.model
    def start_for(self, quiz, partner):
        """Start (or resume) an attempt. All rules are enforced server-side."""
        quiz.ensure_one()
        now = fields.Datetime.now()
        registration = False
        if quiz.registration_required:
            registration = self.env["otm.quiz.registration"].sudo().search(
                [("quiz_id", "=", quiz.id), ("student_id", "=", partner.id),
                 ("state", "in", ("registered", "confirmed"))], limit=1)
            if not registration:
                raise UserError("You are not registered for this quiz.")
            if registration.eligibility_status != "eligible":
                raise UserError("You are not eligible for this quiz.")
            registration.flush_recordset()
            self.env.cr.execute("SELECT id FROM otm_quiz_registration WHERE id = %s FOR UPDATE", [registration.id])
        else:
            quiz.flush_recordset()
            self.env.cr.execute("SELECT id FROM otm_quiz WHERE id = %s FOR UPDATE", [quiz.id])
        # resume an in-progress attempt (idempotent start / refresh / network retry)
        running = self.sudo().search([("quiz_id", "=", quiz.id), ("student_id", "=", partner.id),
                                      ("state", "=", "in_progress")], limit=1)
        if running:
            if now <= running.deadline_at + timedelta(seconds=quiz.grace_seconds):
                return running
            running._finalize(late=True)
        if not quiz._window_open(now):
            raise UserError("This quiz is not open right now.")
        done = self.sudo().search_count([("quiz_id", "=", quiz.id), ("student_id", "=", partner.id),
                                         ("state", "!=", "not_started")])
        if done >= quiz.maximum_attempts:
            raise UserError("Maximum number of attempts reached.")
        picked = quiz._build_question_set()
        deadline = min(now + timedelta(minutes=quiz.duration_minutes), quiz.quiz_end)
        attempt = self.sudo().create({
            "quiz_id": quiz.id, "student_id": partner.id,
            "registration_id": registration.id if registration else False,
            "started_at": now, "deadline_at": deadline, "state": "in_progress", "attempt_number": done + 1,
            "passing_percentage_snapshot": quiz.passing_percentage,
        })
        rng = random.SystemRandom()
        answers = []
        total = 0.0
        for seq, (question, marks) in enumerate(picked, start=1):
            snap = question.snapshot()
            if quiz.randomize_options and snap["type"] == "mcq":
                rng.shuffle(snap["options"])
            total += marks
            answers.append({
                "attempt_id": attempt.id, "sequence": seq, "question_id": question.id, "snapshot": snap,
                "question_type": snap["type"], "subject": snap["subject"], "topic": snap["topic"],
                "marks_available": marks, "negative_marks": quiz._effective_negative(question),
                "review_status": "pending" if snap["type"] == "descriptive" else "not_required",
            })
        self.env["otm.quiz.attempt.answer"].sudo().create(answers)
        attempt.total_marks = total
        return attempt

    # ------------------------------------------------------------------ answering
    def _assert_owner(self, partner):
        self.ensure_one()
        if self.student_id != partner:
            raise AccessError("This attempt does not belong to you.")

    def save_answer(self, partner, seq, option_ids=None, text=None, marked=None):
        self.ensure_one()
        self._assert_owner(partner)
        if self.state != "in_progress":
            raise UserError("This attempt is no longer active.")
        now = fields.Datetime.now()
        if now > self.deadline_at + timedelta(seconds=self.quiz_id.grace_seconds):
            raise UserError("Time is over for this attempt.")
        ans = self.answer_ids.filtered(lambda a: a.sequence == seq)
        if not ans:
            raise UserError("Unknown question.")
        vals = {}
        if option_ids is not None:
            valid = {o["id"] for o in ans.snapshot["options"]}
            option_ids = [int(i) for i in option_ids]
            if any(i not in valid for i in option_ids):
                raise UserError("Invalid option for this question.")
            if len(option_ids) > 1:
                raise UserError("Only one option can be selected.")
            vals.update(selected_option_ids=option_ids, answered_at=now)
        if text is not None:
            vals.update(textual_answer=(text or "")[:5000], answered_at=now)
        if marked is not None:
            vals["marked_for_review"] = bool(marked)
        ans.sudo().write(vals)
        return True

    # ------------------------------------------------------------------ submit / evaluate
    def submit_by_student(self, partner):
        self.ensure_one()
        self._assert_owner(partner)
        return self.submit()

    def submit(self):
        """Atomic + idempotent final submission."""
        self.ensure_one()
        self._lock()
        if self.state in FINAL_STATES:
            return self
        if self.state != "in_progress":
            raise UserError("This attempt cannot be submitted.")
        late = fields.Datetime.now() > self.deadline_at + timedelta(seconds=self.quiz_id.grace_seconds)
        self._finalize(late=late)
        return self

    def _finalize(self, late=False):
        self.ensure_one()
        now = fields.Datetime.now()
        taken = int((min(now, self.deadline_at) - self.started_at).total_seconds())
        self.sudo().write({
            "submitted_at": now, "late_submission": late, "time_taken_seconds": max(taken, 0),
            "state": "expired" if late else "submitted",
        })
        self._evaluate()

    def _evaluate(self):
        for att in self.sudo():
            quiz = att.quiz_id
            total = got = 0.0
            pending = False
            for ans in att.answer_ids:
                total += ans.marks_available
                if ans.question_type == "descriptive":
                    if ans.review_status == "graded":
                        got += ans.marks_awarded
                    else:
                        pending = True
                    continue
                ans._auto_grade()  # assignment, not accumulation -> re-evaluation never double scores
                got += ans.marks_awarded
            if quiz.zero_floor:
                got = max(got, 0.0)
            pct = to_pct(got, total)
            vals = {"total_marks": total, "marks_obtained": got, "percentage": pct}
            if pending:
                vals["result_status"] = "pending"
                if att.state not in ("expired",):
                    vals["state"] = "submitted"
            else:
                passed = float_compare(pct, att.passing_percentage_snapshot, precision_digits=PCT_DIGITS) >= 0
                vals["result_status"] = "pass" if passed else "fail"
                if att.state != "expired":
                    vals["state"] = "evaluated"
            att.write(vals)
            att._compute_scholarship()

    # ------------------------------------------------------------------ scholarship
    def _compute_scholarship(self):
        for att in self.sudo():
            if att.scholarship_overridden:
                continue
            quiz = att.quiz_id
            vals = {"scholarship_rule_id": False, "scholarship_type": False, "scholarship_value": 0.0,
                    "scholarship_amount": 0.0}
            if not quiz.scholarship_enabled:
                vals.update(scholarship_status="not_applicable", scholarship_explanation="Scholarships are not enabled.")
            elif att.result_status == "pending":
                vals.update(scholarship_status="pending", scholarship_explanation="Awaiting manual grading.")
            else:
                passed = att.result_status == "pass"
                rules = quiz.scholarship_rule_ids.filtered("active").sorted(
                    key=lambda r: (r.sequence, -r.minimum_percentage, r.id))
                rule = next((r for r in rules if r.matches(att.percentage, passed)), False)
                if rule:
                    vals.update(
                        scholarship_status="eligible", scholarship_rule_id=rule.id,
                        scholarship_type=rule.scholarship_type, scholarship_value=rule.scholarship_value,
                        scholarship_amount=rule.benefit_amount(quiz.course_fee),
                        scholarship_explanation="Score %.2f%% matches rule '%s'. Eligibility is not an approved award."
                        % (att.percentage, rule.name))
                else:
                    why = "did not pass" if not passed and any(r.minimum_passing_required for r in rules) \
                        else "score %.2f%% is outside every scholarship band" % att.percentage
                    vals.update(scholarship_status="not_eligible", scholarship_explanation="Not eligible: " + why + ".")
            if att.scholarship_status in ("approved", "rejected") and vals["scholarship_status"] != att.scholarship_status:
                # an already decided award is never silently changed by a recalculation
                self.env["otm.quiz.audit.log"].log(
                    "scholarship_recalc_conflict", att,
                    "decided=%s recalculated=%s" % (att.scholarship_status, vals["scholarship_status"]))
                continue
            att.write(vals)

    def _require_group(self, xmlid):
        if not self.env.su and not self.env.user.has_group(xmlid):
            raise AccessError("You are not allowed to perform this action.")

    def decide_scholarship(self, decision, note=""):
        """Manager decision: approve/reject an eligible scholarship (audited)."""
        self._require_group("otm_quiz_management.group_otm_quiz_manager")
        for att in self.sudo():
            if att.scholarship_status not in ("eligible", "approved", "rejected"):
                raise UserError("Only eligible scholarships can be decided.")
            att.write({"scholarship_status": "approved" if decision == "approve" else "rejected"})
            self.env["otm.quiz.audit.log"].log("scholarship_" + decision, att, note)
        return True

    def override_scholarship(self, status, note):
        """Administrator override with mandatory justification (audited)."""
        self._require_group("otm_quiz_management.group_otm_quiz_admin")
        if not note:
            raise UserError("A justification is required for an override.")
        if status not in ("eligible", "not_eligible", "approved", "rejected"):
            raise UserError("Invalid status.")
        for att in self.sudo():
            old = att.scholarship_status
            att.write({"scholarship_status": status, "scholarship_overridden": True,
                       "scholarship_explanation": "Administrator override: " + note})
            self.env["otm.quiz.audit.log"].log("scholarship_override", att, "%s -> %s | %s" % (old, status, note))
        return True

    # ------------------------------------------------------------------ cron
    @api.model
    def _cron_expire_attempts(self):
        now = fields.Datetime.now()
        for att in self.sudo().search([("state", "=", "in_progress")]):
            if now > att.deadline_at + timedelta(seconds=att.quiz_id.grace_seconds):
                att.submit()
        return True

    def action_print_result(self):
        return self.env.ref("otm_quiz_management.action_report_attempt_result").report_action(self)


class OtmQuizAttemptAnswer(models.Model):
    _name = "otm.quiz.attempt.answer"
    _description = "Quiz Attempt Answer"
    _order = "attempt_id, sequence"

    attempt_id = fields.Many2one("otm.quiz.attempt", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(required=True)
    question_id = fields.Many2one("otm.quiz.question", ondelete="restrict", index=True)
    question_type = fields.Selection(
        [("mcq", "Multiple Choice"), ("true_false", "True / False"), ("descriptive", "Descriptive (manual)")])
    subject = fields.Char()
    topic = fields.Char()
    snapshot = fields.Json(readonly=True)  # immutable copy of the question + answer key at attempt start
    question_text = fields.Text(compute="_compute_question_text")
    selected_option_ids = fields.Json(default=list)
    textual_answer = fields.Text()
    marked_for_review = fields.Boolean()
    answered_at = fields.Datetime()
    marks_available = fields.Float()
    negative_marks = fields.Float()
    marks_awarded = fields.Float()
    is_correct = fields.Boolean()
    review_status = fields.Selection(
        [("not_required", "Not required"), ("pending", "Pending"), ("graded", "Graded")], default="not_required")
    evaluated_by = fields.Many2one("res.users", readonly=True)
    evaluated_at = fields.Datetime(readonly=True)
    feedback = fields.Text()

    _seq_uniq = models.Constraint("unique(attempt_id, sequence)", "Duplicate question slot in attempt.")

    @api.depends("snapshot")
    def _compute_question_text(self):
        for rec in self:
            rec.question_text = (rec.snapshot or {}).get("text", "")

    def _auto_grade(self):
        for ans in self:
            snap = ans.snapshot or {}
            correct = {o["id"] for o in snap.get("options", []) if o["correct"]}
            selected = set(ans.selected_option_ids or [])
            if not selected:
                ans.write({"marks_awarded": 0.0, "is_correct": False})  # unanswered: zero, no penalty
            elif selected == correct:
                ans.write({"marks_awarded": ans.marks_available, "is_correct": True})
            else:
                ans.write({"marks_awarded": -abs(ans.negative_marks), "is_correct": False})

    def grade_descriptive(self, marks, feedback=""):
        """Evaluator action: grade a descriptive answer, then re-evaluate the whole attempt."""
        if not self.env.su and not self.env.user.has_group("otm_quiz_management.group_otm_quiz_evaluator"):
            raise AccessError("Only evaluators can grade answers.")
        for ans in self:
            if ans.question_type != "descriptive":
                raise UserError("Only descriptive answers are graded manually.")
            if ans.attempt_id.state not in FINAL_STATES:
                raise UserError("The attempt has not been submitted yet.")
            if not (0 <= marks <= ans.marks_available):
                raise UserError("Marks must be between 0 and %s." % ans.marks_available)
            old = ans.marks_awarded
            ans.sudo().write({"marks_awarded": marks, "review_status": "graded", "feedback": feedback,
                              "evaluated_by": self.env.user.id, "evaluated_at": fields.Datetime.now(),
                              "is_correct": marks >= ans.marks_available})
            self.env["otm.quiz.audit.log"].log("answer_graded", ans, "%s -> %s" % (old, marks))
            ans.attempt_id._evaluate()
        return True
