
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS intro_mode text NOT NULL DEFAULT 'literal',
  ADD COLUMN IF NOT EXISTS closing_mode text NOT NULL DEFAULT 'literal';
