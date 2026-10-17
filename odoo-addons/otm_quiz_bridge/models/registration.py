# -*- coding: utf-8 -*-
from odoo import fields, models


class OtmQuizRegistration(models.Model):
    _inherit = "otm.quiz.registration"

    student_detail_id = fields.Many2one("student.details", string="Student Record", copy=False, index=True,
                                        ondelete="set null", help="Set when the student was assigned from Student Management.")
    lead_id = fields.Many2one("leads.logic", string="Lead", copy=False, index=True, ondelete="set null", readonly=True)
