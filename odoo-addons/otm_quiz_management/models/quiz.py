# -*- coding: utf-8 -*-
import re
import uuid
from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools import float_compare

PROTECTED_FIELDS = {
    "duration_minutes", "passing_percentage", "negative_marking_enabled", "default_negative_marks",
    "maximum_attempts", "fixed_question_ids", "randomize_questions", "randomize_options", "zero_floor",
    "registration_required", "quiz_start", "quiz_end", "grace_seconds",
}


def new_public_id():
    return uuid.uuid4().hex[:16]


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:60] or "quiz"


class OtmQuiz(models.Model):
    _name = "otm.quiz"
    _description = "Quiz"
    _inherit = ["mail.thread"]
    _order = "quiz_start desc, id desc"

    name = fields.Char(string="Title", required=True, tracking=True)
    code = fields.Char(copy=False, index=True)
    public_id = fields.Char(copy=False, readonly=True, index=True, default=lambda s: new_public_id())
    slug = fields.Char(compute="_compute_slug")
    description = fields.Text()
    instructions = fields.Html()
    subject = fields.Char(string="Category / Subject")
    thumbnail = fields.Image(max_width=800, max_height=450)
    state = fields.Selection(
        [("draft", "Draft"), ("published", "Published"), ("closed", "Closed"),
         ("cancelled", "Cancelled"), ("archived", "Archived")],
        default="draft", required=True, tracking=True, copy=False, index=True)
    active = fields.Boolean(default=True)
    # registration
    registration_required = fields.Boolean(default=True)
    registration_start = fields.Datetime()
    registration_end = fields.Datetime()
    registration_limit = fields.Integer(help="0 = unlimited")
    allow_cancellation = fields.Boolean(default=True, help="Students may cancel until registration closes.")
    eligibility_notes = fields.Text(string="Eligibility Requirements")
    # assessment
    quiz_start = fields.Datetime()
    quiz_end = fields.Datetime()
    duration_minutes = fields.Integer(default=30, required=True)
    passing_percentage = fields.Float(default=40.0, required=True)
    negative_marking_enabled = fields.Boolean()
    default_negative_marks = fields.Float(help="Applied when a question has no negative marks of its own.")
    zero_floor = fields.Boolean(string="Total cannot fall below zero", default=True)
    maximum_attempts = fields.Integer(default=1, required=True)
    randomize_questions = fields.Boolean(default=True)
    randomize_options = fields.Boolean(default=True)
    grace_seconds = fields.Integer(default=30, help="Network grace applied after the server deadline.")
    show_results_immediately = fields.Boolean(default=True)
    results_published = fields.Boolean(help="Used when results are not shown immediately.")
    show_correct_answers_after_submission = fields.Boolean()
    # structure
    fixed_question_ids = fields.Many2many(
        "otm.quiz.question", "otm_quiz_fixed_question_rel", "quiz_id", "question_id", string="Fixed Questions")
    question_pool_ids = fields.One2many("otm.quiz.question.pool", "quiz_id", string="Question Pools")
    evaluator_ids = fields.Many2many("res.users", "otm_quiz_evaluator_rel", "quiz_id", "user_id", string="Evaluators")
    total_marks = fields.Float(compute="_compute_total_marks")
    question_total = fields.Integer(compute="_compute_total_marks", string="Questions per Attempt")
    # scholarship
    scholarship_enabled = fields.Boolean()
    course_fee = fields.Float(string="Base Course Fee")
    scholarship_rule_ids = fields.One2many("otm.quiz.scholarship.rule", "quiz_id", string="Scholarship Rules")
    validation_errors = fields.Text(compute="_compute_validation_errors")
    # live counters (derived)
    registration_count = fields.Integer(compute="_compute_counters")
    confirmed_count = fields.Integer(compute="_compute_counters")
    cancelled_count = fields.Integer(compute="_compute_counters")
    started_count = fields.Integer(compute="_compute_counters")
    completed_count = fields.Integer(compute="_compute_counters")
    passed_count = fields.Integer(compute="_compute_counters")
    failed_count = fields.Integer(compute="_compute_counters")

    _public_uniq = models.Constraint("unique(public_id)", "Public identifier must be unique.")

    # ------------------------------------------------------------------ computes
    @api.depends("name", "public_id")
    def _compute_slug(self):
        for rec in self:
            rec.slug = "%s-%s" % (slugify(rec.name), rec.public_id)

    def _structure(self):
        """Return (fixed_questions, [(pool, eligible_without_fixed)])."""
        self.ensure_one()
        fixed = self.fixed_question_ids.filtered("active")
        pools = [(p, p._eligible_questions(exclude=fixed)) for p in self.question_pool_ids.filtered("active")]
        return fixed, pools

    @api.depends("fixed_question_ids.marks", "fixed_question_ids.active", "question_pool_ids.questions_to_select",
                 "question_pool_ids.marks_per_question", "question_pool_ids.active")
    def _compute_total_marks(self):
        for rec in self:
            fixed, pools = rec._structure()
            total = sum(fixed.mapped("marks"))
            count = len(fixed)
            for pool, eligible in pools:
                per = pool.marks_per_question or (eligible[:1].marks if eligible else 0.0)
                total += per * pool.questions_to_select
                count += pool.questions_to_select
            rec.total_marks = total
            rec.question_total = count

    def _count(self, model, domain_extra, field="quiz_id"):
        domain = [(field, "in", self.ids)] + domain_extra
        groups = self.env[model].sudo()._read_group(domain, [field], ["__count"])
        return {q.id: c for q, c in groups}

    @api.depends("state")
    def _compute_counters(self):
        if not self.ids:
            for rec in self:
                rec.registration_count = rec.confirmed_count = rec.cancelled_count = 0
                rec.started_count = rec.completed_count = rec.passed_count = rec.failed_count = 0
            return
        reg, att = "otm.quiz.registration", "otm.quiz.attempt"
        c_reg = self._count(reg, [("state", "in", ("registered", "confirmed"))])
        c_conf = self._count(reg, [("state", "=", "confirmed")])
        c_canc = self._count(reg, [("state", "=", "cancelled")])
        started = self.env[att].sudo()._read_group(
            [("quiz_id", "in", self.ids), ("state", "!=", "not_started")], ["quiz_id"], ["student_id:count_distinct"])
        c_start = {q.id: c for q, c in started}
        done = self.env[att].sudo()._read_group(
            [("quiz_id", "in", self.ids), ("state", "in", ("submitted", "evaluated", "expired"))],
            ["quiz_id"], ["student_id:count_distinct"])
        c_done = {q.id: c for q, c in done}
        passed = self.env[att].sudo()._read_group(
            [("quiz_id", "in", self.ids), ("result_status", "=", "pass")], ["quiz_id"], ["student_id:count_distinct"])
        c_pass = {q.id: c for q, c in passed}
        failed = self.env[att].sudo()._read_group(
            [("quiz_id", "in", self.ids), ("result_status", "=", "fail")], ["quiz_id"], ["student_id:count_distinct"])
        c_fail = {q.id: c for q, c in failed}
        for rec in self:
            rec.registration_count = c_reg.get(rec.id, 0)
            rec.confirmed_count = c_conf.get(rec.id, 0)
            rec.cancelled_count = c_canc.get(rec.id, 0)
            rec.started_count = c_start.get(rec.id, 0)
            rec.completed_count = c_done.get(rec.id, 0)
            rec.passed_count = c_pass.get(rec.id, 0)
            rec.failed_count = c_fail.get(rec.id, 0)

    # ------------------------------------------------------------------ validation
    def _get_validation_errors(self):
        self.ensure_one()
        errs = []
        if not self.quiz_start or not self.quiz_end:
            errs.append("Quiz start and end dates are required.")
        elif self.quiz_end <= self.quiz_start:
            errs.append("Quiz end must be after quiz start.")
        if self.registration_required:
            if not self.registration_start or not self.registration_end:
                errs.append("Registration dates are required when registration is enabled.")
            elif self.registration_end <= self.registration_start:
                errs.append("Registration end must be after registration start.")
            elif self.quiz_end and self.registration_end > self.quiz_end:
                errs.append("Registration must close before the quiz window ends.")
        if self.duration_minutes <= 0:
            errs.append("Duration must be positive.")
        if not (0 <= self.passing_percentage <= 100):
            errs.append("Passing percentage must be between 0 and 100.")
        if self.maximum_attempts < 1:
            errs.append("Maximum attempts must be at least 1.")
        fixed, pools = self._structure()
        if not fixed and not pools:
            errs.append("Add at least one question or question pool.")
        for q in fixed:
            try:
                q._check_options()
            except ValidationError as e:
                errs.append("Question #%d: %s" % (q.id, e.args[0]))
        used = self.env["otm.quiz.question"]
        for pool, eligible in pools:
            if len(eligible) < pool.questions_to_select:
                errs.append("Pool '%s' needs %d questions but only %d are eligible." % (
                    pool.name, pool.questions_to_select, len(eligible)))
            if not pool.marks_per_question and len(set(eligible.mapped("marks"))) > 1:
                errs.append("Pool '%s' has mixed marks; set 'Marks per question'." % pool.name)
            if eligible & used and pool.question_ids:
                errs.append("Pool '%s' overlaps with another pool." % pool.name)
            used |= eligible
        if self.total_marks <= 0 and (fixed or pools):
            errs.append("Total marks must be greater than zero.")
        if self.scholarship_enabled:
            rules = self.scholarship_rule_ids.filtered("active")
            if not rules:
                errs.append("Scholarships are enabled but no active rule exists.")
            else:
                try:
                    rules._check_overlap()
                except ValidationError as e:
                    errs.append(e.args[0])
        return errs

    @api.depends("name", "quiz_start", "quiz_end", "registration_start", "registration_end", "duration_minutes",
                 "passing_percentage", "fixed_question_ids", "question_pool_ids", "scholarship_enabled",
                 "scholarship_rule_ids")
    def _compute_validation_errors(self):
        for rec in self:
            rec.validation_errors = "\n".join(rec._get_validation_errors()) if rec.id else ""

    # ------------------------------------------------------------------ edit guards
    def _has_attempts(self):
        return bool(self.env["otm.quiz.attempt"].sudo().search_count(
            [("quiz_id", "in", self.ids), ("state", "!=", "not_started")], limit=1))

    def _assert_structure_editable(self):
        if self and self._has_attempts():
            raise UserError("Attempts already exist for this quiz; marks, questions, timing and eligibility are locked.")

    def write(self, vals):
        if "state" in vals and not self.env.context.get("otm_quiz_state_change"):
            raise UserError("Use the workflow buttons to change the quiz state.")
        if PROTECTED_FIELDS & set(vals):
            self._assert_structure_editable()
        return super().write(vals)

    @api.ondelete(at_uninstall=False)
    def _unlink_guard(self):
        for rec in self:
            if rec.state != "draft" or rec._has_attempts():
                raise UserError("Only draft quizzes without attempts can be deleted. Archive or cancel instead.")

    # ------------------------------------------------------------------ workflow
    def _set_state(self, state):
        self.with_context(otm_quiz_state_change=True).write({"state": state})

    def action_publish(self):
        for rec in self:
            if rec.state != "draft":
                raise UserError("Only draft quizzes can be published.")
            errs = rec._get_validation_errors()
            if errs:
                raise UserError("Cannot publish:\n- " + "\n- ".join(errs))
            if not rec.code:
                rec.code = self.env["ir.sequence"].sudo().next_by_code("otm.quiz.code")
            rec._set_state("published")
            self.env["otm.quiz.audit.log"].log("quiz_published", rec)

    def action_close(self):
        for rec in self:
            if rec.state != "published":
                raise UserError("Only published quizzes can be closed.")
            rec._set_state("closed")
            self.env["otm.quiz.audit.log"].log("quiz_closed", rec)

    def action_cancel(self):
        for rec in self:
            if rec.state not in ("draft", "published"):
                raise UserError("This quiz cannot be cancelled.")
            rec._set_state("cancelled")
            self.env["otm.quiz.audit.log"].log("quiz_cancelled", rec)

    def action_archive_quiz(self):
        for rec in self:
            rec._set_state("archived")
            rec.active = False
            self.env["otm.quiz.audit.log"].log("quiz_archived", rec)

    def action_reset_draft(self):
        for rec in self:
            if rec._has_attempts():
                raise UserError("Quizzes with attempts cannot return to draft.")
            rec._set_state("draft")

    def action_publish_results(self):
        self.write({"results_published": True})
        self.env["otm.quiz.audit.log"].log("results_published", self[:1])

    def action_recalculate_scholarships(self):
        attempts = self.env["otm.quiz.attempt"].sudo().search(
            [("quiz_id", "in", self.ids), ("state", "in", ("evaluated", "expired")),
             ("scholarship_overridden", "=", False)])
        attempts._compute_scholarship()
        self.env["otm.quiz.audit.log"].log("scholarships_recalculated", self[:1], "attempts=%d" % len(attempts))

    # ------------------------------------------------------------------ helpers for attempts / api
    def _registration_open(self, now=None):
        self.ensure_one()
        now = now or fields.Datetime.now()
        if self.state != "published":
            return False
        if not self.registration_required:
            return True
        return bool(self.registration_start and self.registration_end
                    and self.registration_start <= now <= self.registration_end)

    def _window_open(self, now=None):
        self.ensure_one()
        now = now or fields.Datetime.now()
        return self.state == "published" and bool(self.quiz_start and self.quiz_end
                                                  and self.quiz_start <= now < self.quiz_end)

    def _effective_negative(self, question):
        self.ensure_one()
        if not self.negative_marking_enabled:
            return 0.0
        return question.negative_marks or self.default_negative_marks

    def _build_question_set(self):
        """Server-side question selection: fixed + random pool picks (no duplicates)."""
        self.ensure_one()
        import random
        fixed = self.fixed_question_ids.filtered("active")
        picked = [(q, q.marks) for q in fixed]
        used = fixed
        for pool in self.question_pool_ids.filtered("active"):
            chosen = pool._pick(exclude=used)
            used |= chosen
            picked += [(q, pool._marks_for(q)) for q in chosen]
        if self.randomize_questions:
            random.SystemRandom().shuffle(picked)
        return picked

    def action_view_registrations(self):
        self.ensure_one()
        return {"type": "ir.actions.act_window", "name": "Registrations", "res_model": "otm.quiz.registration",
                "view_mode": "list,form", "domain": [("quiz_id", "=", self.id)]}

    def action_view_attempts(self):
        self.ensure_one()
        return {"type": "ir.actions.act_window", "name": "Attempts", "res_model": "otm.quiz.attempt",
                "view_mode": "list,form", "domain": [("quiz_id", "=", self.id)]}
