export type Paged<T> = { total: number; items: T[] };

export type QuizCard = {
  id: string; slug: string; title: string; code: string; description: string; subject: string; state: string;
  duration_minutes: number; total_marks: number; question_total: number; passing_percentage: number;
  maximum_attempts: number; registration_required: boolean; approval_required: boolean; registration_start: string | null;
  registration_end: string | null; quiz_start: string | null; quiz_end: string | null; registration_open: boolean;
  window_open: boolean; scholarship_enabled: boolean; eligibility_notes: string; negative_marking: boolean;
  has_thumbnail: boolean;
  registration_status?: string | null; registration_id?: string | null; attempts_used?: number;
  active_attempt?: string | null; can_start?: boolean;
  instructions?: string;
  scholarship_bands?: { name: string; min: number; max: number | null; type: string; value: number; must_pass: boolean }[];
};

export type Registration = { id: string; reference: string; state: string; date: string; quiz: QuizCard };

export type ResultRow = {
  id: string; reference: string; quiz_title: string; attempt_number: number; state: string; submitted_at: string | null;
  visible: boolean; total_marks?: number; marks_obtained?: number; percentage?: number;
  result_status?: "pass" | "fail" | "pending"; scholarship_status?: string; scholarship_type?: string | null;
  scholarship_value?: number; scholarship_amount?: number; scholarship_explanation?: string;
  time_taken_seconds?: number; passing_percentage?: number;
  review?: {
    seq: number; text: string; marks_available: number; marks_awarded: number; is_correct: boolean;
    selected: number[]; options: { id: number; text: string; correct: boolean }[]; explanation: string;
  }[];
};

export type StudentDashboard = {
  student: { partner_id: number; name: string; email: string; phone: string; student_code: string; education: string };
  available: QuizCard[]; registered: Registration[]; deadlines: { quiz: string; registration_end: string | null }[];
  active_attempt: { id: string; quiz_title: string; deadline_at: string } | null;
  recent_results: ResultRow[]; scholarships: ResultRow[];
};

export type AttemptPayload =
  | { id: string; state: string; finished: true }
  | {
      id: string; state: string; attempt_number: number; finished?: false;
      quiz: { id: string; title: string; instructions: string; duration_minutes: number };
      started_at: string; deadline_at: string; server_now: string; total_marks: number;
      questions: import("@/lib/quiz-state").Question[];
    };

export type AdminDashboard = {
  cards: {
    total_quizzes: number; published_quizzes: number; total_questions: number; registered_students: number;
    active_attempts: number; completed_attempts: number; pass_rate: number | null; scholarship_eligible: number;
  };
  recent_quizzes: { id: number; name: string; state: string; public_id: string; quiz_start: string | false }[];
  upcoming: { id: number; name: string; public_id: string; quiz_start: string | false }[];
  recent_registrations: { id: number; reference: string; student_id: [number, string]; quiz_id: [number, string]; state: string; registration_date: string }[];
  completion_trend: { day: string; count: number }[];
};

export type QuizReport = {
  quiz: { id: string; title: string };
  registrations: number; confirmed: number; cancelled: number; started: number; completed: number; passed: number; failed: number;
  pass_rate: number | null; average_percentage: number | null;
  score_distribution: { range: string; count: number }[];
  subject_performance: { subject: string; correct: number; wrong: number }[];
  ranking: { rank: number; student: string; marks: number; percentage: number; time_seconds: number; result: string; attempt: string }[];
};

export type SearchResult<T = Record<string, unknown>> = { total: number; records: T[] };
