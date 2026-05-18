
-- Universities (interview configurations)
CREATE TABLE public.universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  institution_name text NOT NULL,
  logo_url text,
  programme_name text,
  intake_year text,
  contact_email text,
  interview_mode text NOT NULL CHECK (interview_mode IN ('fixed','clarifying','reasoning')),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;

-- Prototype: open access (no auth in MVP). Lockdown later.
CREATE POLICY "Public read universities" ON public.universities FOR SELECT USING (true);
CREATE POLICY "Public insert universities" ON public.universities FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update universities" ON public.universities FOR UPDATE USING (true);

-- Interview sessions
CREATE TABLE public.interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid REFERENCES public.universities(id) ON DELETE CASCADE,
  student_name text,
  student_email text,
  student_reference text,
  started_at timestamptz,
  completed_at timestamptz,
  full_transcript jsonb DEFAULT '[]'::jsonb,
  score_report jsonb,
  proctoring_flags jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read sessions" ON public.interview_sessions FOR SELECT USING (true);
CREATE POLICY "Public insert sessions" ON public.interview_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update sessions" ON public.interview_sessions FOR UPDATE USING (true);

-- Storage buckets for logos and avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('university-logos', 'university-logos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatar-images', 'avatar-images', true);

CREATE POLICY "Public read logos" ON storage.objects FOR SELECT USING (bucket_id = 'university-logos');
CREATE POLICY "Public upload logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'university-logos');
CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatar-images');
CREATE POLICY "Public upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatar-images');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_universities_updated
BEFORE UPDATE ON public.universities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
