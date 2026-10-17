# -*- coding: utf-8 -*-
from odoo import fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    otm_student_code = fields.Char(string="Student ID")
    otm_education = fields.Char(string="Course / Education")
    otm_is_quiz_student = fields.Boolean(string="Quiz Student", default=False)
