# -*- coding: utf-8 -*-
"""Public platform features: email verification codes and guest attempts (extends otm.quiz.api)."""
import re

from odoo import api, models
from odoo.exceptions import UserError

from .otp import EMAIL_RE


class OtmQuizApiPublic(models.AbstractModel):
    _inherit = "otm.quiz.api"

    @api.model
    def public_config(self):
        return {"require_email_otp": self.env["otm.quiz.email.otp"]._otp_required()}

    @api.model
    def student_request_otp(self, email, purpose="register"):
        email = (email or "").strip().lower()
        if purpose == "register" and self.env["res.users"].sudo().with_context(active_test=False).search_count([("login", "=", email)]):
            raise UserError("An account with this email already exists. Please sign in.")
        return self.env["otm.quiz.email.otp"]._issue(email, purpose)

    @api.model
    def student_register(self, name, email, phone, password, student_code="", education="", otp=""):
        Otp = self.env["otm.quiz.email.otp"]
        rec = None
        if Otp._otp_required():
            rec, err = Otp._verify(email, "register", otp, consume=False)
            if err:
                return {"otp_error": err}
        data = super().student_register(name, email, phone, password, student_code, education)
        if rec:
            rec.used = True  # only spent once the account really exists
        return data

    @api.model
    def guest_start(self, quiz_public_id, name, phone, email="", otp=""):
        """Take an open quiz with just a name and mobile number. A guest has no login and can only use that one attempt."""
        quiz = self._quiz_by_public(quiz_public_id)
        if quiz.state != "published" or not quiz.allow_guest or quiz.registration_required or quiz.with_context(active_test=False).room_ids:
            raise UserError("This quiz needs an account. Please create a free account to take it.")
        name, email = (name or "").strip(), (email or "").strip().lower()
        phone = re.sub(r"[^\d+]", "", phone or "")
        digits = phone.replace("+", "")
        if len(name) < 2:
            raise UserError("Please enter your name.")
        if not (7 <= len(digits) <= 15):
            raise UserError("Please enter a valid mobile number.")
        if email and not EMAIL_RE.match(email):
            raise UserError("Please enter a valid email address.")
        Otp = self.env["otm.quiz.email.otp"]
        rec = None
        if Otp._otp_required():
            if not email:
                raise UserError("Please enter your email address to receive a verification code.")
            rec, err = Otp._verify(email, "guest", otp, consume=False)
            if err:
                return {"otp_error": err}
        Partner = self.env["res.partner"].sudo()
        domain = [("otm_is_guest", "=", True), ("phone", "like", "%" + digits[-10:])]
        if email:
            domain = ["|", ("email", "=", email)] + domain
        same_person = Partner.search(domain)
        used = self.env["otm.quiz.attempt"].sudo().search_count(
            [("quiz_id", "=", quiz.id), ("student_id", "in", same_person.ids), ("state", "!=", "not_started")])
        if used >= quiz.maximum_attempts:
            raise UserError("You have already used the attempts allowed for this quiz. Create a free account for more.")
        guest = Partner.create({"name": name, "phone": phone, "email": email or False,
                                "otm_is_quiz_student": True, "otm_is_guest": True})
        att = self.env["otm.quiz.attempt"].start_for(quiz, guest)
        if rec:
            rec.used = True
        return {"partner_id": guest.id, "name": guest.name, "attempt_id": att.public_id}
