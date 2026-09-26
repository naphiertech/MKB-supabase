-- Create reviews table
DROP TABLE IF EXISTS public.reviews CASCADE;

CREATE TABLE public.reviews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  role_title  text,
  rating      int not null check (rating between 1 and 5),
  comment     text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved')),
  created_at  timestamptz not null default now()
);

-- Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
-- 1. Allow anyone (including anonymous) to insert reviews
CREATE POLICY "Allow anonymous review insertion" ON public.reviews
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending');

-- 2. Allow anyone to view approved reviews (and allow inserting clients to query RETURNING)
CREATE POLICY "Allow public to view approved reviews" ON public.reviews
  FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR (status = 'pending' AND created_at >= now() - interval '30 seconds'));

-- 3. Allow Admin and HR to perform all actions
CREATE POLICY "Allow Admin and HR full control" ON public.reviews
  FOR ALL TO authenticated
  USING (
    get_my_role() = 'admin'::user_role 
    OR get_my_role() = 'hr'::user_role
  )
  WITH CHECK (
    get_my_role() = 'admin'::user_role 
    OR get_my_role() = 'hr'::user_role
  );
