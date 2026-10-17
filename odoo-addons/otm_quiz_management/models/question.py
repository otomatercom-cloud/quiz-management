# -*- coding: utf-8 -*-
import hashlib
import re

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError

MAX_MCQ_OPTIONS = 6
MIN_MCQ_OPTIONS = 2


def normalize_text(text):
    return re.sub(r"\s+", " ", (text or "").strip().lower())


class OtmQuizQuestion(models.Model):
    _name = "otm.quiz.question"
    _description = "Quiz Question"
    _order = "id desc"
    _rec_name = "question_text"

    question_text = fields.Text(required=True)
    question_type = fields.Selection(
        [("mcq", "Multiple Choice"), ("true_false", "True / False"), ("descriptive", "Descriptive (manual)")],
        default="mcq", required=True, index=True)
    subject = fields.Char(index=True)
    topic = fields.Char(index=True)
    difficulty = fields.Selection(
        [("easy", "Easy"), ("medium", "Medium"), ("hard", "Hard")], default="medium", required=True, index=True)
    marks = fields.Float(default=1.0, required=True)
    negative_marks = fields.Float(default=0.0)
    explanation = fields.Text()
    image = fields.Image(max_width=1024, max_height=1024)
    tag_ids = fields.Many2many("otm.quiz.tag", string="Tags")
    option_ids = fields.One2many("otm.quiz.question.option", "question_id", string="Answer Options", copy=True)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one("res.company", string="Company")
    content_hash = fields.Char(compute="_compute_content_hash", store=True, index=True)
    quiz_ids = fields.Many2many(
        "otm.quiz", "otm_quiz_fixed_question_rel", "question_id", "quiz_id", string="Used in Quizzes")
    usage_count = fields.Integer(compute="_compute_usage_count", string="Times Used")

    @api.depends("question_text", "question_type")
    def _compute_content_hash(self):
        for rec in self:
            rec.content_hash = hashlib.sha1(
                ("%s|%s" % (rec.question_type, normalize_text(rec.question_text))).encode()).hexdigest()

    def _compute_usage_count(self):
        counts = {}
        if self.ids:
            groups = self.env["otm.quiz.attempt.answer"].sudo()._read_group(
                [("question_id", "in", self.ids)], ["question_id"], ["__count"])
            counts = {q.id: c for q, c in groups}
        for rec in self:
            rec.usage_count = len(rec.quiz_ids) + counts.get(rec.id, 0)

    @api.constrains("marks", "negative_marks")
    def _check_marks(self):
        for rec in self:
            if rec.marks <= 0:
                raise ValidationError("Question marks must be greater than zero.")
            if rec.negative_marks < 0:
                raise ValidationError("Negative marks cannot be below zero.")

    @api.constrains("question_type", "option_ids")
    def _check_options(self):
        for q in self:
            opts = q.option_ids
            if q.question_type == "descriptive":
                if opts:
                    raise ValidationError("Descriptive questions cannot have answer options.")
                continue
            if q.question_type == "true_false":
                if len(opts) != 2:
                    raise ValidationError("True/False questions need exactly two options.")
            elif not (MIN_MCQ_OPTIONS <= len(opts) <= MAX_MCQ_OPTIONS):
                raise ValidationError(
                    "MCQ questions need between %d and %d options." % (MIN_MCQ_OPTIONS, MAX_MCQ_OPTIONS))
            if len(opts.filtered("is_correct")) != 1:
                raise ValidationError("Exactly one option must be marked correct.")
            if len({normalize_text(o.option_text) for o in opts}) != len(opts):
                raise ValidationError("Answer options must be distinct.")

    @api.ondelete(at_uninstall=False)
    def _unlink_if_unused(self):
        used = self.env["otm.quiz.attempt.answer"].sudo().search_count([("question_id", "in", self.ids)])
        if used or any(q.quiz_ids for q in self):
            raise UserError("This question is used by quizzes or past attempts. Archive it instead.")

    def action_archive_selected(self):
        self.write({"active": False})

    def action_activate_selected(self):
        self.with_context(active_test=False).write({"active": True})

    def snapshot(self):
        """Immutable copy of a question as used inside an attempt (contains the answer key)."""
        self.ensure_one()
        return {
            "question_id": self.id,
            "text": self.question_text,
            "type": self.question_type,
            "subject": self.subject or "",
            "topic": self.topic or "",
            "explanation": self.explanation or "",
            "options": [{"id": o.id, "text": o.option_text, "correct": o.is_correct} for o in self.option_ids.sorted("sequence")],
        }


class OtmQuizQuestionOption(models.Model):
    _name = "otm.quiz.question.option"
    _description = "Quiz Question Option"
    _order = "sequence, id"

    question_id = fields.Many2one("otm.quiz.question", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(default=10)
    option_text = fields.Char(required=True)
    is_correct = fields.Boolean(string="Correct")
    image = fields.Image(max_width=512, max_height=512)

    def unlink(self):
        questions = self.mapped("question_id")
        res = super().unlink()
        questions.exists()._check_options()
        return res
