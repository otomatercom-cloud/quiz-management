# -*- coding: utf-8 -*-
"""Email one-time codes for public sign-up and guest attempts. Only a keyed hash of the code is stored."""
import hmac
import logging
import re
import secrets
from datetime import timedelta
from hashlib import sha256

from odoo import api, fields, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CODE_TTL = timedelta(minutes=10)
RESEND_AFTER = timedelta(seconds=60)
MAX_PER_HOUR = 5
MAX_WRONG = 5
PURPOSES = ("register", "guest")


class OtmQuizEmailOtp(models.Model):
    _name = "otm.quiz.email.otp"
    _description = "Quiz Email Code"
    _order = "id desc"

    email = fields.Char(required=True, index=True)
    purpose = fields.Selection([("register", "Register"), ("guest", "Guest")], required=True)
    code_hash = fields.Char(required=True)
    expires_at = fields.Datetime(required=True)
    attempts = fields.Integer(default=0)
    used = fields.Boolean(default=False)

    # ------------------------------------------------------------------ helpers
    @api.model
    def _otp_required(self):
        return self.env["ir.config_parameter"].sudo().get_param("otm_quiz.require_email_otp", "0").lower() in ("1", "true", "yes")

    @api.model
    def _new_code(self):
        return "%06d" % secrets.randbelow(1_000_000)

    @api.model
    def _hash(self, email, purpose, code):
        key = (self.env["ir.config_parameter"].sudo().get_param("database.secret") or "otm").encode()
        return hmac.new(key, ("%s|%s|%s" % (email, purpose, code)).encode(), sha256).hexdigest()

    @api.model
    def _norm(self, email, purpose):
        email = (email or "").strip().lower()
        if not EMAIL_RE.match(email) or len(email) > 160:
            raise UserError("Please enter a valid email address.")
        if purpose not in PURPOSES:
            raise UserError("Unsupported request.")
        return email

    # ------------------------------------------------------------------ issue
    @api.model
    def _issue(self, email, purpose):
        email = self._norm(email, purpose)
        now = fields.Datetime.now()
        recent = self.sudo().search([("email", "=", email), ("create_date", ">=", now - timedelta(hours=1))], order="id desc")
        if recent and recent[0].create_date > now - RESEND_AFTER:
            raise UserError("Please wait a minute before asking for another code.")
        if len(recent) >= MAX_PER_HOUR:
            raise UserError("Too many codes requested for this email. Please try again in an hour.")
        code = self._new_code()
        self.sudo().create({"email": email, "purpose": purpose, "code_hash": self._hash(email, purpose, code),
                            "expires_at": now + CODE_TTL})
        self._send_mail(email, code)
        return True

    @api.model
    def _send_mail(self, email, code):
        Mail = self.env["mail.mail"].sudo()
        sender = self.env["ir.mail_server"].sudo()._get_default_from_address() or self.env.company.email
        mail = Mail.create({
            "subject": "Your verification code: %s" % code,
            "email_from": sender, "email_to": email, "auto_delete": True,
            "body_html": "<p>Your verification code is <b style=\"font-size:20px;letter-spacing:3px\">%s</b>.</p>"
                         "<p>It is valid for 10 minutes. If you did not ask for it, you can ignore this email.</p>" % code,
        })
        try:
            mail.send(raise_exception=True)
        except Exception:  # noqa: BLE001 - mail server problems must not leak details to the public
            _logger.warning("Could not send verification code mail", exc_info=True)
            raise UserError("We could not send the email right now. Please try again later.")

    # ------------------------------------------------------------------ verify
    @api.model
    def _verify(self, email, purpose, code, consume=True):
        """Return (record, error). A wrong code is RETURNED, not raised: an exception would roll back the attempt
        counter and make guessing the 6 digits free, so callers hand the message back as a normal response."""
        email = self._norm(email, purpose)
        code = re.sub(r"\D", "", code or "")
        rec = self.sudo().search([("email", "=", email), ("purpose", "=", purpose), ("used", "=", False)], order="id desc", limit=1)
        if not rec or rec.expires_at < fields.Datetime.now():
            return None, "Your code has expired. Please request a new one."
        if rec.attempts >= MAX_WRONG:
            return None, "Too many wrong codes. Please request a new one."
        if not hmac.compare_digest(rec.code_hash, self._hash(email, purpose, code)):
            rec.attempts += 1
            return None, "That code is not correct."
        if consume:
            rec.used = True
        return rec, None

    @api.model
    def _cron_cleanup(self):
        cutoff = fields.Datetime.now() - timedelta(days=1)
        self.sudo().search([("create_date", "<", cutoff)]).unlink()
        # guests who never started an attempt leave nothing worth keeping
        guests = self.env["res.partner"].sudo().search([("otm_is_guest", "=", True), ("create_date", "<", cutoff)])
        busy = self.env["otm.quiz.attempt"].sudo().search([("student_id", "in", guests.ids)]).student_id
        (guests - busy).unlink()
