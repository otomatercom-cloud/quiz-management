# -*- coding: utf-8 -*-
import re

from odoo import api, fields, models
from odoo.exceptions import UserError


class OtmQuizLeadWizard(models.TransientModel):
    _name = "otm.quiz.lead.wizard"
    _description = "Convert Quiz Registrations to Leads"

    quiz_id = fields.Many2one("otm.quiz", string="Quiz")
    scope = fields.Selection([("selected", "Selected registrations"), ("quiz", "All registrations of the quiz")],
                             default="selected", required=True)
    registration_ids = fields.Many2many("otm.quiz.registration", string="Registrations")
    only_attempted = fields.Boolean(string="Only students who attempted the quiz")
    leads_source = fields.Many2one("leads.sources", string="Leads Source", required=True)
    source_campaign_id = fields.Many2one("lead.source.campaign", string="Source Campaign",
                                         domain="[('lead_source_id', '=', leads_source)]")
    lead_owner = fields.Many2one("hr.employee", string="Lead Owner")
    course_interested = fields.Char(string="Course Interested")
    state = fields.Selection([("draft", "Draft"), ("done", "Done")], default="draft")
    result = fields.Text(readonly=True)

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        model, ids = self.env.context.get("active_model"), self.env.context.get("active_ids") or []
        if model == "otm.quiz.registration" and ids:
            regs = self.env["otm.quiz.registration"].browse(ids)
            res["registration_ids"] = [(6, 0, ids)]
            if len(regs.quiz_id) == 1:
                res["quiz_id"] = regs.quiz_id.id
        elif model == "otm.quiz" and ids:
            res.update(quiz_id=ids[0], scope="quiz")
        if "leads_source" in fields_list:
            src = self.env["leads.sources"].search([("name", "ilike", "quiz")], limit=1)
            if src:
                res["leads_source"] = src.id
        return res

    def _registrations(self):
        self.ensure_one()
        Reg = self.env["otm.quiz.registration"]
        if self.scope == "quiz":
            if not self.quiz_id:
                raise UserError("Choose a quiz.")
            regs = Reg.search([("quiz_id", "=", self.quiz_id.id), ("state", "in", ("registered", "confirmed"))])
        else:
            regs = self.registration_ids.filtered(lambda r: r.state in ("registered", "confirmed"))
        if self.only_attempted:
            regs = regs.filtered(lambda r: r.attempt_ids.filtered(lambda a: a.state != "not_started"))
        return regs

    @staticmethod
    def _last10(phone):
        return re.sub(r"\D", "", phone or "")[-10:]

    def _result_text(self, reg):
        best = reg.attempt_ids.filtered(lambda a: a.state in ("evaluated", "submitted", "expired")).sorted(
            key=lambda a: a.percentage, reverse=True)[:1]
        if best:
            return "%s%% (%s)" % (best.percentage, dict(best._fields["result_status"].selection).get(best.result_status))
        return "no attempt yet"

    def action_convert(self):
        self.ensure_one()
        regs = self._registrations()
        if not regs:
            raise UserError("No registrations to convert.")
        Lead = self.env["leads.logic"]
        stats = {"created": 0, "linked": 0, "already": 0}
        failed = []
        for reg in regs:
            partner = reg.student_id
            try:
                with self.env.cr.savepoint():
                    if reg.lead_id:
                        stats["already"] += 1
                        continue
                    last10 = self._last10(partner.phone)
                    if len(last10) < 10:
                        raise UserError("no valid 10-digit phone number")
                    existing = Lead.sudo().search([("phone_number", "like", "%" + last10)], limit=1)
                    summary = "Quiz: %s - %s" % (reg.quiz_id.name, self._result_text(reg))
                    if existing:
                        reg.sudo().lead_id = existing
                        existing.sudo().message_post(body="Linked from quiz registration. " + summary)
                        stats["linked"] += 1
                        continue
                    vals = {
                        "name": partner.name, "phone_number": partner.phone, "email_address": partner.email or False,
                        "leads_source": self.leads_source.id, "remarks": summary[:250],
                        "course_interested": self.course_interested or reg.quiz_id.subject or False,
                        "college_name": partner.otm_education or False,
                    }
                    if self.source_campaign_id:
                        vals["source_campaign_id"] = self.source_campaign_id.id
                    if self.lead_owner:
                        vals["lead_owner"] = self.lead_owner.id
                    lead = Lead.create(vals)
                    lead.message_post(body="Created from quiz registration %s. %s" % (reg.reference, summary))
                    reg.sudo().lead_id = lead
                    stats["created"] += 1
            except Exception as e:  # noqa: BLE001 - reported per student
                msg = e.args[0] if isinstance(e, UserError) and e.args else str(e)
                failed.append("%s: %s" % (partner.name, msg))
        lines = ["%(created)d leads created, %(linked)d linked to existing leads (same phone), %(already)d already converted."
                 % stats]
        if failed:
            lines.append("%d failed:" % len(failed))
            lines += ["  - " + f for f in failed[:200]]
        self.env["otm.quiz.audit.log"].log("registrations_to_leads", self.quiz_id or None,
                                           "created=%d linked=%d already=%d failed=%d" % (
                                               stats["created"], stats["linked"], stats["already"], len(failed)))
        self.write({"state": "done", "result": "\n".join(lines)})
        return {"type": "ir.actions.act_window", "res_model": self._name, "res_id": self.id, "view_mode": "form",
                "target": "new"}
