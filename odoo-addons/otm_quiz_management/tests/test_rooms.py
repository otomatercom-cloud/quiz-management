# -*- coding: utf-8 -*-
import base64
from datetime import timedelta

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests.common import TransactionCase, tagged

PNG = base64.b64encode(
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x9a\xa0\xa0\x00\x00\x00\x00IEND\xaeB`\x82").decode()


@tagged("post_install", "-at_install")
class TestRooms(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.api = cls.env["otm.quiz.api"]
        cls.Room = cls.env["otm.quiz.room"]
        cls.a = cls.api.student_register("Asha Real Name", "asha@example.com", "9876543210", "password123")["partner_id"]
        cls.b = cls.api.student_register("Bala Real Name", "bala@example.com", "9876543211", "password123")["partner_id"]
        cls.klass = cls.Room.create({"name": "10th Standard"})
        cls.maths = cls.Room.create({"name": "Maths", "parent_id": cls.klass.id})

    def mcq(self, text, marks=2.0):
        opts = [(0, 0, {"option_text": t, "is_correct": i == 0, "sequence": i}) for i, t in enumerate("ABCD")]
        return self.env["otm.quiz.question"].create({"question_text": text, "question_type": "mcq", "marks": marks, "option_ids": opts})

    def quiz(self, rooms=None, **kw):
        now = fields.Datetime.now()
        q = self.env["otm.quiz"].create({
            "name": "Room Quiz", "registration_required": False, "quiz_start": now - timedelta(hours=1),
            "quiz_end": now + timedelta(days=1), "duration_minutes": 30, "passing_percentage": 50,
            "fixed_question_ids": [(6, 0, [self.mcq("q1").id])], "randomize_questions": False,
            "randomize_options": False, "maximum_attempts": 3, "subject": "Maths",
            "room_ids": [(6, 0, (rooms or self.maths).ids)], **kw})
        q.action_publish()
        return q

    def take(self, quiz, pid, correct=True):
        att = self.env["otm.quiz.attempt"].start_for(quiz, self.env["res.partner"].browse(pid))
        ans = att.answer_ids[0]
        pick = next(o["id"] for o in ans.snapshot["options"] if o["correct"] == correct)
        att.save_answer(att.student_id, 1, [pick])
        att.submit()
        return att

    # ---------------------------------------------------------------- structure
    def test_two_levels_only(self):
        with self.assertRaises(ValidationError):
            self.Room.create({"name": "Algebra", "parent_id": self.maths.id})
        with self.assertRaises(ValidationError):
            self.klass.parent_id = self.klass

    def test_join_modes_and_subject_access(self):
        self.assertEqual(self.api.student_join_room(self.a, self.klass.public_id)["membership"], "approved")
        self.assertIn(self.maths, self.Room._accessible_for(self.env["res.partner"].browse(self.a)))
        with self.assertRaises(UserError):
            self.api.student_join_room(self.a, self.maths.public_id)  # subject rooms follow the class room
        self.klass.access_mode = "approval"
        self.assertEqual(self.api.student_join_room(self.b, self.klass.public_id)["membership"], "pending")
        self.assertFalse(self.Room._accessible_for(self.env["res.partner"].browse(self.b)))
        self.env["otm.quiz.room.member"].search([("student_id", "=", self.b)]).action_approve()
        self.assertTrue(self.Room._accessible_for(self.env["res.partner"].browse(self.b)))
        self.klass.access_mode = "invite"
        self.api.student_leave_room(self.a, self.klass.public_id)
        with self.assertRaises(UserError):
            self.api.student_join_room(self.a, self.klass.public_id)

    # ---------------------------------------------------------------- room-restricted quizzes
    def test_room_quiz_is_members_only_everywhere(self):
        quiz = self.quiz()
        self.assertNotIn(quiz.public_id, [x["id"] for x in self.api.public_quizzes()["items"]])
        with self.assertRaises(UserError):
            self.api.public_quiz(quiz.public_id)
        self.assertNotIn(quiz.public_id, [x["id"] for x in self.api.student_quizzes(self.a)["items"]])
        with self.assertRaises(UserError):
            self.api.start_attempt(self.a, quiz.public_id)
        self.api.student_join_room(self.a, self.klass.public_id)
        self.assertIn(quiz.public_id, [x["id"] for x in self.api.student_quizzes(self.a)["items"]])
        self.assertTrue(self.api.start_attempt(self.a, quiz.public_id)["attempt_id"])
        with self.assertRaises(UserError):  # non-member still blocked
            self.api.start_attempt(self.b, quiz.public_id)

    def test_locked_room_hides_content(self):
        self.quiz()
        d = self.api.student_room(self.b, self.maths.public_id)
        self.assertTrue(d["locked"])
        self.assertNotIn("quizzes", d)
        self.api.student_join_room(self.b, self.klass.public_id)
        d = self.api.student_room(self.b, self.maths.public_id)
        self.assertFalse(d["locked"])
        self.assertEqual(len(d["quizzes"]), 1)

    # ---------------------------------------------------------------- XP, stats, leaderboard
    def test_xp_best_attempt_only_and_leaderboard_privacy(self):
        quiz = self.quiz()
        self.api.student_join_room(self.a, self.klass.public_id)
        self.api.student_join_room(self.b, self.klass.public_id)
        self.take(quiz, self.a, correct=False)
        xp = self.env["otm.quiz.xp.log"]
        self.assertEqual(xp.search([("student_id", "=", self.a)]).xp, 0)
        self.take(quiz, self.a, correct=True)  # best attempt wins: 100% -> 200 + 20 pass bonus
        self.assertEqual(xp.search([("student_id", "=", self.a)]).xp, 220)
        self.take(quiz, self.a, correct=False)  # a worse retry never lowers XP
        self.assertEqual(xp.search([("student_id", "=", self.a)]).xp, 220)
        self.assertEqual(xp.search_count([("student_id", "=", self.a)]), 1)
        self.take(quiz, self.b, correct=True)
        board = self.api.student_room(self.a, self.klass.public_id)["leaderboard"]
        self.assertEqual(len(board["top"]), 2)
        blob = str(board)
        for secret in ("Asha", "Bala", "9876543210", "asha@example.com"):
            self.assertNotIn(secret, blob)
        self.assertEqual(board["me"]["xp"], 220)

    def test_stats_badges_and_level(self):
        quiz = self.quiz()
        self.api.student_join_room(self.a, self.klass.public_id)
        self.take(quiz, self.a, correct=True)
        st = self.api.student_stats(self.a)
        self.assertEqual(st["xp"], 220)
        self.assertEqual(st["level"], 2)
        self.assertEqual(st["streak"], 1)
        earned = {b["key"] for b in st["badges"] if b["earned"]}
        self.assertEqual(earned, {"first_quiz", "perfect"})
        self.assertEqual(st["subjects"][0]["subject"], "Maths")

    # ---------------------------------------------------------------- avatar and photo
    def test_avatar_rules(self):
        with self.assertRaises(UserError):
            self.api.student_set_avatar(self.a, "fox", "x!")  # bad nickname
        with self.assertRaises(UserError):
            self.api.student_set_avatar(self.a, "dragon", "Cool Fox")  # unknown character
        with self.assertRaises(UserError):
            self.api.student_set_avatar(self.a, "photo", "Cool Fox", False, PNG)  # no guardian consent
        with self.assertRaises(UserError):
            self.api.student_set_avatar(self.a, "photo", "Cool Fox", True, base64.b64encode(b"<script>x</script>").decode())
        out = self.api.student_set_avatar(self.a, "owl", "Cool Fox")
        self.assertEqual((out["avatar"], out["nickname"], out["has_photo"]), ("owl", "Cool Fox", False))
        out = self.api.student_set_avatar(self.a, "photo", "Cool Fox", True, PNG)
        self.assertEqual((out["avatar"], out["has_photo"]), ("photo", True))
        self.assertTrue(self.api.student_photo(self.a))
        self.assertFalse(self.api.student_photo(self.b))
        out = self.api.student_set_avatar(self.a, "fox", "Cool Fox", False)  # consent withdrawn removes the photo
        self.assertFalse(out["has_photo"])

    # ---------------------------------------------------------------- announcements
    def test_only_room_teachers_can_post(self):
        admin = self.env.ref("base.user_admin")
        t = self.api.admin_create_teacher(admin.id, "Teacher One", "t1@example.com", "password123")
        teacher = self.env["res.users"].browse(t["id"])
        Post = self.env["otm.quiz.room.post"]
        with self.assertRaises(AccessError):
            Post.with_user(teacher).create({"room_id": self.maths.id, "body": "Hello class"})
        self.maths.teacher_ids = [(4, teacher.id)]
        post = Post.with_user(teacher).create({"room_id": self.maths.id, "body": "Hello class"})
        self.api.student_join_room(self.a, self.klass.public_id)
        posts = self.api.student_room(self.a, self.maths.public_id)["posts"]
        self.assertEqual([p["body"] for p in posts], ["Hello class"])
        self.assertEqual(posts[0]["author"], "Teacher One")
        post.with_user(teacher).unlink()
