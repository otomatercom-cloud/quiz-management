# -*- coding: utf-8 -*-
import base64
import csv
import hashlib
import io
import logging

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError

from ..models.question import normalize_text

_logger = logging.getLogger(__name__)

COLUMNS = ["question_text", "question_type", "option_a", "option_b", "option_c", "option_d", "correct_answer",
           "marks", "negative_marks", "subject", "topic", "difficulty", "explanation", "tags"]
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 2000
TYPE_MAP = {"mcq": "mcq", "multiple choice": "mcq", "multiple_choice": "mcq", "true_false": "true_false",
            "true/false": "true_false", "true false": "true_false", "tf": "true_false"}
DIFFICULTIES = ("easy", "medium", "hard")


def safe_cell(value):
    """Prevent spreadsheet formula injection in anything we export."""
    value = "" if value is None else str(value)
    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value


class OtmQuizImportLine(models.TransientModel):
    _name = "otm.quiz.import.line"
    _description = "Question Import Row"
    _order = "row_number"

    wizard_id = fields.Many2one("otm.quiz.import.wizard", required=True, ondelete="cascade")
    row_number = fields.Integer()
    status = fields.Selection([("valid", "Valid"), ("warning", "Warning"), ("invalid", "Invalid")])
    message = fields.Text()
    question_text = fields.Char()
    payload = fields.Json()


class OtmQuizImportWizard(models.TransientModel):
    _name = "otm.quiz.import.wizard"
    _description = "Question Import Wizard"

    file = fields.Binary(string="CSV / XLSX file", attachment=False)
    filename = fields.Char()
    allow_duplicates = fields.Boolean(help="Import questions even if identical text already exists.")
    import_valid_only = fields.Boolean(help="Import valid rows and report the invalid ones (never silent).")
    state = fields.Selection([("draft", "Upload"), ("validated", "Preview"), ("done", "Done")], default="draft")
    line_ids = fields.One2many("otm.quiz.import.line", "wizard_id")
    total_rows = fields.Integer(readonly=True)
    valid_rows = fields.Integer(readonly=True)
    invalid_rows = fields.Integer(readonly=True)
    warning_rows = fields.Integer(readonly=True)
    imported_rows = fields.Integer(readonly=True)

    # ------------------------------------------------------------------ parsing
    def _read_rows(self):
        self.ensure_one()
        if not self.file:
            raise UserError("Please upload a file.")
        raw = base64.b64decode(self.file)
        if len(raw) > MAX_FILE_BYTES:
            raise UserError("File is larger than 5 MB.")
        name = (self.filename or "").lower()
        if name.endswith(".xlsx"):
            try:
                import openpyxl
            except ImportError:
                raise UserError("XLSX support needs the 'openpyxl' Python package (pip install openpyxl).")
            wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)  # formulas are never evaluated
            sheet = wb.active
            rows = [["" if c is None else str(c) for c in r] for r in sheet.iter_rows(values_only=True)]
            wb.close()
        elif name.endswith(".csv"):
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                raise UserError("CSV must be UTF-8 encoded.")
            rows = list(csv.reader(io.StringIO(text)))
        else:
            raise UserError("Only .csv and .xlsx files are supported.")
        rows = [r for r in rows if any((c or "").strip() for c in r)]
        if not rows:
            raise UserError("The file is empty.")
        header = [normalize_text(h).replace(" ", "_") for h in rows[0]]
        missing = [c for c in ("question_text", "question_type", "correct_answer") if c not in header]
        if missing:
            raise UserError("Missing required column(s): %s" % ", ".join(missing))
        body = rows[1:]
        if len(body) > MAX_ROWS:
            raise UserError("Too many rows (maximum %d per import)." % MAX_ROWS)
        out = []
        for i, r in enumerate(body, start=2):
            out.append((i, {h: (r[j].strip() if j < len(r) and r[j] is not None else "") for j, h in enumerate(header)}))
        return out

    def _validate_row(self, row, seen, allow_dup):
        errs, warns = [], []
        for col, val in row.items():
            if col in COLUMNS and val[:1] == "=":
                errs.append("Column '%s' starts with '=' (formulas are not accepted)." % col)
        text = row.get("question_text", "")
        if not text:
            errs.append("question_text is required.")
        qtype = TYPE_MAP.get(normalize_text(row.get("question_type")))
        if not qtype:
            errs.append("question_type must be 'mcq' or 'true_false'.")
        try:
            marks = float(row.get("marks") or 1)
            if marks <= 0:
                raise ValueError
        except ValueError:
            errs.append("marks must be a number greater than 0.")
            marks = 1.0
        try:
            neg = float(row.get("negative_marks") or 0)
            if neg < 0:
                raise ValueError
        except ValueError:
            errs.append("negative_marks must be a number >= 0.")
            neg = 0.0
        diff = normalize_text(row.get("difficulty")) or "medium"
        if diff not in DIFFICULTIES:
            errs.append("difficulty must be easy, medium or hard.")
        options = []
        correct = (row.get("correct_answer") or "").strip()
        if qtype == "mcq":
            letters = {"a": "option_a", "b": "option_b", "c": "option_c", "d": "option_d"}
            texts = {k: row.get(col, "") for k, col in letters.items() if row.get(col, "")}
            if len(texts) < 2:
                errs.append("MCQ needs at least two non-empty options.")
            if len({normalize_text(t) for t in texts.values()}) != len(texts):
                errs.append("MCQ options must be distinct.")
            key = normalize_text(correct)
            if key not in texts:
                match = [k for k, t in texts.items() if normalize_text(t) == key]
                key = match[0] if len(match) == 1 else None
            if key is None or key not in texts:
                errs.append("correct_answer must be A, B, C or D and point to a filled option.")
            options = [{"text": t, "correct": k == key, "sequence": 10 * (i + 1)} for i, (k, t) in enumerate(texts.items())]
        elif qtype == "true_false":
            norm = normalize_text(correct)
            if norm not in ("true", "false"):
                errs.append("correct_answer must be True or False.")
            options = [{"text": "True", "correct": norm == "true", "sequence": 10},
                       {"text": "False", "correct": norm == "false", "sequence": 20}]
        if qtype and text:
            digest = hashlib.sha1(("%s|%s" % (qtype, normalize_text(text))).encode()).hexdigest()
            if digest in seen:
                (warns if allow_dup else errs).append("Duplicate of row %d in this file." % seen[digest])
            elif self.env["otm.quiz.question"].search_count([("content_hash", "=", digest)]):
                (warns if allow_dup else errs).append("A question with identical text already exists in the bank.")
        payload = None
        if not errs:
            payload = {"question_text": text, "question_type": qtype, "marks": marks, "negative_marks": neg,
                       "subject": row.get("subject") or False, "topic": row.get("topic") or False,
                       "difficulty": diff, "explanation": row.get("explanation") or False,
                       "options": options, "tags": [t.strip() for t in (row.get("tags") or "").split(",") if t.strip()]}
        return payload, errs, warns, (digest if qtype and text else None)

    # ------------------------------------------------------------------ actions
    def action_validate(self):
        self.ensure_one()
        self.line_ids.unlink()
        seen, lines = {}, []
        valid = invalid = warning = 0
        for rownum, row in self._read_rows():
            payload, errs, warns, digest = self._validate_row(row, seen, self.allow_duplicates)
            if digest and digest not in seen:
                seen[digest] = rownum
            status = "invalid" if errs else ("warning" if warns else "valid")
            valid += status != "invalid"
            invalid += status == "invalid"
            warning += status == "warning"
            lines.append({"wizard_id": self.id, "row_number": rownum, "status": status,
                          "message": " | ".join(errs + warns), "question_text": (row.get("question_text") or "")[:120],
                          "payload": payload})
        self.env["otm.quiz.import.line"].create(lines)
        self.write({"state": "validated", "total_rows": len(lines), "valid_rows": valid, "invalid_rows": invalid,
                    "warning_rows": warning})
        return self._reopen()

    def action_import(self):
        self.ensure_one()
        if self.state != "validated":
            raise UserError("Validate the file first.")
        if self.invalid_rows and not self.import_valid_only:
            raise UserError("The file has %d invalid row(s). Fix and re-upload, or tick 'Import valid rows only'."
                            % self.invalid_rows)
        Question, Tag = self.env["otm.quiz.question"], self.env["otm.quiz.tag"]
        count = 0
        for line in self.line_ids.filtered(lambda l: l.status != "invalid" and l.payload):  # single transaction
            p = line.payload
            tag_ids = []
            for t in p["tags"]:
                tag = Tag.search([("name", "=ilike", t)], limit=1) or Tag.create({"name": t})
                tag_ids.append(tag.id)
            Question.create({
                "question_text": p["question_text"], "question_type": p["question_type"], "marks": p["marks"],
                "negative_marks": p["negative_marks"], "subject": p["subject"], "topic": p["topic"],
                "difficulty": p["difficulty"], "explanation": p["explanation"], "tag_ids": [(6, 0, tag_ids)],
                "option_ids": [(0, 0, {"option_text": o["text"], "is_correct": o["correct"], "sequence": o["sequence"]})
                               for o in p["options"]],
            })
            count += 1
        self.write({"state": "done", "imported_rows": count})
        self.env["otm.quiz.audit.log"].log("questions_imported", self, "rows=%d invalid=%d" % (count, self.invalid_rows))
        return self._reopen()

    def _reopen(self):
        return {"type": "ir.actions.act_window", "res_model": self._name, "res_id": self.id, "view_mode": "form",
                "target": "new"}

    # ------------------------------------------------------------------ files
    @api.model
    def template_csv(self):
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(COLUMNS)
        w.writerow(["What is 2 + 2?", "mcq", "3", "4", "5", "6", "B", "1", "0.25", "Maths", "Arithmetic", "easy", "Basic addition", "starter"])
        w.writerow(["The Earth orbits the Sun.", "true_false", "", "", "", "", "True", "1", "0", "Science", "Astronomy", "easy", "", ""])
        return {"filename": "question_import_template.csv", "csv": buf.getvalue()}

    def error_report_csv(self):
        self.ensure_one()
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["row_number", "status", "problem", "question_text"])
        for l in self.line_ids.filtered(lambda l: l.status != "valid"):
            w.writerow([l.row_number, l.status, safe_cell(l.message), safe_cell(l.question_text)])
        return buf.getvalue()

    def action_download_error_report(self):
        self.ensure_one()
        att = self.env["ir.attachment"].create({
            "name": "import_error_report.csv", "raw": self.error_report_csv().encode("utf-8-sig"),
            "mimetype": "text/csv", "res_model": self._name, "res_id": self.id})
        return {"type": "ir.actions.act_url", "url": "/web/content/%d?download=true" % att.id, "target": "self"}

    def action_download_template(self):
        att = self.env["ir.attachment"].create({
            "name": "question_import_template.csv", "raw": self.template_csv()["csv"].encode("utf-8-sig"),
            "mimetype": "text/csv", "res_model": self._name, "res_id": self.id})
        return {"type": "ir.actions.act_url", "url": "/web/content/%d?download=true" % att.id, "target": "self"}

    @api.model
    def export_csv(self, include_answers=False, domain=None):
        if include_answers and not self.env.user.has_group("otm_quiz_management.group_otm_quiz_admin"):
            raise AccessError("Only administrators can export the answer key.")
        buf = io.StringIO()
        w = csv.writer(buf)
        cols = [c for c in COLUMNS if include_answers or c != "correct_answer"]
        w.writerow(cols)
        for q in self.env["otm.quiz.question"].search(domain or [], limit=20000):
            opts = q.option_ids.sorted("sequence")
            correct_letter = ""
            letters = ["A", "B", "C", "D"]
            for i, o in enumerate(opts[:4]):
                if o.is_correct:
                    correct_letter = "True" if q.question_type == "true_false" and o.option_text == "True" else \
                        ("False" if q.question_type == "true_false" else letters[i])
            data = {
                "question_text": q.question_text, "question_type": q.question_type,
                "option_a": opts[0].option_text if q.question_type == "mcq" and len(opts) > 0 else "",
                "option_b": opts[1].option_text if q.question_type == "mcq" and len(opts) > 1 else "",
                "option_c": opts[2].option_text if q.question_type == "mcq" and len(opts) > 2 else "",
                "option_d": opts[3].option_text if q.question_type == "mcq" and len(opts) > 3 else "",
                "correct_answer": correct_letter, "marks": q.marks, "negative_marks": q.negative_marks,
                "subject": q.subject, "topic": q.topic, "difficulty": q.difficulty, "explanation": q.explanation,
                "tags": ",".join(q.tag_ids.mapped("name")),
            }
            w.writerow([safe_cell(data[c]) for c in cols])
        return {"filename": "questions_%s_answers.csv" % ("WITH" if include_answers else "WITHOUT"), "csv": buf.getvalue(),
                "answers_included": bool(include_answers)}

    @api.model
    def api_run(self, filename, content_b64, mode="validate", allow_duplicates=False):
        wiz = self.create({"file": content_b64, "filename": filename, "allow_duplicates": bool(allow_duplicates)})
        wiz.action_validate()
        if mode == "import":
            wiz.action_import()
        return {
            "state": wiz.state, "total": wiz.total_rows, "valid": wiz.valid_rows, "invalid": wiz.invalid_rows,
            "warnings": wiz.warning_rows, "imported": wiz.imported_rows,
            "rows": [{"row": l.row_number, "status": l.status, "message": l.message or "", "text": l.question_text or ""}
                     for l in wiz.line_ids[:500]],
            "error_report_csv": wiz.error_report_csv() if wiz.invalid_rows or wiz.warning_rows else "",
        }
