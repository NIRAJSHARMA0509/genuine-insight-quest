// Shared types for interview configuration

export type InterviewMode = "fixed" | "clarifying" | "reasoning";
export type PublishStatus = "draft" | "live" | "paused";

export interface FixedQuestion {
  id: string;
  question_text: string;
  time_limit_seconds: number;
}

export interface ClarifyingQuestion extends FixedQuestion {
  expected_response_scope: string;
  max_follow_ups: number;
}

export interface Objective {
  id: string;
  objective_title: string;
  objective_description: string;
  weight: number;
}

export interface InterviewConfiguration {
  mode: InterviewMode;
  fixed_questions?: FixedQuestion[];
  clarifying_questions?: ClarifyingQuestion[];
  opening_questions?: FixedQuestion[];
  objectives?: Objective[];
  ai_question_budget?: number;
  intro_message?: string;
  closing_message?: string;
  proctoring_enabled?: boolean;
}

export interface University {
  id: string;
  slug: string;
  institution_name: string;
  logo_url: string | null;
  programme_name: string | null;
  intake_year: string | null;
  contact_email: string | null;
  interview_mode: InterviewMode;
  configuration: InterviewConfiguration;
  status: PublishStatus;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_INTRO = `Hi there, and a very warm welcome. My name is Alex, and I'll be your interviewer today. Thank you for taking the time to join me — I know these conversations can feel a little nerve-wracking, so let me walk you through how it works so you feel completely at ease.

I'll ask you a few questions, one at a time. For each question, you'll have up to thirty seconds to gather your thoughts and press the "Start Recording" button. If you don't press it within thirty seconds, don't worry — recording will simply begin automatically. You'll then have up to two minutes to share your answer, and when you're ready, just press "Submit Answer".

One important thing I need to mention: throughout this interview, your camera, microphone, and screen are being continuously monitored. If you minimise this window, switch to another tab or application, connect a second display, or share your screen with anyone else, the interview will be automatically suspended. So please stay right here on this tab, keep your face in view, and just be yourself.

There are no trick questions, and there are no right or wrong answers — I genuinely want to get to know you. Take a deep breath, relax, and whenever you're ready, let's begin.`;

export const DEFAULT_CLOSING = `And that brings us to the end of our conversation. Thank you so much — really — for your time today, and for sharing your thoughts so openly with me. It's been a genuine pleasure getting to know you. One of our team members will carefully review your interview and will be in touch very soon about next steps. Until then, take care, and we wish you all the very best.`;

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
