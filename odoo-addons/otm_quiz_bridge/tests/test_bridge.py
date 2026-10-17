# -*- coding: utf-8 -*-
from datetime import timedelta

from odoo import fields
from odoo.tests.common import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestBridge(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        now = fields.Datetime.now()
        cls.question = cls.env["otm.quiz.question"].create({
            "question_text": "2+2?", "question_type": "mcq", "marks": 1,
            "option_ids": [(0, 0, {"option_text": "4", "is_correct": True}), (0, 0, {"option_text": "5"})],
        })
        cls.quiz = cls.env["otm.quiz"].create({
            "name": "Bridge Quiz", "quiz_start": now - timedelta(hours=1), "quiz_end": now + timedelta(days=1),
            "registration_start": now - timedelta(days=1), "registration_end": now + timedelta(hours=5),
            "duration_minutes": 10, "fixed_question_ids": [(6, 0, cls.question.ids)], "approval_required": True,
        })
        cls.quiz.action_publish()
        cls.batch = cls.env["student.batch"].create({"name": "B1"})
        Student = cls.env["student.details"]
        cls.s1 = Student.create({"name": "Asha", "email": "asha@example.com", "phone": "9876500001", "batch_id": cls.batch.id, "branch": "kochi"})
        cls.s2 = Student.create({"name": "Binu", "email": "binu@example.com", "phone": "9876500002", "batch_id": cls.batch.id, "branch": "kochi"})
        cls.s3 = Student.create({"name": "NoMail", "phone": "9876500003", "batch_id": cls.batch.id, "branch": "kochi"})
        cls.source = cls.env["leads.sources"].create({"name": "Quiz"})

    def _assign(self, **kw):
        w = self.env["otm.quiz.assign.wizard"].create(dict({"quiz_id": self.quiz.id, "send_setup_email": False}, **kw))
        w.action_assign()
        return w

    def test_batch_assign_creates_accounts_and_approved_registrations(self):
        w = self._assign(batch_ids=[(6, 0, self.batch.ids)])
        self.assertIn("2 newly assigned", w.result)
        self.assertIn("NoMail", w.result)  # reported, not silently dropped
        regs = self.env["otm.quiz.registration"].search([("quiz_id", "=", self.quiz.id)])
        self.assertEqual(len(regs), 2)
        self.assertTrue(all(r.state == "confirmed" for r in regs))  # approved even though quiz needs approval
        self.assertTrue(all(r.student_id.otm_is_quiz_student for r in regs))
        # idempotent
        w2 = self._assign(batch_ids=[(6, 0, self.batch.ids)])
        self.assertIn("0 newly assigned", w2.result)
        self.assertIn("2 already assigned", w2.result)
        self.assertEqual(self.env["otm.quiz.registration"].search_count([("quiz_id", "=", self.quiz.id)]), 2)

    def test_individual_assign_approves_waiting_registration(self):
        user = self.env["res.users"].with_context(no_reset_password=True).create({
            "name": "Asha", "login": "asha@example.com", "email": "asha@example.com", "password": "password123",
            "group_ids": [(6, 0, [self.env.ref("base.group_portal").id])]})
        user.partner_id.otm_is_quiz_student = True
        reg = self.env["otm.quiz.registration"].register(self.quiz, user.partner_id)
        self.assertEqual(reg.state, "registered")
        w = self._assign(student_ids=[(6, 0, self.s1.ids)])
        self.assertIn("1 approved", w.result)
        self.assertEqual(reg.state, "confirmed")

    def test_open_quiz_cannot_be_assigned(self):
        self.quiz.action_close()
        quiz = self.env["otm.quiz"].create({"name": "Open", "registration_required": False})
        from odoo.exceptions import UserError
        w = self.env["otm.quiz.assign.wizard"].create({"quiz_id": quiz.id, "student_ids": [(6, 0, self.s1.ids)]})
        with self.assertRaises(UserError):
            w.action_assign()

    def test_convert_to_leads_bulk_dedupe_and_link(self):
        self._assign(batch_ids=[(6, 0, self.batch.ids)])
        existing = self.env["leads.logic"].create({"name": "Old Binu", "phone_number": "+91 98765 00002",
                                                    "leads_source": self.source.id})
        w = self.env["otm.quiz.lead.wizard"].create({"quiz_id": self.quiz.id, "scope": "quiz", "leads_source": self.source.id})
        w.action_convert()
        self.assertIn("1 leads created, 1 linked", w.result)
        regs = self.env["otm.quiz.registration"].search([("quiz_id", "=", self.quiz.id)])
        self.assertTrue(all(r.lead_id for r in regs))
        self.assertIn(existing, regs.mapped("lead_id"))
        # converting again does not duplicate
        w2 = self.env["otm.quiz.lead.wizard"].create({"quiz_id": self.quiz.id, "scope": "quiz", "leads_source": self.source.id})
        w2.action_convert()
        self.assertIn("2 already converted", w2.result)
        self.assertEqual(self.env["leads.logic"].search_count([("leads_source", "=", self.source.id)]), 2)
