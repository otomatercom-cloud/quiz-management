# -*- coding: utf-8 -*-
"""XP: one row per student and quiz holding the BEST xp earned, so repeat attempts cannot farm points."""
from odoo import api, fields, models

XP_PER_LEVEL = 200


def xp_for(percentage, passed):
    return int(round(float(percentage or 0.0) * 2)) + (20 if passed else 0)  # 0..220


def level_of(total_xp):
    return int(total_xp // XP_PER_LEVEL) + 1


class OtmQuizXpLog(models.Model):
    _name = "otm.quiz.xp.log"
    _description = "Quiz XP"
    _order = "awarded_on desc, id desc"

    student_id = fields.Many2one("res.partner", required=True, ondelete="cascade", index=True)
    quiz_id = fields.Many2one("otm.quiz", required=True, ondelete="cascade", index=True)
    attempt_id = fields.Many2one("otm.quiz.attempt", ondelete="set null")
    xp = fields.Integer(readonly=True)
    awarded_on = fields.Datetime(default=fields.Datetime.now, index=True)

    _student_quiz_uniq = models.Constraint("unique(student_id, quiz_id)", "XP is tracked once per student and quiz.")

    @api.model
    def _award(self, att):
        """Called after a final, fully-graded evaluation. Late (expired) attempts earn nothing."""
        if att.state != "evaluated" or att.student_id.otm_is_guest:
            return
        xp = xp_for(att.percentage, att.result_status == "pass")
        log = self.sudo().search([("student_id", "=", att.student_id.id), ("quiz_id", "=", att.quiz_id.id)], limit=1)
        if not log:
            self.sudo().create({"student_id": att.student_id.id, "quiz_id": att.quiz_id.id,
                                "attempt_id": att.id, "xp": xp})
        elif xp > log.xp:
            log.write({"xp": xp, "attempt_id": att.id, "awarded_on": fields.Datetime.now()})
