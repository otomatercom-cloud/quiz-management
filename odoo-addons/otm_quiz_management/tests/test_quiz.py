# -*- coding: utf-8 -*-
import base64
from datetime import timedelta

from odoo import fields
from odoo.exceptions import AccessDenied, AccessError, UserError, ValidationError
from odoo.tests.common import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestQuiz(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Q = cls.env["otm.quiz.question"]
        cls.Quiz = cls.env["otm.quiz"]
        cls.api = cls.env["otm.quiz.api"]
        cls.partner = cls.api.student_register("Test Student", "student1@example.com", "9876543210", "password123")
        cls.pid = cls.partner["partner_id"]
        cls.student = cls.env["res.partner"].browse(cls.pid)

    # ---------------------------------------------------------------- helpers
    def mcq(self, text, correct=0, marks=2.0, neg=0.0, **kw):
        opts = [(0, 0, {"option_text": t, "is_correct": i == correct, "sequence": i}) for i, t in enumerate(("A", "B", "C", "D"))]
        return self.Q.create({"question_text": text, "question_type": "mcq", "marks": marks, "negative_marks": neg,
                              "option_ids": opts, **kw})

    def tf(self, text, answer=True, marks=1.0):
        return self.Q.create({"question_text": text, "question_type": "true_false", "marks": marks, "option_ids": [
            (0, 0, {"option_text": "True", "is_correct": answer, "sequence": 1}),
            (0, 0, {"option_text": "False", "is_correct": not answer, "sequence": 2})]})

    def quiz(self, questions, **kw):
        now = fields.Datetime.now()
        vals = {"name": "Test Quiz", "registration_start": now - timedelta(days=2), "registration_end": now + timedelta(hours=1),
                "quiz_start": now - timedelta(hours=1), "quiz_end": now + timedelta(days=1), "duration_minutes": 30,
                "passing_percentage": 50, "fixed_question_ids": [(6, 0, [q.id for q in questions])],
                "randomize_questions": False, "randomize_options": False, **kw}
        q = self.Quiz.create(vals)
        q.action_publish()
        return q

    def start(self, quiz):
        self.env["otm.quiz.registration"].register(quiz, self.student)
        return self.env["otm.quiz.attempt"].start_for(quiz, self.student)

    def answer(self, att, seq, idx):
        """Select option at position idx of the served option list."""
        ans = att.answer_ids.filtered(lambda a: a.sequence == seq)
        att.save_answer(self.student, seq, [ans.snapshot["options"][idx]["id"]])

    def correct_idx(self, att, seq):
        ans = att.answer_ids.filtered(lambda a: a.sequence == seq)
        return next(i for i, o in enumerate(ans.snapshot["options"]) if o["correct"])

    # ---------------------------------------------------------------- question rules
    def test_question_option_rules(self):
        with self.assertRaises(ValidationError):
            self.Q.create({"question_text": "bad", "question_type": "mcq", "option_ids": [
                (0, 0, {"option_text": "x", "is_correct": True}), (0, 0, {"option_text": "y", "is_correct": True})]})
        with self.assertRaises(ValidationError):
            self.Q.create({"question_text": "tf", "question_type": "true_false", "option_ids": [
                (0, 0, {"option_text": "True", "is_correct": True})]})

    def test_question_with_history_cannot_be_deleted(self):
        q = self.mcq("history")
        quiz = self.quiz(q)
        with self.assertRaises(UserError):
            q.unlink()
        self.assertTrue(quiz)

    # ---------------------------------------------------------------- evaluation
    def test_scoring_negative_marking_and_unanswered(self):
        qs = [self.mcq("q1"), self.mcq("q2"), self.mcq("q3")]
        quiz = self.quiz(qs, negative_marking_enabled=True, default_negative_marks=0.5, passing_percentage=20)
        att = self.start(quiz)
        self.answer(att, 1, self.correct_idx(att, 1))
        self.answer(att, 2, (self.correct_idx(att, 2) + 1) % 4)  # wrong
        att.submit()  # q3 unanswered -> 0, no penalty
        self.assertEqual(att.total_marks, 6.0)
        self.assertAlmostEqual(att.marks_obtained, 1.5)
        self.assertEqual(att.percentage, 25.0)
        self.assertEqual(att.result_status, "pass")
        self.assertEqual(att.state, "evaluated")

    def test_true_false_and_zero_floor(self):
        quiz = self.quiz([self.tf("t1", True, 1.0), self.tf("t2", False, 1.0)], negative_marking_enabled=True,
                         default_negative_marks=2.0)
        att = self.start(quiz)
        for seq in (1, 2):
            self.answer(att, seq, (self.correct_idx(att, seq) + 1) % 2)  # both wrong -> -4 floored to 0
        att.submit()
        self.assertEqual(att.marks_obtained, 0.0)
        self.assertEqual(att.result_status, "fail")

    def test_pass_boundary_is_inclusive(self):
        quiz = self.quiz([self.mcq("a", marks=1), self.mcq("b", marks=1)], passing_percentage=50)
        att = self.start(quiz)
        self.answer(att, 1, self.correct_idx(att, 1))
        att.submit()
        self.assertEqual(att.percentage, 50.0)
        self.assertEqual(att.result_status, "pass")

    def test_submit_is_idempotent_and_never_double_scores(self):
        quiz = self.quiz([self.mcq("a", marks=3)])
        att = self.start(quiz)
        self.answer(att, 1, self.correct_idx(att, 1))
        att.submit()
        att.submit()
        att._evaluate()
        self.assertEqual(att.marks_obtained, 3.0)

    # ---------------------------------------------------------------- timing / limits
    def test_deadline_enforced_server_side(self):
        quiz = self.quiz([self.mcq("a"), self.mcq("b")], grace_seconds=0)
        att = self.start(quiz)
        self.answer(att, 1, self.correct_idx(att, 1))
        att.sudo().write({"deadline_at": fields.Datetime.now() - timedelta(seconds=5)})
        with self.assertRaises(UserError):
            self.answer(att, 2, self.correct_idx(att, 2))
        att.submit()
        self.assertEqual(att.state, "expired")
        self.assertTrue(att.late_submission)
        self.assertEqual(att.marks_obtained, 2.0)  # only the in-time answer counts

    def test_cron_auto_submits_expired(self):
        quiz = self.quiz([self.mcq("a")], grace_seconds=0)
        att = self.start(quiz)
        att.sudo().write({"deadline_at": fields.Datetime.now() - timedelta(minutes=1)})
        self.env["otm.quiz.attempt"]._cron_expire_attempts()
        self.assertEqual(att.state, "expired")

    def test_attempt_limit_and_resume(self):
        quiz = self.quiz([self.mcq("a")], maximum_attempts=1)
        att = self.start(quiz)
        again = self.env["otm.quiz.attempt"].start_for(quiz, self.student)
        self.assertEqual(att, again)  # resume, not a second attempt
        att.submit()
        with self.assertRaises(UserError):
            self.env["otm.quiz.attempt"].start_for(quiz, self.student)

    def test_must_be_registered(self):
        quiz = self.quiz([self.mcq("a")])
        with self.assertRaises(UserError):
            self.env["otm.quiz.attempt"].start_for(quiz, self.student)

    def test_approval_required_blocks_start_until_approved(self):
        quiz = self.quiz([self.mcq("a")], approval_required=True)
        Reg = self.env["otm.quiz.registration"]
        reg = Reg.register(quiz, self.student)
        self.assertEqual(reg.state, "registered")
        with self.assertRaises(UserError):
            self.env["otm.quiz.attempt"].start_for(quiz, self.student)
        card = self.api._quiz_card(quiz, self.student)
        self.assertFalse(card["can_start"])
        reg.action_confirm()
        self.assertEqual(reg.state, "confirmed")
        self.assertTrue(self.api._quiz_card(quiz, self.student)["can_start"])
        self.assertTrue(self.env["otm.quiz.attempt"].start_for(quiz, self.student))

    def test_auto_approved_and_open_quiz(self):
        quiz = self.quiz([self.mcq("a")])
        self.assertEqual(self.env["otm.quiz.registration"].register(quiz, self.student).state, "confirmed")
        open_quiz = self.quiz([self.mcq("b")], registration_required=False)
        self.assertTrue(self.env["otm.quiz.attempt"].start_for(open_quiz, self.student))

    def test_registration_idempotent_and_unique(self):
        quiz = self.quiz([self.mcq("a")])
        Reg = self.env["otm.quiz.registration"]
        r1, r2 = Reg.register(quiz, self.student), Reg.register(quiz, self.student)
        self.assertEqual(r1, r2)
        self.assertEqual(quiz.registration_count, 1)
        with self.assertRaises(ValidationError):
            Reg.create({"quiz_id": quiz.id, "student_id": self.pid, "state": "confirmed"})

    def test_registration_limit_and_cancel(self):
        quiz = self.quiz([self.mcq("a")], registration_limit=1)
        Reg = self.env["otm.quiz.registration"]
        r = Reg.register(quiz, self.student)
        other = self.env["res.partner"].browse(self.api.student_register("Two", "two@example.com", "9876543211", "password123")["partner_id"])
        with self.assertRaises(UserError):
            Reg.register(quiz, other)
        r.cancel_by_student()
        self.assertEqual(quiz.registration_count, 0)
        self.assertEqual(quiz.cancelled_count, 1)
        Reg.register(quiz, other)  # slot freed

    # ---------------------------------------------------------------- pools
    def test_pool_random_selection_without_duplicates(self):
        fixed = self.mcq("fixed", subject="Pool")
        for i in range(6):
            self.mcq("pool %d" % i, subject="Pool")
        quiz = self.Quiz.create({
            "name": "Pool quiz", "quiz_start": fields.Datetime.now() - timedelta(hours=1),
            "quiz_end": fields.Datetime.now() + timedelta(days=1), "registration_required": False,
            "fixed_question_ids": [(6, 0, fixed.ids)],
            "question_pool_ids": [(0, 0, {"name": "P", "subject": "Pool", "questions_to_select": 3})]})
        self.assertEqual(quiz.question_total, 4)
        self.assertEqual(quiz.total_marks, 8.0)
        quiz.action_publish()
        att = self.env["otm.quiz.attempt"].start_for(quiz, self.student)
        ids = att.answer_ids.mapped("question_id").ids
        self.assertEqual(len(ids), 4)
        self.assertEqual(len(set(ids)), 4)

    def test_publish_blocks_invalid_pool(self):
        quiz = self.Quiz.create({
            "name": "Bad", "quiz_start": fields.Datetime.now(), "quiz_end": fields.Datetime.now() + timedelta(days=1),
            "registration_required": False,
            "question_pool_ids": [(0, 0, {"name": "P", "subject": "nothing-here", "questions_to_select": 2})]})
        with self.assertRaises(UserError):
            quiz.action_publish()

    # ---------------------------------------------------------------- scholarship
    def test_scholarship_boundaries_and_precedence(self):
        quiz = self.quiz([self.mcq("a", marks=100)], scholarship_enabled=True, course_fee=1000.0, passing_percentage=40,
                         scholarship_rule_ids=[
                             (0, 0, {"name": "90+", "minimum_percentage": 90, "scholarship_value": 50}),
                             (0, 0, {"name": "80", "minimum_percentage": 80, "maximum_percentage": 90, "scholarship_value": 30}),
                             (0, 0, {"name": "70", "minimum_percentage": 70, "maximum_percentage": 80, "scholarship_value": 15})])
        att = self.start(quiz)
        att.submit()
        att.sudo().write({"result_status": "pass"})
        cases = {89.99: "80", 90.0: "90+", 80.0: "80", 79.99: "70", 70.0: "70", 69.99: False}
        for pct, expected in cases.items():
            att.sudo().write({"percentage": pct, "scholarship_status": "pending"})
            att._compute_scholarship()
            self.assertEqual(att.scholarship_rule_id.name or False, expected, pct)
        att.sudo().write({"percentage": 95.0})
        att._compute_scholarship()
        self.assertEqual(att.scholarship_amount, 500.0)
        self.assertEqual(att.scholarship_status, "eligible")  # eligibility is not an award

    def test_scholarship_overlap_validation(self):
        quiz = self.quiz([self.mcq("a")], scholarship_enabled=True, scholarship_rule_ids=[
            (0, 0, {"name": "r1", "minimum_percentage": 50, "scholarship_value": 10})])
        with self.assertRaises(ValidationError):
            quiz.write({"scholarship_rule_ids": [(0, 0, {"name": "r2", "minimum_percentage": 60, "scholarship_value": 20})]})

    def test_scholarship_override_needs_admin_and_is_audited(self):
        quiz = self.quiz([self.mcq("a")], scholarship_enabled=True,
                         scholarship_rule_ids=[(0, 0, {"name": "r", "minimum_percentage": 0, "scholarship_value": 10})])
        att = self.start(quiz)
        att.submit()
        evaluator = self.env["res.users"].create({
            "name": "Ev", "login": "ev@example.com",
            "group_ids": [(6, 0, [self.env.ref("otm_quiz_management.group_otm_quiz_evaluator").id])]})
        with self.assertRaises(AccessError):
            att.with_user(evaluator).override_scholarship("approved", "x")
        att.override_scholarship("approved", "special case")
        self.assertTrue(self.env["otm.quiz.audit.log"].search_count([("event", "=", "scholarship_override")]))

    # ---------------------------------------------------------------- history / locks
    def test_history_survives_question_edit_and_quiz_is_locked(self):
        q = self.mcq("orig", marks=2)
        quiz = self.quiz([q])
        att = self.start(quiz)
        self.answer(att, 1, self.correct_idx(att, 1))
        att.submit()
        q.write({"question_text": "changed", "marks": 9})
        old, new = q.option_ids.filtered("is_correct"), q.option_ids.filtered(lambda o: not o.is_correct)[0]
        q.write({"option_ids": [(1, old.id, {"is_correct": False}), (1, new.id, {"is_correct": True})]})
        self.assertEqual(att.marks_obtained, 2.0)
        self.assertEqual(att.answer_ids.snapshot["text"], "orig")
        att._evaluate()
        self.assertEqual(att.marks_obtained, 2.0)
        with self.assertRaises(UserError):
            quiz.write({"duration_minutes": 5})
        with self.assertRaises(UserError):
            quiz.write({"state": "closed"})

    # ---------------------------------------------------------------- import
    def test_import_validation_and_import(self):
        csv_text = (
            "question_text,question_type,option_a,option_b,option_c,option_d,correct_answer,marks,negative_marks,subject,topic,difficulty,explanation,tags\n"
            "Capital of France?,mcq,Paris,Rome,Berlin,Madrid,A,1,0.25,Geo,EU,easy,,europe\n"
            "Sky is blue,true_false,,,,,True,1,0,Sci,,easy,,\n"
            "Bad row,mcq,x,,,,B,1,0,,,easy,,\n"
            "=cmd|' /C calc'!A0,mcq,a,b,,,A,1,0,,,easy,,\n"
            "Bad marks,mcq,a,b,,,A,-1,0,,,easy,,\n")
        data = base64.b64encode(csv_text.encode()).decode()
        res = self.env["otm.quiz.import.wizard"].api_run("q.csv", data, "validate")
        self.assertEqual((res["total"], res["valid"], res["invalid"]), (5, 2, 3))
        self.assertTrue(any("formula" in r["message"] for r in res["rows"]))
        self.assertIn("row_number", res["error_report_csv"])
        with self.assertRaises(UserError):  # invalid rows are never silently skipped
            self.env["otm.quiz.import.wizard"].api_run("q.csv", data, "import")
        wiz = self.env["otm.quiz.import.wizard"].create({"file": data, "filename": "q.csv", "import_valid_only": True})
        wiz.action_validate()
        before = self.Q.search_count([])
        wiz.action_import()
        self.assertEqual(self.Q.search_count([]) - before, 2)
        wiz2 = self.env["otm.quiz.import.wizard"].create({"file": data, "filename": "q.csv"})
        wiz2.action_validate()
        self.assertTrue(any("already exists" in l.message for l in wiz2.line_ids if l.message))  # duplicates caught

    # ---------------------------------------------------------------- security / api
    def test_roles_acl(self):
        evaluator = self.env["res.users"].create({
            "name": "Ev2", "login": "ev2@example.com",
            "group_ids": [(6, 0, [self.env.ref("otm_quiz_management.group_otm_quiz_evaluator").id])]})
        with self.assertRaises(AccessError):
            self.Q.with_user(evaluator).create({"question_text": "x", "question_type": "descriptive"})
        portal = self.env["res.users"].search([("login", "=", "student1@example.com")])
        with self.assertRaises(AccessError):
            self.Quiz.with_user(portal).search([])

    def test_evaluator_only_sees_assigned_attempts(self):
        quiz = self.quiz([self.mcq("a")])
        att = self.start(quiz)
        att.submit()
        ev = self.env["res.users"].create({
            "name": "Ev3", "login": "ev3@example.com",
            "group_ids": [(6, 0, [self.env.ref("otm_quiz_management.group_otm_quiz_evaluator").id])]})
        self.assertFalse(self.env["otm.quiz.attempt"].with_user(ev).search([("id", "=", att.id)]))
        quiz.evaluator_ids = [(4, ev.id)]
        self.assertTrue(self.env["otm.quiz.attempt"].with_user(ev).search([("id", "=", att.id)]))

    def test_api_never_leaks_answer_key_and_checks_ownership(self):
        quiz = self.quiz([self.mcq("a")])
        self.api.register_quiz(self.pid, quiz.public_id)
        started = self.api.start_attempt(self.pid, quiz.public_id)
        payload = self.api.get_attempt(self.pid, started["attempt_id"])
        self.assertNotIn("correct", str(payload))
        self.assertNotIn("explanation", str(payload))
        other = self.api.student_register("Other", "other@example.com", "9876543299", "password123")
        with self.assertRaises(AccessError):
            self.api.get_attempt(other["partner_id"], started["attempt_id"])
        with self.assertRaises(UserError):
            self.api.save_answer(self.pid, started["attempt_id"], 1, option_ids=[999999999])
        receipt = self.api.submit_attempt(self.pid, started["attempt_id"])
        self.assertEqual(self.api.submit_attempt(self.pid, started["attempt_id"])["id"], receipt["id"])

    def test_api_result_hidden_until_published(self):
        quiz = self.quiz([self.mcq("a")], show_results_immediately=False)
        self.api.register_quiz(self.pid, quiz.public_id)
        started = self.api.start_attempt(self.pid, quiz.public_id)
        self.api.submit_attempt(self.pid, started["attempt_id"])
        res = self.api.result_detail(self.pid, started["attempt_id"])
        self.assertFalse(res["visible"])
        self.assertNotIn("marks_obtained", res)
        quiz.action_publish_results()
        self.assertTrue(self.api.result_detail(self.pid, started["attempt_id"])["visible"])

    def test_student_auth(self):
        self.assertEqual(self.api.student_login("student1@example.com", "password123")["partner_id"], self.pid)
        with self.assertRaises(AccessDenied):
            self.api.student_login("student1@example.com", "wrong-password")
        with self.assertRaises(UserError):
            self.api.student_register("Dup", "student1@example.com", "9876543210", "password123")

    def test_descriptive_manual_grading_keeps_result_pending(self):
        d = self.Q.create({"question_text": "Explain", "question_type": "descriptive", "marks": 10})
        quiz = self.quiz([d, self.mcq("m", marks=10)], passing_percentage=50)
        att = self.start(quiz)
        att.submit()
        self.assertEqual(att.result_status, "pending")
        self.assertEqual(att.scholarship_status, "not_applicable")
        desc = att.answer_ids.filtered(lambda a: a.question_type == "descriptive")
        desc.grade_descriptive(8, "good")
        self.assertIn(att.result_status, ("pass", "fail"))
        self.assertEqual(att.marks_obtained, 8.0)

    def test_report_and_dashboard(self):
        quiz = self.quiz([self.mcq("a")])
        att = self.start(quiz)
        att.submit()
        admin = self.env.ref("base.user_admin")
        dash = self.api.admin_dashboard(admin.id)
        self.assertGreaterEqual(dash["cards"]["total_quizzes"], 1)
        rep = self.api.admin_reports(admin.id, quiz.public_id)
        self.assertEqual(rep["completed"], 1)
        self.assertEqual(rep["ranking"][0]["rank"], 1)
        html = self.env["ir.actions.report"]._render_qweb_html("otm_quiz_management.action_report_attempt_result", att.ids)
        self.assertIn(b"Test Student", html[0])

    # ---------------------------------------------------------------- teachers
    def _teacher(self, email="t1@example.com"):
        admin = self.env.ref("base.user_admin")
        res = self.api.admin_create_teacher(admin.id, "Teacher One", email, "password123")
        return admin, res

    def test_teacher_sees_and_edits_only_own_questions(self):
        admin, t1 = self._teacher()
        _, t2 = self._teacher("t2@example.com")
        vals = {"question_text": "Teacher Q", "question_type": "mcq", "marks": 1,
                "option_ids": [(0, 0, {"option_text": "x", "is_correct": True}), (0, 0, {"option_text": "y"})]}
        qid = self.api.admin_create(t1["id"], "otm.quiz.question", vals)
        self.mcq("Manager Q")  # authored by another user
        mine = self.api.admin_search_read(t1["id"], "otm.quiz.question", fields=["question_text"])
        self.assertEqual([r["question_text"] for r in mine["records"]], ["Teacher Q"])
        self.assertEqual(self.api.admin_search_read(t2["id"], "otm.quiz.question")["total"], 0)
        with self.assertRaises(AccessError):  # another teacher cannot change it
            self.api.admin_write(t2["id"], "otm.quiz.question", [qid], {"marks": 5})
        self.api.admin_write(t1["id"], "otm.quiz.question", [qid], {"marks": 3})
        allq = self.api.admin_search_read(admin.id, "otm.quiz.question", domain=[("question_text", "=", "Teacher Q")],
                                         fields=["marks", "create_uid"])
        self.assertEqual(allq["records"][0]["create_uid"][0], t1["id"])
        self.assertEqual(allq["records"][0]["marks"], 3)

    def test_teacher_cannot_touch_quizzes_or_admin_functions(self):
        _, t1 = self._teacher()
        with self.assertRaises(AccessError):
            self.api.admin_create(t1["id"], "otm.quiz", {"name": "Nope"})
        with self.assertRaises(AccessError):
            self.api.admin_search_read(t1["id"], "otm.quiz.attempt")
        with self.assertRaises(AccessError):
            self.api.admin_teachers(t1["id"])
        with self.assertRaises(AccessError):
            self.api.admin_export_questions(t1["id"], include_answers=True)
        self.assertTrue(self.api.admin_import_template(t1["id"])["csv"])  # allowed
        self.assertIn("teacher", self.api.admin_login("t1@example.com", "password123")["roles"])

    def test_teacher_import_and_deactivate(self):
        admin, t1 = self._teacher()
        csv_text = ("question_text,question_type,option_a,option_b,option_c,option_d,correct_answer,marks\n"
                    "Capital of India?,mcq,Delhi,Mumbai,Kolkata,Chennai,A,1\n")
        res = self.api.admin_import(t1["id"], "q.csv", base64.b64encode(csv_text.encode()).decode(), "import")
        self.assertEqual(res["imported"], 1)
        own = self.api.admin_search_read(t1["id"], "otm.quiz.question")
        self.assertEqual(own["total"], 1)
        self.assertEqual([t["id"] for t in self.api.admin_teachers(admin.id)], [t1["id"]])
        self.api.admin_set_teacher_active(admin.id, t1["id"], False)
        with self.assertRaises(AccessError):
            self.api.admin_search_read(t1["id"], "otm.quiz.question")
