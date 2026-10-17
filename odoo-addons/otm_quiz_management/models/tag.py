# -*- coding: utf-8 -*-
from odoo import fields, models


class OtmQuizTag(models.Model):
    _name = "otm.quiz.tag"
    _description = "Question Tag"
    _order = "name"

    name = fields.Char(required=True)
    _name_uniq = models.Constraint("unique(name)", "Tag name must be unique.")
