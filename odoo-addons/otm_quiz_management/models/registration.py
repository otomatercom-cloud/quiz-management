# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError

from .quiz import new_public_id

ACTIVE_STATES = ("registered", "confirmed")


class OtmQuizRegistration(models.Model):
    _name = "otm.quiz.registration"
    _description = "Quiz Registration"
    _order = "id desc"
    _rec_name = "reference"

    reference = fields.Char(readonly=True, copy=False, default="New", index=True)
    public_id = fields.Char(readonly=True, copy=False, index=True, default=lambda s: new_public_id())
    quiz_id = fields.Many2one("otm.quiz", required=True, ondelete="restrict", index=True)
    student_id = fields.Many2one("res.partner", string="Student", required=True, ondelete="restrict", index=True)
    registration_date = fields.Datetime(default=fields.Datetime.now, readonly=True)
    state = fields.Selection(
        [("registered", "Registered"), ("confirmed", "Confirmed"), ("cancelled", "Cancelled"),
         ("disqualified", "Disqualified")], default="registered", required=True, index=True)
    eligibility_status = fields.Selection(
        [("eligible", "Eligible"), ("ineligible", "Ineligible")], default="eligible", required=True)
    note = fields.Text()
    attempt_ids = fields.One2many("otm.quiz.attempt", "registration_id")

    _public_uniq = models.Constraint("unique(public_id)", "Public identifier must be unique.")

    def init(self):
        # transaction-safe duplicate prevention: one active registration per student and quiz
        self.env.cr.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS otm_quiz_registration_active_uniq "
            "ON otm_quiz_registration (quiz_id, student_id) WHERE state IN ('registered','confirmed')")

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("reference", "New") == "New":
                vals["reference"] = self.env["ir.sequence"].sudo().next_by_code("otm.quiz.registration") or "New"
            if vals.get("state", "registered") in ACTIVE_STATES and self.sudo().search_count([
                    ("quiz_id", "=", vals.get("quiz_id")), ("student_id", "=", vals.get("student_id")),
                    ("state", "in", ACTIVE_STATES)]):
                raise ValidationError("This student already has an active registration for this quiz.")
        return super().create(vals_list)

    @api.constrains("quiz_id", "student_id", "state")
    def _check_duplicate(self):
        for rec in self.filtered(lambda r: r.state in ACTIVE_STATES):
            if self.sudo().search_count([("quiz_id", "=", rec.quiz_id.id), ("student_id", "=", rec.student_id.id),
                                         ("state", "in", ACTIVE_STATES), ("id", "!=", rec.id)]):
                raise ValidationError("This student already has an active registration for this quiz.")

    # ---- workflow
    def action_confirm(self):
        regs = self.filtered(lambda r: r.state == "registered")
        regs.write({"state": "confirmed"})
        if regs:
            self.env["otm.quiz.audit.log"].log("registration_approved", regs[:1])

    def action_cancel(self):
        for rec in self:
            if rec.attempt_ids.filtered(lambda a: a.state != "not_started"):
                raise UserError("A registration with attempts cannot be cancelled.")
            rec.state = "cancelled"

    def action_disqualify(self):
        self.write({"state": "disqualified"})
        self.env["otm.quiz.audit.log"].log("registration_disqualified", self[:1])

    # ---- core used by the API layer (idempotent + lock protected)
    @api.model
    def register(self, quiz, partner):
        """Create (or return the existing) active registration for partner. Raises UserError on rule breaches."""
        quiz.ensure_one()
        quiz.flush_recordset()
        self.env.cr.execute("SELECT id FROM otm_quiz WHERE id = %s FOR UPDATE", [quiz.id])
        quiz.invalidate_recordset()
        existing = self.sudo().search([("quiz_id", "=", quiz.id), ("student_id", "=", partner.id),
                                       ("state", "in", ACTIVE_STATES)], limit=1)
        if existing:
            return existing  # idempotent
        if not quiz.registration_required:
            raise UserError("Registration is not required for this quiz.")
        if not quiz._registration_open():
            raise UserError("Registration is not open for this quiz.")
        if quiz.registration_limit:
            taken = self.sudo().search_count([("quiz_id", "=", quiz.id), ("state", "in", ACTIVE_STATES)])
            if taken >= quiz.registration_limit:
                raise UserError("Registration limit reached.")
        reg = self.sudo().create({"quiz_id": quiz.id, "student_id": partner.id,
                                  "state": "registered" if quiz.approval_required else "confirmed"})
        return reg

    def cancel_by_student(self):
        self.ensure_one()
        if self.state == "cancelled":
            return self  # idempotent
        quiz = self.quiz_id
        if not quiz.allow_cancellation:
            raise UserError("Cancellation is not allowed for this quiz.")
        now = fields.Datetime.now()
        if quiz.registration_end and now > quiz.registration_end:
            raise UserError("Registration has closed; it can no longer be cancelled.")
        self.action_cancel()
        return self
