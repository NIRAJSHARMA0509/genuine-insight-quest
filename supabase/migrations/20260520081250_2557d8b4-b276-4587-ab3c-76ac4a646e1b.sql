
-- Wipe old tables (fresh start)
DROP TABLE IF EXISTS public.interview_sessions CASCADE;
DROP TABLE IF EXISTS public.universities CASCADE;

-- Organisations
CREATE TABLE public.organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('university','service_provider')),
  name TEXT NOT NULL,
  logo_url TEXT,
  website_url TEXT,
  description TEXT,
  custom_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  programme_name TEXT,
  intake_year TEXT,
  nature_of_service TEXT,
  contact_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read organisations" ON public.organisations FOR SELECT USING (true);
CREATE POLICY "Public insert organisations" ON public.organisations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update organisations" ON public.organisations FOR UPDATE USING (true);
CREATE POLICY "Public delete organisations" ON public.organisations FOR DELETE USING (true);
CREATE TRIGGER trg_organisations_updated BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tests
CREATE TABLE public.tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'assessment' CHECK (purpose IN ('preparation','assessment')),
  max_attempts INT NOT NULL DEFAULT 1,
  attempts_context_note TEXT,
  intro_message TEXT,
  closing_message TEXT,
  proctoring_enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tests" ON public.tests FOR SELECT USING (true);
CREATE POLICY "Public insert tests" ON public.tests FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update tests" ON public.tests FOR UPDATE USING (true);
CREATE POLICY "Public delete tests" ON public.tests FOR DELETE USING (true);
CREATE TRIGGER trg_tests_updated BEFORE UPDATE ON public.tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_tests_org ON public.tests(organisation_id);

-- Test Levels
CREATE TABLE public.test_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('fixed','clarifying','reasoning')),
  ai_question_budget INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.test_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read test_levels" ON public.test_levels FOR SELECT USING (true);
CREATE POLICY "Public insert test_levels" ON public.test_levels FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update test_levels" ON public.test_levels FOR UPDATE USING (true);
CREATE POLICY "Public delete test_levels" ON public.test_levels FOR DELETE USING (true);
CREATE TRIGGER trg_test_levels_updated BEFORE UPDATE ON public.test_levels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_levels_test ON public.test_levels(test_id);

-- Questions
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id UUID NOT NULL REFERENCES public.test_levels(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  question_text TEXT NOT NULL,
  think_time_seconds INT NOT NULL DEFAULT 30,
  answer_time_seconds INT NOT NULL DEFAULT 120,
  max_follow_ups INT NOT NULL DEFAULT 0,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read questions" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Public insert questions" ON public.questions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update questions" ON public.questions FOR UPDATE USING (true);
CREATE POLICY "Public delete questions" ON public.questions FOR DELETE USING (true);
CREATE TRIGGER trg_questions_updated BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_questions_level ON public.questions(level_id);

-- Question rubrics
CREATE TABLE public.question_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  example_response TEXT NOT NULL,
  score INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.question_rubrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read rubrics" ON public.question_rubrics FOR SELECT USING (true);
CREATE POLICY "Public insert rubrics" ON public.question_rubrics FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update rubrics" ON public.question_rubrics FOR UPDATE USING (true);
CREATE POLICY "Public delete rubrics" ON public.question_rubrics FOR DELETE USING (true);
CREATE INDEX idx_rubrics_q ON public.question_rubrics(question_id);

-- Objectives (per level)
CREATE TABLE public.objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id UUID NOT NULL REFERENCES public.test_levels(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  weight INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read objectives" ON public.objectives FOR SELECT USING (true);
CREATE POLICY "Public insert objectives" ON public.objectives FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update objectives" ON public.objectives FOR UPDATE USING (true);
CREATE POLICY "Public delete objectives" ON public.objectives FOR DELETE USING (true);
CREATE TRIGGER trg_objectives_updated BEFORE UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_objectives_level ON public.objectives(level_id);

-- Objective criteria
CREATE TABLE public.objective_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  criterion TEXT NOT NULL,
  score INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.objective_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read criteria" ON public.objective_criteria FOR SELECT USING (true);
CREATE POLICY "Public insert criteria" ON public.objective_criteria FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update criteria" ON public.objective_criteria FOR UPDATE USING (true);
CREATE POLICY "Public delete criteria" ON public.objective_criteria FOR DELETE USING (true);
CREATE INDEX idx_criteria_objective ON public.objective_criteria(objective_id);

-- Interview sessions (recreated)
CREATE TABLE public.interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES public.tests(id) ON DELETE CASCADE,
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL DEFAULT 1,
  student_name TEXT,
  student_email TEXT,
  student_reference TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_progress',
  full_transcript JSONB DEFAULT '[]'::jsonb,
  score_report JSONB,
  proctoring_flags JSONB DEFAULT '[]'::jsonb,
  previous_attempts_summary JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read sessions" ON public.interview_sessions FOR SELECT USING (true);
CREATE POLICY "Public insert sessions" ON public.interview_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update sessions" ON public.interview_sessions FOR UPDATE USING (true);
CREATE INDEX idx_sessions_test ON public.interview_sessions(test_id);
