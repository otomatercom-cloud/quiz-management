# -*- coding: utf-8 -*-
"""Rooms: a class room (e.g. 10th Standard) holds subject rooms (Maths, Physics ...). Quizzes can be placed in rooms;
a quiz that belongs to a room is visible and startable only by members of that room (or of its parent class room)."""
from odoo import api, fields, models
from odoo.exceptions import AccessError, ValidationError

from .quiz import new_public_id, slugify

G_MANAGER = "otm_quiz_management.group_otm_quiz_manager"


class OtmQuizRoom(models.Model):
    _name = "otm.quiz.room"
    _description = "Quiz Room"
    _order = "sequence, name, id"

    name = fields.Char(required=True)
    public_id = fields.Char(copy=False, readonly=True, index=True, default=lambda s: new_public_id())
    slug = fields.Char(compute="_compute_slug")
    parent_id = fields.Many2one("otm.quiz.room", string="Class Room", index=True, ondelete="cascade",
                                domain=[("parent_id", "=", False)],
                                help="Leave empty for a class room. Set it to make this a subject room inside that class room.")
    child_ids = fields.One2many("otm.quiz.room", "parent_id", string="Subject Rooms")
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    description = fields.Text()
    color = fields.Char(default="#1D4ED8", help="Hex colour used for the room banner, e.g. #1D4ED8")
    access_mode = fields.Selection(
        [("open", "Open: students join instantly"),
         ("approval", "Approval: join requests need approval"),
         ("invite", "Invite only: staff add members")], default="open", required=True)
    teacher_ids = fields.Many2many("res.users", "otm_quiz_room_teacher_rel", "room_id", "user_id", string="Teachers / Moderators")
    quiz_ids = fields.Many2many("otm.quiz", "otm_quiz_room_rel", "room_id", "quiz_id", string="Quizzes")
    member_ids = fields.One2many("otm.quiz.room.member", "room_id", string="Members")
    post_ids = fields.One2many("otm.quiz.room.post", "room_id", string="Posts")
    member_count = fields.Integer(compute="_compute_member_count")

    _public_uniq = models.Constraint("unique(public_id)", "Public identifier must be unique.")

    @api.depends("name", "public_id")
    def _compute_slug(self):
        for rec in self:
            rec.slug = "%s-%s" % (slugify(rec.name), rec.public_id)

    @api.depends("member_ids.state")
    def _compute_member_count(self):
        counts = {}
        if self.ids:
            for room, cnt in self.env["otm.quiz.room.member"].sudo()._read_group(
                    [("room_id", "in", self.ids), ("state", "=", "approved")], ["room_id"], ["__count"]):
                counts[room.id] = cnt
        for rec in self:
            rec.member_count = counts.get(rec.id, 0)

    @api.constrains("parent_id")
    def _check_two_levels(self):
        for rec in self:
            if rec.parent_id and (rec.parent_id.parent_id or rec.child_ids):
                raise ValidationError("Rooms have two levels only: a class room and its subject rooms.")

    @api.constrains("color")
    def _check_color(self):
        import re
        for rec in self:
            if rec.color and not re.fullmatch(r"#[0-9A-Fa-f]{6}", rec.color):
                raise ValidationError("Colour must look like #1D4ED8.")

    @api.model
    def _accessible_for(self, partner):
        """Rooms a student can enter: rooms they are an approved member of, plus the subject rooms inside them."""
        members = self.env["otm.quiz.room.member"].sudo().search(
            [("student_id", "=", partner.id), ("state", "=", "approved")])
        rooms = members.room_id
        return (rooms | rooms.child_ids).filtered("active")


class OtmQuizRoomMember(models.Model):
    _name = "otm.quiz.room.member"
    _description = "Quiz Room Member"
    _order = "id desc"

    room_id = fields.Many2one("otm.quiz.room", required=True, ondelete="cascade", index=True)
    student_id = fields.Many2one("res.partner", string="Student", required=True, ondelete="cascade", index=True,
                                 domain=[("otm_is_quiz_student", "=", True)])
    state = fields.Selection([("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")],
                             default="approved", required=True, index=True)
    joined_on = fields.Datetime(default=fields.Datetime.now, readonly=True)

    _member_uniq = models.Constraint("unique(room_id, student_id)", "This student is already in the room.")

    def action_approve(self):
        self.write({"state": "approved"})

    def action_reject(self):
        self.write({"state": "rejected"})


class OtmQuizRoomPost(models.Model):
    _name = "otm.quiz.room.post"
    _description = "Quiz Room Announcement"
    _order = "pinned desc, id desc"

    room_id = fields.Many2one("otm.quiz.room", required=True, ondelete="cascade", index=True)
    author_id = fields.Many2one("res.users", string="Author", default=lambda s: s.env.user, readonly=True, ondelete="set null")
    body = fields.Text(required=True)
    pinned = fields.Boolean()

    @api.constrains("body")
    def _check_body(self):
        for rec in self:
            if len((rec.body or "").strip()) < 2 or len(rec.body) > 2000:
                raise ValidationError("An announcement needs 2 to 2000 characters.")

    def _check_rights(self, rooms):
        user = self.env.user
        if user.has_group(G_MANAGER):
            return
        for room in rooms:
            if user not in room.sudo().teacher_ids:
                raise AccessError("Only a moderator of this room can post announcements.")

    @api.model_create_multi
    def create(self, vals_list):
        self._check_rights(self.env["otm.quiz.room"].browse([v.get("room_id") for v in vals_list]))
        return super().create(vals_list)

    def write(self, vals):
        self._check_rights(self.mapped("room_id"))
        vals.pop("author_id", None)
        return super().write(vals)

    def unlink(self):
        self._check_rights(self.mapped("room_id"))
        return super().unlink()
