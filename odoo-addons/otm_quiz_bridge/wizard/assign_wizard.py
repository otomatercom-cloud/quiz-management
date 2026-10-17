# -*- coding: utf-8 -*-
import re
import secrets

from odoo import api, fields, models
from odoo.exceptions import UserError

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class OtmQuizAssignWizard(models.TransientModel):
    _name = "otm.quiz.assign.wizard"
    _description = "Assign Students / Batches to a Quiz"

    quiz_id = fields.Many2one("otm.quiz", string="Quiz", required=True,
                              domain="[('registration_required', '=', True), ('state', 'in', ('draft', 'published'))]")
    batch_ids = fields.Many2many("student.batch", string="Batches")
    student_ids = fields.Many2many("student.details", string="Individual Students")
    student_count = fields.Integer(compute="_compute_student_count")
    send_setup_email = fields.Boolean(string="Email password-setup link to new accounts", default=True)
    state = fields.Selection([("draft", "Draft"), ("done", "Done")], default="draft")
    result = fields.Text(readonly=True)

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        model, ids = self.env.context.get("active_model"), self.env.context.get("active_ids") or []
        if model == "student.details" and ids:
            res["student_ids"] = [(6, 0, ids)]
        elif model == "student.batch" and ids:
            res["batch_ids"] = [(6, 0, ids)]
        elif model == "otm.quiz" and ids:
            res["quiz_id"] = ids[0]
        return res

    def _students(self):
        self.ensure_one()
        batch_students = self.env["student.details"].search([("batch_id", "in", self.batch_ids.ids)])
        return (self.student_ids | batch_students)

    @api.depends("batch_ids", "student_ids")
    def _compute_student_count(self):
        for rec in self:
            rec.student_count = len(rec._students())

    # ------------------------------------------------------------------ account
    def _ensure_account(self, stu):
        """Return (partner, created_user_or_None). Raises UserError with a readable reason."""
        email = (stu.email or "").strip().lower()
        if not EMAIL_RE.match(email):
            raise UserError("no valid email on the student record")
        Users = self.env["res.users"].sudo()
        user = Users.with_context(active_test=False).search([("login", "=", email)], limit=1)
        created = None
        if user:
            if not user.active:
                raise UserError("login %s is archived" % email)
            if not user.share:
                raise UserError("email belongs to an internal (staff) user")
        else:
            created = user = Users.with_context(no_reset_password=True).create({
                "name": stu.name, "login": email, "email": email, "password": secrets.token_urlsafe(16),
                "group_ids": [(6, 0, [self.env.ref("base.group_portal").id])],
            })
        phone = re.sub(r"[^\d+]", "", stu.phone or stu.whatsapp_number or "")
        vals = {"otm_is_quiz_student": True}
        if phone and not user.partner_id.phone:
            vals["phone"] = phone
        if not user.partner_id.otm_student_code:
            vals["otm_student_code"] = stu.registration_no or stu.roll_no or False
        if not user.partner_id.otm_education and stu.qualification:
            vals["otm_education"] = stu.qualification
        user.partner_id.write(vals)
        return user.partner_id, created

    # ------------------------------------------------------------------ action
    def action_assign(self):
        self.ensure_one()
        quiz = self.quiz_id
        if not quiz.registration_required:
            raise UserError("This is an open quiz (no registration), so there is nothing to assign. "
                            "Switch the quiz to a registration mode first.")
        students = self._students()
        if not students:
            raise UserError("Select at least one batch or student.")
        Reg = self.env["otm.quiz.registration"].sudo()
        stats = {"assigned": 0, "approved": 0, "already": 0, "accounts": 0}
        failed, new_users = [], self.env["res.users"]
        for stu in students:
            try:
                with self.env.cr.savepoint():
                    partner, created = self._ensure_account(stu)
                    reg = Reg.search([("quiz_id", "=", quiz.id), ("student_id", "=", partner.id),
                                      ("state", "in", ("registered", "confirmed"))], limit=1)
                    if reg:
                        if reg.state == "registered":
                            reg.action_confirm()
                            stats["approved"] += 1
                        else:
                            stats["already"] += 1
                        if not reg.student_detail_id:
                            reg.student_detail_id = stu
                    else:
                        Reg.create({"quiz_id": quiz.id, "student_id": partner.id, "state": "confirmed",
                                    "student_detail_id": stu.id})
                        stats["assigned"] += 1
                    if created:
                        stats["accounts"] += 1
                        new_users |= created
            except Exception as e:  # noqa: BLE001 - reported per student, others continue
                msg = e.args[0] if isinstance(e, UserError) and e.args else str(e)
                failed.append("%s: %s" % (stu.name, msg))
        if self.send_setup_email and new_users:
            for user in new_users:
                try:
                    with self.env.cr.savepoint():
                        user.action_reset_password()
                except Exception:  # noqa: BLE001 - mail may not be configured; students can use "Forgot password"
                    failed.append("%s: account created but the setup email could not be sent" % user.name)
        lines = ["%d newly assigned, %d approved (were waiting), %d already assigned, %d new student accounts created."
                 % (stats["assigned"], stats["approved"], stats["already"], stats["accounts"])]
        if failed:
            lines.append("%d problem(s):" % len(failed))
            lines += ["  - " + f for f in failed[:200]]
        self.env["otm.quiz.audit.log"].log(
            "students_assigned", quiz, "assigned=%(assigned)d approved=%(approved)d already=%(already)d accounts=%(accounts)d failed=%%d" % stats % len(failed))
        self.write({"state": "done", "result": "\n".join(lines)})
        return {"type": "ir.actions.act_window", "res_model": self._name, "res_id": self.id, "view_mode": "form",
                "target": "new"}
