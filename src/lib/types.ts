// Shared types for the Organisation → Test → Level → Question model

export type OrganisationType = "university" | "service_provider";
export type TestPurpose = "preparation" | "assessment";
export type LevelMode = "fixed" | "clarifying" | "reasoning";
export type PublishStatus = "draft" | "live" | "paused";

export interface CustomUrl {
  tag: string;
  url: string;
}

export interface Organisation {
  id: string;
  type: OrganisationType;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
  custom_urls: CustomUrl[];
  programme_name: string | null;
  intake_year: string | null;
  nature_of_service: string | null;
  contact_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Test {
  id: string;
  organisation_id: string;
  slug: string;
  name: string;
  purpose: TestPurpose;
  max_attempts: number;
  attempts_context_note: string | null;
  intro_message: string | null;
  closing_message: string | null;
  proctoring_enabled: boolean;
  status: PublishStatus;
  created_at: string;
  updated_at: string;
}

export interface TestLevel {
  id: string;
  test_id: string;
  order_index: number;
  name: string;
  mode: LevelMode;
  ai_question_budget: number;
}

export interface QuestionRubric {
  id: string;
  question_id: string;
  order_index: number;
  example_response: string;
  score: number;
}

export interface Question {
  id: string;
  level_id: string;
  order_index: number;
  question_text: string;
  think_time_seconds: number;
  answer_time_seconds: number;
  max_follow_ups: number;
  ai_generated: boolean;
  rubrics?: QuestionRubric[];
}

export interface ObjectiveCriterion {
  id: string;
  objective_id: string;
  order_index: number;
  criterion: string;
  score: number;
}

export interface Objective {
  id: string;
  level_id: string;
  order_index: number;
  title: string;
  description: string | null;
  weight: number;
  criteria?: ObjectiveCriterion[];
}

export const DEFAULT_INTRO = `Hi there, and a very warm welcome. My name is Alex, and I'll be your interviewer today. Thank you for taking the time to join me — I know these conversations can feel a little nerve-wracking, so let me walk you through how it works so you feel completely at ease.

I'll ask you a few questions, one at a time. For each question, you'll have a short window to gather your thoughts and press the "Start Recording" button. If you don't press it in time, don't worry — recording will simply begin automatically. You'll then have up to two minutes to share your answer, and when you're ready, just press "Submit Answer".

One important thing I need to mention: throughout this interview, your camera, microphone, and screen are being continuously monitored. If you minimise this window, switch to another tab or application, connect a second display, or share your screen with anyone else, the interview will be automatically suspended. So please stay right here on this tab, keep your face in view, and just be yourself.

There are no trick questions, and there are no right or wrong answers — I genuinely want to get to know you. Take a deep breath, relax, and whenever you're ready, let's begin.`;

export const DEFAULT_CLOSING = `And that brings us to the end of our conversation. Thank you so much — really — for your time today, and for sharing your thoughts so openly with me. It's been a genuine pleasure getting to know you. One of our team members will carefully review your interview and will be in touch very soon about next steps. Until then, take care, and we wish you all the very best.`;

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
