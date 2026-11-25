# -*- coding: utf-8 -*-
from datetime import timedelta

from odoo import fields
from odoo.exceptions import AccessError, ValidationError
from odoo.tests.common import TransactionCase, tagged

KEY = "a" * 64


@tagged("post_install", "-at_install")
class TestIntegrity(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.api = cls.env["otm.quiz.api"]
        cls.Event = cls.env["otm.quiz.attempt.event"]
        cls.student = cls.api.student_register("Integrity Kid", "int@example.com", "9876500201", "password123")

    def quiz(self, **kw):
        now = fields.Datetime.now()
        opts = [(0, 0, {"option_text": t, "is_correct": i == 0, "sequence": i}) for i, t in enumerate("ABCD")]
        q = self.env["otm.quiz.question"].create({"question_text": "q", "question_type": "mcq", "marks": 1.0, "option_ids": opts})
        quiz = self.env["otm.quiz"].create({
            "name": "Integrity Quiz", "registration_required": False,
            "quiz_start": now - timedelta(hours=1), "quiz_end": now + timedelta(days=1), "duration_minutes": 30,
            "passing_percentage": 50, "fixed_question_ids": [(6, 0, q.ids)], "maximum_attempts": 1, **kw})
        quiz.action_publish()
        return quiz

    def start(self, quiz):
        return self.api.start_attempt(self.student["partner_id"], quiz.public_id)["attempt_id"]

    def log(self, aid, kind):
        return self.api.log_event(self.student["partner_id"], aid, kind)

    def age_events(self, aid):
        # move logged events outside the de-duplication window so the next one counts again
        att = self.env["otm.quiz.attempt"].search([("public_id", "=", aid)])
        att.event_ids.write({"at": fields.Datetime.now() - timedelta(seconds=30)})

    def test_off_mode_logs_nothing(self):
        aid = self.start(self.quiz())
        self.assertEqual(self.log(aid, "blur"), {"count": 0, "max": 3, "terminated": False})
        self.assertFalse(self.Event.search([]))

    def test_warn_mode_counts_but_never_submits(self):
        aid = self.start(self.quiz(integrity_mode="warn", max_violations=1))
        for _ in range(3):
            r = self.log(aid, "hidden")
            self.age_events(aid)
        self.assertEqual(r["count"], 3)
        self.assertFalse(r["terminated"])
        self.assertEqual(self.env["otm.quiz.attempt"].search([("public_id", "=", aid)]).state, "in_progress")

    def test_strict_mode_auto_submits_at_limit(self):
        quiz = self.quiz(integrity_mode="strict", max_violations=3)
        aid = self.start(quiz)
        self.assertFalse(self.log(aid, "blur")["terminated"])
        self.age_events(aid)
        self.assertFalse(self.log(aid, "fullscreen_exit")["terminated"])
        self.age_events(aid)
        last = self.log(aid, "hidden")
        self.assertTrue(last["terminated"])
        att = self.env["otm.quiz.attempt"].search([("public_id", "=", aid)])
        self.assertIn(att.state, ("submitted", "evaluated", "expired"))
        self.assertIn("3 integrity violations", att.terminated_reason)
        self.assertTrue(self.api.get_attempt(self.student["partner_id"], aid)["finished"])

    def test_blur_and_hidden_together_count_once(self):
        aid = self.start(self.quiz(integrity_mode="strict", max_violations=5))
        self.log(aid, "blur")
        self.assertEqual(self.log(aid, "hidden")["count"], 1)  # same switch, inside the dedupe window
        self.assertEqual(len(self.Event.search([("attempt_id.public_id", "=", aid)])), 2)  # both still logged

    def test_paste_is_logged_but_not_a_violation(self):
        aid = self.start(self.quiz(integrity_mode="strict", max_violations=1))
        self.assertEqual(self.log(aid, "paste")["count"], 0)

    def test_unknown_kind_and_foreign_attempt_rejected(self):
        quiz = self.quiz(integrity_mode="strict")
        aid = self.start(quiz)
        self.assertEqual(self.log(aid, "<script>")["count"], 0)
        self.assertFalse(self.Event.search([("attempt_id.public_id", "=", aid)]))
        other = self.api.student_register("Other Kid", "int2@example.com", "9876500202", "password123")
        with self.assertRaises(AccessError):
            self.api.log_event(other["partner_id"], aid, "blur")

    def test_log_is_capped(self):
        aid = self.start(self.quiz(integrity_mode="warn"))
        for _ in range(210):
            self.log(aid, "paste")
        self.assertEqual(len(self.Event.search([("attempt_id.public_id", "=", aid)])), 200)

    def test_payload_carries_config_and_event_after_finish_is_ignored(self):
        quiz = self.quiz(integrity_mode="strict", max_violations=2, allow_calculator=True, allow_spreadsheet=True,
                         require_seb=True, seb_config_key=KEY)
        aid = self.start(quiz)
        data = self.api.get_attempt(self.student["partner_id"], aid)
        self.assertEqual(data["integrity"]["mode"], "strict")
        self.assertTrue(data["integrity"]["calculator"] and data["integrity"]["spreadsheet"])
        self.assertEqual(data["integrity"]["seb_key"], KEY)  # server-to-server only; the Next.js page strips it
        self.api.submit_attempt(self.student["partner_id"], aid)
        self.assertEqual(self.log(aid, "blur")["terminated"], False)  # finished attempts take no more events

    def test_seb_needs_valid_key_and_limits_are_checked(self):
        with self.assertRaises(ValidationError):
            self.quiz(require_seb=True, seb_config_key="short")
        with self.assertRaises(ValidationError):
            self.quiz(max_violations=0)
        self.assertTrue(self.quiz(require_seb=True, seb_config_key=KEY).require_seb)

    def test_api_has_no_json2_reserved_parameter_names(self):
        """Odoo 19 JSON-2 reserves `ids` and `context`: an @api.model method with such an argument answers HTTP 422 in production
        although a direct Python call works, which is why unit tests never caught it."""
        import inspect
        bad = []
        for name in dir(type(self.api)):
            if name.startswith("_") or not callable(getattr(type(self.api), name, None)):
                continue
            fn = getattr(type(self.api), name)
            if not getattr(fn, "__module__", "").startswith("odoo.addons.otm_quiz_management"):
                continue  # ORM methods such as browse(ids) are not our API
            params = inspect.signature(fn).parameters
            bad += ["%s(%s)" % (name, p) for p in params if p in ("ids", "context")]
        self.assertEqual(bad, [])

    def test_admin_call_publishes_with_record_ids(self):
        quiz = self.quiz()
        quiz.action_reset_draft()
        user = self.env.ref("base.user_admin")
        user.group_ids = [(4, self.env.ref("otm_quiz_management.group_otm_quiz_admin").id)]
        self.api.admin_call(user.id, "otm.quiz", quiz.ids, "action_publish")
        self.assertEqual(quiz.state, "published")
