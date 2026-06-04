
-- 1. Harden the set_updated_at function (lock search_path)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

-- 2. Replace overly-permissive write policies on admin tables.
-- Keep public SELECT (interview takers need to read tests/questions/etc).
-- Lock write operations to authenticated users.

-- organisations
DROP POLICY IF EXISTS "Public insert organisations" ON public.organisations;
DROP POLICY IF EXISTS "Public update organisations" ON public.organisations;
DROP POLICY IF EXISTS "Public delete organisations" ON public.organisations;
CREATE POLICY "Authenticated insert organisations" ON public.organisations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update organisations" ON public.organisations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete organisations" ON public.organisations FOR DELETE TO authenticated USING (true);

-- tests
DROP POLICY IF EXISTS "Public insert tests" ON public.tests;
DROP POLICY IF EXISTS "Public update tests" ON public.tests;
DROP POLICY IF EXISTS "Public delete tests" ON public.tests;
CREATE POLICY "Authenticated insert tests" ON public.tests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update tests" ON public.tests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete tests" ON public.tests FOR DELETE TO authenticated USING (true);

-- test_levels
DROP POLICY IF EXISTS "Public insert test_levels" ON public.test_levels;
DROP POLICY IF EXISTS "Public update test_levels" ON public.test_levels;
DROP POLICY IF EXISTS "Public delete test_levels" ON public.test_levels;
CREATE POLICY "Authenticated insert test_levels" ON public.test_levels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update test_levels" ON public.test_levels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete test_levels" ON public.test_levels FOR DELETE TO authenticated USING (true);

-- questions
DROP POLICY IF EXISTS "Public insert questions" ON public.questions;
DROP POLICY IF EXISTS "Public update questions" ON public.questions;
DROP POLICY IF EXISTS "Public delete questions" ON public.questions;
CREATE POLICY "Authenticated insert questions" ON public.questions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update questions" ON public.questions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete questions" ON public.questions FOR DELETE TO authenticated USING (true);

-- objectives
DROP POLICY IF EXISTS "Public insert objectives" ON public.objectives;
DROP POLICY IF EXISTS "Public update objectives" ON public.objectives;
DROP POLICY IF EXISTS "Public delete objectives" ON public.objectives;
CREATE POLICY "Authenticated insert objectives" ON public.objectives FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update objectives" ON public.objectives FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete objectives" ON public.objectives FOR DELETE TO authenticated USING (true);

-- objective_criteria
DROP POLICY IF EXISTS "Public insert criteria" ON public.objective_criteria;
DROP POLICY IF EXISTS "Public update criteria" ON public.objective_criteria;
DROP POLICY IF EXISTS "Public delete criteria" ON public.objective_criteria;
CREATE POLICY "Authenticated insert criteria" ON public.objective_criteria FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update criteria" ON public.objective_criteria FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete criteria" ON public.objective_criteria FOR DELETE TO authenticated USING (true);

-- question_rubrics
DROP POLICY IF EXISTS "Public insert rubrics" ON public.question_rubrics;
DROP POLICY IF EXISTS "Public update rubrics" ON public.question_rubrics;
DROP POLICY IF EXISTS "Public delete rubrics" ON public.question_rubrics;
CREATE POLICY "Authenticated insert rubrics" ON public.question_rubrics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update rubrics" ON public.question_rubrics FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete rubrics" ON public.question_rubrics FOR DELETE TO authenticated USING (true);

-- Make sure authenticated role has table-level grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_levels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objectives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objective_criteria TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_rubrics TO authenticated;

-- 3. Tighten storage buckets: remove broad SELECT (no listing) but allow individual reads through public URLs (public bucket flag still serves files).
-- For uploads/updates/deletes, require authenticated.

-- Drop any overly permissive policies on storage.objects for these buckets
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual LIKE '%avatar-images%' OR qual LIKE '%university-logos%'
        OR with_check LIKE '%avatar-images%' OR with_check LIKE '%university-logos%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Authenticated users can upload/modify/delete files in these buckets
CREATE POLICY "Auth can upload to avatar-images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatar-images');
CREATE POLICY "Auth can update avatar-images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatar-images') WITH CHECK (bucket_id = 'avatar-images');
CREATE POLICY "Auth can delete avatar-images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatar-images');

CREATE POLICY "Auth can upload to university-logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'university-logos');
CREATE POLICY "Auth can update university-logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'university-logos') WITH CHECK (bucket_id = 'university-logos');
CREATE POLICY "Auth can delete university-logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'university-logos');
