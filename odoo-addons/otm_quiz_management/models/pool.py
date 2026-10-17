# -*- coding: utf-8 -*-
import random

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


class OtmQuizQuestionPool(models.Model):
    _name = "otm.quiz.question.pool"
    _description = "Quiz Question Pool"
    _order = "quiz_id, sequence, id"

    name = fields.Char(required=True)
    sequence = fields.Integer(default=10)
    quiz_id = fields.Many2one("otm.quiz", required=True, ondelete="cascade", index=True)
    subject = fields.Char()
    topic = fields.Char()
    difficulty = fields.Selection(
        [("any", "Any"), ("easy", "Easy"), ("medium", "Medium"), ("hard", "Hard")], default="any", required=True)
    question_type = fields.Selection(
        [("mcq", "Multiple Choice"), ("true_false", "True / False")], default="mcq", required=True)
    questions_to_select = fields.Integer(default=5, required=True)
    marks_per_question = fields.Float(
        help="Leave 0 to use each question's own marks (all eligible questions must then share equal marks).")
    question_ids = fields.Many2many(
        "otm.quiz.question", "otm_quiz_pool_question_rel", "pool_id", "question_id", string="Explicit Questions",
        help="If set, only these questions are eligible. Otherwise subject/topic filters apply.")
    active = fields.Boolean(default=True)
    eligible_count = fields.Integer(compute="_compute_eligible_count")

    @api.constrains("questions_to_select", "marks_per_question")
    def _check_values(self):
        for rec in self:
            if rec.questions_to_select < 1:
                raise ValidationError("A pool must select at least one question.")
            if rec.marks_per_question < 0:
                raise ValidationError("Marks per question cannot be negative.")

    def _eligible_questions(self, exclude=None):
        self.ensure_one()
        domain = [("active", "=", True), ("question_type", "=", self.question_type)]
        if self.difficulty != "any":
            domain.append(("difficulty", "=", self.difficulty))
        if self.question_ids:
            domain.append(("id", "in", self.question_ids.ids))
        else:
            if self.subject:
                domain.append(("subject", "=ilike", self.subject))
            if self.topic:
                domain.append(("topic", "=ilike", self.topic))
        if exclude:
            domain.append(("id", "not in", exclude.ids))
        return self.env["otm.quiz.question"].search(domain)

    @api.depends("subject", "topic", "difficulty", "question_type", "question_ids", "quiz_id.fixed_question_ids")
    def _compute_eligible_count(self):
        for rec in self:
            rec.eligible_count = len(rec._eligible_questions(exclude=rec.quiz_id.fixed_question_ids))

    def _pick(self, exclude):
        """Random, duplicate-free selection. Raises when the bank is too small."""
        self.ensure_one()
        eligible = self._eligible_questions(exclude=exclude)
        if len(eligible) < self.questions_to_select:
            raise UserError("Pool '%s' has only %d eligible questions (needs %d)." % (
                self.name, len(eligible), self.questions_to_select))
        return self.env["otm.quiz.question"].browse(random.SystemRandom().sample(eligible.ids, self.questions_to_select))

    def _marks_for(self, question):
        self.ensure_one()
        return self.marks_per_question or question.marks

    # ---- guard: no structural edits once attempts exist
    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("quiz_id"):
                self.env["otm.quiz"].browse(vals["quiz_id"])._assert_structure_editable()
        return super().create(vals_list)

    def write(self, vals):
        if set(vals) - {"name", "sequence"}:
            self.mapped("quiz_id")._assert_structure_editable()
        return super().write(vals)

    def unlink(self):
        self.mapped("quiz_id")._assert_structure_editable()
        return super().unlink()
