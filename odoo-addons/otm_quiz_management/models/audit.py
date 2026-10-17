# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.exceptions import UserError


class OtmQuizAuditLog(models.Model):
    _name = "otm.quiz.audit.log"
    _description = "Quiz Audit Log"
    _order = "id desc"

    event = fields.Char(required=True, index=True)
    res_model = fields.Char(string="Model")
    res_id = fields.Integer(string="Record ID")
    user_id = fields.Many2one("res.users", string="User", default=lambda s: s.env.user, readonly=True)
    details = fields.Text()

    @api.model
    def log(self, event, record=None, details=""):
        vals = {"event": event, "details": details or ""}
        if record is not None and record:
            vals.update(res_model=record._name, res_id=record.id)
        return self.sudo().create(vals)

    def write(self, vals):
        raise UserError("Audit records are immutable.")

    @api.ondelete(at_uninstall=True)
    def _unlink_guard(self):
        raise UserError("Audit records cannot be deleted.")
