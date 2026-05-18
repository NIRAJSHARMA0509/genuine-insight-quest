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

export const DEFAULT_INTRO = `Hello, and welcome. My name is Alex, and I will be conducting your interview today. Before we begin, I want to explain how this works so you feel completely at ease. I will ask you a series of questions, one at a time. For each question, please take as long as you need to think. When you are ready, press the Start Recording button on your screen. Your camera and audio will begin recording. Once you have finished, press Submit Answer. There are no right or wrong answers — I simply want to understand you. Please be yourself. Let us begin.`;

export const DEFAULT_CLOSING = `That brings us to the end of our interview today. Thank you so much for your time and for sharing your thoughts so openly. It has been a genuine pleasure speaking with you. One of our team members will review your interview and be in touch with you shortly regarding next steps. We wish you all the very best.`;

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
