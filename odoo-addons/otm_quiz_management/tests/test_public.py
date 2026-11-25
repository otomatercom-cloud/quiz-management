# -*- coding: utf-8 -*-
from datetime import timedelta
from unittest.mock import patch

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests.common import TransactionCase, tagged

OTP = "odoo.addons.otm_quiz_management.models.otp.OtmQuizEmailOtp._new_code"


@tagged("post_install", "-at_install")
class TestPublic(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.api = cls.env["otm.quiz.api"]
        cls.Otp = cls.env["otm.quiz.email.otp"]
        cls.params = cls.env["ir.config_parameter"].sudo()

    def quiz(self, **kw):
        now = fields.Datetime.now()
        opts = [(0, 0, {"option_text": t, "is_correct": i == 0, "sequence": i}) for i, t in enumerate("ABCD")]
        q = self.env["otm.quiz.question"].create({"question_text": "q1", "question_type": "mcq", "marks": 2.0, "option_ids": opts})
        quiz = self.env["otm.quiz"].create({
            "name": "Open Quiz", "registration_required": False, "allow_guest": True,
            "quiz_start": now - timedelta(hours=1), "quiz_end": now + timedelta(days=1), "duration_minutes": 30,
            "passing_percentage": 50, "fixed_question_ids": [(6, 0, q.ids)], "randomize_questions": False,
            "randomize_options": False, "maximum_attempts": 1, **kw})
        quiz.action_publish()
        return quiz

    # ---------------------------------------------------------------- config
    def test_config_defaults_to_off_and_toggles(self):
        self.assertFalse(self.api.public_config()["require_email_otp"])
        self.params.set_param("otm_quiz.require_email_otp", "1")
        self.assertTrue(self.api.public_config()["require_email_otp"])

    # ---------------------------------------------------------------- email codes
    def test_register_needs_valid_code_when_required(self):
        self.params.set_param("otm_quiz.require_email_otp", "1")
        args = ("Otp Student", "otp@example.com", "9876500001", "password123")
        self.assertIn("expired", self.api.student_register(*args, otp="123456")["otp_error"])  # none requested yet
        with patch(OTP, return_value="123456"):
            self.api.student_request_otp("otp@example.com", "register")
        self.assertIn("not correct", self.api.student_register(*args, otp="000000")["otp_error"])
        with self.assertRaises(UserError):  # weak password must not burn the code
            self.api.student_register("Otp Student", "otp@example.com", "9876500001", "short", otp="123456")
        self.assertTrue(self.api.student_register(*args, otp="123456")["partner_id"])
        self.assertIn("otp_error", self.api.student_register("Other", "otp@example.com", "9876500002", "password123", otp="123456"))

    def test_register_without_otp_when_not_required(self):
        self.assertTrue(self.api.student_register("Plain", "plain@example.com", "9876500003", "password123")["partner_id"])

    def test_wrong_guesses_lock_the_code(self):
        with patch(OTP, return_value="654321"):
            self.Otp._issue("lock@example.com", "register")
        for _ in range(5):
            self.assertEqual(self.Otp._verify("lock@example.com", "register", "111111")[1], "That code is not correct.")
        rec, err = self.Otp._verify("lock@example.com", "register", "654321")  # right code, but locked
        self.assertIsNone(rec)
        self.assertIn("Too many wrong codes", err)

    def test_code_expiry_cooldown_and_hourly_cap(self):
        with patch(OTP, return_value="222222"):
            self.Otp._issue("exp@example.com", "guest")
            with self.assertRaisesRegex(UserError, "wait a minute"):
                self.Otp._issue("exp@example.com", "guest")
        rec = self.Otp.search([("email", "=", "exp@example.com")])
        self.assertNotIn("222222", rec.code_hash)  # only a keyed hash is stored
        rec.expires_at = fields.Datetime.now() - timedelta(minutes=1)
        self.assertIn("expired", self.Otp._verify("exp@example.com", "guest", "222222")[1])
        for i in range(4):  # 1 existing + 4 more = hourly cap of 5
            self.Otp.create({"email": "exp@example.com", "purpose": "guest", "code_hash": "x", "expires_at": rec.expires_at,
                             "create_date": fields.Datetime.now() - timedelta(minutes=5 + i)})
        self.env.flush_all()
        self.env.cr.execute("UPDATE otm_quiz_email_otp SET create_date = now() - interval '5 minutes' WHERE email = 'exp@example.com'")
        self.Otp.invalidate_model()
        with self.assertRaisesRegex(UserError, "Too many codes"):
            self.Otp._issue("exp@example.com", "guest")

    def test_request_otp_for_existing_account_is_refused(self):
        self.api.student_register("Dup", "dup@example.com", "9876500004", "password123")
        with self.assertRaises(UserError):
            self.api.student_request_otp("dup@example.com", "register")

    # ---------------------------------------------------------------- guests
    def test_guest_can_take_open_quiz_and_see_result(self):
        quiz = self.quiz()
        out = self.api.guest_start(quiz.public_id, "Guest One", "98765 00010")
        pid = out["partner_id"]
        att = self.api.get_attempt(pid, out["attempt_id"])
        self.assertEqual(len(att["questions"]), 1)
        self.api.save_answer(pid, out["attempt_id"], 1, [att["questions"][0]["options"][0]["id"]])
        self.api.submit_attempt(pid, out["attempt_id"])
        res = self.api.result_detail(pid, out["attempt_id"])
        self.assertEqual(res["state"], "evaluated")
        guest = self.env["res.partner"].browse(pid)
        self.assertTrue(guest.otm_is_guest)
        self.assertFalse(self.env["res.users"].search([("partner_id", "=", pid)]))  # no login
        self.assertFalse(self.env["otm.quiz.xp.log"].search([("student_id", "=", pid)]))  # no XP for guests

    def test_guest_is_locked_out_of_the_portal(self):
        quiz = self.quiz()
        pid = self.api.guest_start(quiz.public_id, "Guest Two", "9876500011")["partner_id"]
        for call in (lambda: self.api.student_profile(pid), lambda: self.api.student_rooms(pid),
                     lambda: self.api.student_stats(pid), lambda: self.api.my_results(pid),
                     lambda: self.api.register_quiz(pid, quiz.public_id), lambda: self.api.student_dashboard(pid),
                     lambda: self.api.student_set_avatar(pid, "fox", "Guest Fox")):
            with self.assertRaises(AccessError):
                call()

    def test_guest_cannot_start_other_quizzes(self):
        quiz = self.quiz()
        guest = self.env["res.partner"].browse(self.api.guest_start(quiz.public_id, "Guest Three", "9876500012")["partner_id"])
        closed = self.quiz(allow_guest=False)
        with self.assertRaisesRegex(UserError, "free account"):
            self.env["otm.quiz.attempt"].start_for(closed, guest)
        with self.assertRaisesRegex(UserError, "needs an account"):
            self.api.guest_start(closed.public_id, "Guest Three", "9876500012")

    def test_guest_attempt_cap_follows_the_person_not_the_session(self):
        quiz = self.quiz()  # maximum_attempts = 1
        self.api.guest_start(quiz.public_id, "Repeat Guest", "+91 98765 00013")
        with self.assertRaisesRegex(UserError, "already used"):
            self.api.guest_start(quiz.public_id, "Repeat Guest Again", "9876500013")  # same last 10 digits, new session
        with self.assertRaisesRegex(UserError, "already used"):
            self.api.guest_start(quiz.public_id, "Repeat Guest", "09876500013")

    def test_guest_flag_rules(self):
        with self.assertRaises(ValidationError):
            self.quiz(registration_required=True)
        room = self.env["otm.quiz.room"].create({"name": "R"})
        with self.assertRaises(ValidationError):
            self.quiz(room_ids=[(6, 0, room.ids)])
        quiz = self.quiz()
        self.assertTrue(self.api.public_quiz(quiz.public_id)["allow_guest"])

    def test_guest_needs_verified_email_when_required(self):
        self.params.set_param("otm_quiz.require_email_otp", "1")
        quiz = self.quiz()
        with self.assertRaisesRegex(UserError, "email"):
            self.api.guest_start(quiz.public_id, "No Mail", "9876500014")
        with patch(OTP, return_value="333333"):
            self.api.student_request_otp("g@example.com", "guest")
        self.assertIn("not correct", self.api.guest_start(quiz.public_id, "Bad Code", "9876500014", "g@example.com", "000000")["otp_error"])
        self.assertTrue(self.api.guest_start(quiz.public_id, "Good Code", "9876500014", "g@example.com", "333333")["attempt_id"])

    def test_cleanup_removes_old_codes_and_idle_guests_only(self):
        quiz = self.quiz()
        busy = self.api.guest_start(quiz.public_id, "Busy Guest", "9876500015")["partner_id"]
        idle = self.env["res.partner"].create({"name": "Idle Guest", "otm_is_quiz_student": True, "otm_is_guest": True})
        self.env.cr.execute("UPDATE res_partner SET create_date = now() - interval '3 days' WHERE id IN %s", [(busy, idle.id)])
        self.Otp._cron_cleanup()
        self.assertFalse(idle.exists())
        self.assertTrue(self.env["res.partner"].browse(busy).exists())
