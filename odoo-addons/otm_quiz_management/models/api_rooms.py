# -*- coding: utf-8 -*-
"""Rooms, XP/levels/badges/streaks and avatars for the student community UI (extends otm.quiz.api)."""
import base64
import re
from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError

from .api import _iso
from .gamification import XP_PER_LEVEL, level_of

AVATARS = ("fox", "owl", "robot", "cat", "bear")
NICK_RE = re.compile(r"^[A-Za-z0-9_ ]{3,20}$")
MAX_PHOTO_B64 = 1_500_000  # ~1.1 MB decoded; the browser resizes to 256 px before upload
IMAGE_MAGIC = (b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"RIFF")  # jpeg, png, webp
LEADERBOARD_DAYS = 7


class OtmQuizApiRooms(models.AbstractModel):
    _inherit = "otm.quiz.api"

    # ================================================================== identity (public: nickname + character only)
    def _nickname(self, p):
        return p.otm_nickname or "Player%d" % (1000 + p.id)

    def _public_identity(self, p):
        # real names, phone numbers and photos are never part of anything other students can see
        return {"nickname": self._nickname(p), "avatar": p.otm_avatar if p.otm_avatar in AVATARS else "fox"}

    def _student_payload(self, p):
        data = super()._student_payload(p)
        data.update(nickname=self._nickname(p), avatar=p.otm_avatar or "fox", has_photo=bool(p.otm_photo),
                    photo_consent=bool(p.otm_photo_consent))
        return data

    @api.model
    def student_set_avatar(self, partner_id, avatar, nickname, photo_consent=False, photo_b64=None, remove_photo=False):
        p = self._partner(partner_id)
        nickname = (nickname or "").strip()
        if not NICK_RE.match(nickname):
            raise UserError("Nickname must be 3 to 20 letters, numbers, spaces or underscores.")
        if avatar not in AVATARS + ("photo",):
            raise UserError("Please choose one of the characters.")
        vals = {"otm_nickname": nickname, "otm_photo_consent": bool(photo_consent)}
        if remove_photo or not photo_consent:
            vals["otm_photo"] = False
        if photo_b64 and photo_consent:
            if len(photo_b64) > MAX_PHOTO_B64:
                raise UserError("That photo is too large. Please choose a smaller one.")
            try:
                raw = base64.b64decode(photo_b64, validate=True)
            except Exception:  # noqa: BLE001
                raise UserError("That photo could not be read.")
            if not raw.startswith(IMAGE_MAGIC):
                raise UserError("Please upload a JPEG, PNG or WebP photo.")
            vals["otm_photo"] = photo_b64
        has_photo = bool(vals["otm_photo"]) if "otm_photo" in vals else bool(p.otm_photo)
        if avatar == "photo":
            if not photo_consent:
                raise UserError("A parent or guardian must agree before a photo can be used.")
            if not has_photo:
                raise UserError("Please upload a photo first.")
        vals["otm_avatar"] = avatar if avatar != "photo" or has_photo else "fox"
        p.write(vals)
        return self._student_payload(p)

    @api.model
    def student_photo(self, partner_id):
        p = self._partner(partner_id)
        return p.otm_photo.decode() if p.otm_photo else False

    # ================================================================== XP, level, streak, badges
    def _streak(self, p):
        now = fields.Datetime.now()
        atts = self.env["otm.quiz.attempt"].sudo().search(
            [("student_id", "=", p.id), ("state", "in", ("submitted", "evaluated")),
             ("submitted_at", ">=", now - timedelta(days=400))])
        days = {a.submitted_at.date() for a in atts if a.submitted_at}
        today = now.date()
        cur = today if today in days else today - timedelta(days=1)
        streak = 0
        while cur in days:
            streak += 1
            cur -= timedelta(days=1)
        return streak

    @api.model
    def student_stats(self, partner_id):
        p = self._partner(partner_id)
        Att = self.env["otm.quiz.attempt"].sudo()
        logs = self.env["otm.quiz.xp.log"].sudo().search([("student_id", "=", p.id)])
        xp = sum(logs.mapped("xp"))
        week = fields.Datetime.now() - timedelta(days=LEADERBOARD_DAYS)
        weekly = sum(logs.filtered(lambda l: l.awarded_on >= week).mapped("xp"))
        done = Att.search([("student_id", "=", p.id), ("state", "=", "evaluated")])
        visible = done.filtered(self._result_visible)
        subjects = {}
        for a in visible:
            s = subjects.setdefault(a.quiz_id.subject or "General", {"pct": 0.0, "n": 0, "secs": 0})
            s["pct"] += a.percentage
            s["n"] += 1
            s["secs"] += a.time_taken_seconds or 0
        streak = self._streak(p)
        perfect = any(a.percentage >= 100 for a in visible)
        badges = [
            {"key": "first_quiz", "label": "First Quiz", "earned": bool(done)},
            {"key": "perfect", "label": "100% Score", "earned": perfect},
            {"key": "streak5", "label": "5-day Streak", "earned": streak >= 5},
            {"key": "ten_quizzes", "label": "10 Quizzes", "earned": len(done) >= 10},
            {"key": "xp1000", "label": "1,000 XP", "earned": xp >= 1000},
        ]
        return {
            "xp": xp, "level": level_of(xp), "xp_per_level": XP_PER_LEVEL, "xp_in_level": xp % XP_PER_LEVEL,
            "weekly_xp": weekly, "streak": streak, "quizzes_done": len(done), "badges": badges,
            "subjects": [{"subject": k, "average": round(v["pct"] / v["n"], 2), "attempts": v["n"],
                          "minutes": round(v["secs"] / 60.0, 1)} for k, v in sorted(subjects.items())],
            "identity": self._public_identity(p),
        }

    # ================================================================== rooms (student)
    def _room_by_public(self, public_id):
        room = self.env["otm.quiz.room"].sudo().search([("public_id", "=", public_id)], limit=1)
        if not room:
            raise UserError("Room not found.")
        return room

    def _membership(self, p):
        return {m.room_id.id: m.state for m in self.env["otm.quiz.room.member"].sudo().search([("student_id", "=", p.id)])}

    def _room_card(self, room, member_states):
        return {
            "id": room.public_id, "name": room.name, "description": room.description or "", "color": room.color or "#1D4ED8",
            "access_mode": room.access_mode, "members": room.member_count, "membership": member_states.get(room.id),
            "parent_id": room.parent_id.public_id or None,
            "subjects": [{"id": c.public_id, "name": c.name, "color": c.color or "#1D4ED8"} for c in room.child_ids.filtered("active")],
        }

    @api.model
    def student_rooms(self, partner_id):
        p = self._partner(partner_id)
        states = self._membership(p)
        rooms = self.env["otm.quiz.room"].sudo().search([("parent_id", "=", False)])
        rooms = rooms.filtered(lambda r: r.access_mode != "invite" or states.get(r.id) == "approved")
        cards = [self._room_card(r, states) for r in rooms]
        return {"mine": [c for c in cards if c["membership"] == "approved"],
                "explore": [c for c in cards if c["membership"] != "approved"]}

    @api.model
    def student_join_room(self, partner_id, room_public_id):
        p = self._partner(partner_id)
        room = self._room_by_public(room_public_id)
        if room.parent_id:
            raise UserError("Join the class room first. Its subject rooms open automatically.")
        if room.access_mode == "invite":
            raise UserError("This room is invite only.")
        Member = self.env["otm.quiz.room.member"].sudo()
        state = "approved" if room.access_mode == "open" else "pending"
        m = Member.search([("room_id", "=", room.id), ("student_id", "=", p.id)], limit=1)
        if m and m.state in ("approved", "pending"):
            return {"membership": m.state}
        if m:
            m.write({"state": state})  # rejected earlier: ask again
        else:
            Member.create({"room_id": room.id, "student_id": p.id, "state": state})
        return {"membership": state}

    @api.model
    def student_leave_room(self, partner_id, room_public_id):
        p = self._partner(partner_id)
        room = self._room_by_public(room_public_id)
        self.env["otm.quiz.room.member"].sudo().search([("room_id", "=", room.id), ("student_id", "=", p.id)]).unlink()
        return True

    def _leaderboard(self, room, p, top=10):
        quizzes = (room | room.child_ids).with_context(active_test=False).quiz_ids
        XP = self.env["otm.quiz.xp.log"].sudo()
        domain = [("quiz_id", "in", quizzes.ids),
                  ("awarded_on", ">=", fields.Datetime.now() - timedelta(days=LEADERBOARD_DAYS))]
        rows = XP._read_group(domain, ["student_id"], ["xp:sum"], order="xp:sum desc, student_id", limit=top) if quizzes else []
        board = []
        for i, (student, total) in enumerate(rows, 1):
            board.append(dict(self._public_identity(student), rank=i, xp=total, me=student.id == p.id))
        mine = XP.search(domain + [("student_id", "=", p.id)])
        my_xp = sum(mine.mapped("xp"))
        me = None
        if mine:
            ahead = len(XP._read_group(domain, ["student_id"], ["xp:sum"], having=[("xp:sum", ">", my_xp)]))
            me = dict(self._public_identity(p), rank=ahead + 1, xp=my_xp, me=True)
        return {"top": board, "me": me, "days": LEADERBOARD_DAYS}

    @api.model
    def student_room(self, partner_id, room_public_id):
        p = self._partner(partner_id)
        room = self._room_by_public(room_public_id)
        states = self._membership(p)
        accessible = room in self.env["otm.quiz.room"]._accessible_for(p)
        card = self._room_card(room, states)
        card["parent"] = ({"id": room.parent_id.public_id, "name": room.parent_id.name, "color": room.parent_id.color or "#1D4ED8"}
                          if room.parent_id else None)
        card["teachers"] = [t.name for t in room.teacher_ids]
        if not accessible:
            if room.parent_id and states.get(room.parent_id.id) == "pending":
                card["membership"] = "pending"
            elif room.parent_id and room.parent_id.id in states:
                card["membership"] = states[room.parent_id.id]
            return dict(card, locked=True)
        now = fields.Datetime.now()
        scope = room | room.child_ids
        quizzes = self.env["otm.quiz"].sudo().search(
            [("state", "=", "published"), ("quiz_end", ">", now), ("room_ids", "in", scope.ids)],
            order="quiz_start asc", limit=50)
        posts = room.post_ids[:20]
        return dict(
            card, locked=False,
            quizzes=[self._quiz_card(q, p) for q in quizzes],
            posts=[{"id": x.id, "author": x.author_id.name or "Teacher", "body": x.body, "pinned": x.pinned,
                    "created": _iso(x.create_date)} for x in posts],
            leaderboard=self._leaderboard(room, p),
        )
