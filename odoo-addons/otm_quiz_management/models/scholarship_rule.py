# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.exceptions import ValidationError

TOP = 100.0001  # exclusive upper bound meaning "no maximum"


class OtmQuizScholarshipRule(models.Model):
    _name = "otm.quiz.scholarship.rule"
    _description = "Quiz Scholarship Rule"
    _order = "quiz_id, sequence, id"

    name = fields.Char(required=True)
    quiz_id = fields.Many2one("otm.quiz", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(string="Priority", default=10, help="Lower number wins when ranges overlap.")
    minimum_percentage = fields.Float(required=True, help="Inclusive lower bound.")
    maximum_percentage = fields.Float(help="Exclusive upper bound. 0 = no upper bound.")
    scholarship_type = fields.Selection(
        [("percentage", "Fee waiver (%)"), ("fixed_amount", "Fixed amount")], default="percentage", required=True)
    scholarship_value = fields.Float(required=True)
    maximum_amount = fields.Float(string="Maximum Amount Cap", help="0 = no cap.")
    minimum_passing_required = fields.Boolean(string="Must Pass", default=True)
    active = fields.Boolean(default=True)

    @api.constrains("minimum_percentage", "maximum_percentage", "scholarship_value", "scholarship_type",
                    "maximum_amount")
    def _check_values(self):
        for rec in self:
            if not (0 <= rec.minimum_percentage <= 100):
                raise ValidationError("Minimum percentage must be between 0 and 100.")
            if rec.maximum_percentage and rec.maximum_percentage <= rec.minimum_percentage:
                raise ValidationError("Maximum percentage must exceed the minimum.")
            if rec.scholarship_value <= 0:
                raise ValidationError("Scholarship value must be positive.")
            if rec.scholarship_type == "percentage" and rec.scholarship_value > 100:
                raise ValidationError("A percentage waiver cannot exceed 100.")
            if rec.maximum_amount < 0:
                raise ValidationError("Maximum amount cannot be negative.")

    @api.constrains("quiz_id", "sequence", "minimum_percentage", "maximum_percentage", "active")
    def _check_overlap_constraint(self):
        self.mapped("quiz_id").scholarship_rule_ids.filtered("active")._check_overlap()

    def _check_overlap(self):
        """Overlapping ranges are allowed only with distinct priorities (deterministic precedence)."""
        rules = self.filtered("active")
        for quiz in rules.mapped("quiz_id"):
            qrules = rules.filtered(lambda r: r.quiz_id == quiz)
            for i, a in enumerate(qrules):
                for b in qrules[i + 1:]:
                    a_hi = a.maximum_percentage or TOP
                    b_hi = b.maximum_percentage or TOP
                    overlap = a.minimum_percentage < b_hi and b.minimum_percentage < a_hi
                    if overlap and a.sequence == b.sequence:
                        raise ValidationError(
                            "Rules '%s' and '%s' overlap with the same priority; give them different priorities."
                            % (a.name, b.name))

    def matches(self, percentage, passed):
        self.ensure_one()
        if self.minimum_passing_required and not passed:
            return False
        hi = self.maximum_percentage or TOP
        return self.minimum_percentage <= percentage < hi

    def benefit_amount(self, fee):
        self.ensure_one()
        if self.scholarship_type == "percentage":
            amount = (fee or 0.0) * self.scholarship_value / 100.0
        else:
            amount = min(self.scholarship_value, fee) if fee else self.scholarship_value
        if self.maximum_amount:
            amount = min(amount, self.maximum_amount)
        return round(amount, 2)

    def write(self, vals):
        res = super().write(vals)
        self.env["otm.quiz.audit.log"].log("scholarship_rule_changed", self[:1], str(sorted(vals)))
        return res
