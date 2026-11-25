# -*- coding: utf-8 -*-
from odoo import fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    otm_student_code = fields.Char(string="Student ID")
    otm_education = fields.Char(string="Course / Education")
    otm_is_quiz_student = fields.Boolean(string="Quiz Student", default=False)
    otm_is_guest = fields.Boolean(string="Quiz Guest", default=False, index=True,
                                  help="Took an open quiz without an account. Has no login and no access to the student portal.")
    otm_nickname = fields.Char(string="Quiz Nickname", help="The only name other students see (never the real name).")
    otm_avatar = fields.Char(string="Quiz Character", default="fox")
    otm_photo = fields.Image(string="Quiz Photo", max_width=256, max_height=256, attachment=True,
                             help="Visible to the student and staff only. Never shown to other students.")
    otm_photo_consent = fields.Boolean(string="Photo Consent (parent/guardian)")
