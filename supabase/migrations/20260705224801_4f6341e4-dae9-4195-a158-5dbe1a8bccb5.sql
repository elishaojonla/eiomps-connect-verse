
-- Profile extensions
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS founding_member_number integer UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_pro boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pro_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_handle text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS discord_handle text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dm_privacy text NOT NULL DEFAULT 'everyone' CHECK (dm_privacy IN ('everyone','followers','nobody'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS posts_privacy text NOT NULL DEFAULT 'everyone' CHECK (posts_privacy IN ('everyone','followers'));

-- Messages: voice/media
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_type text CHECK (media_type IN ('image','video','audio'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS transcript text;
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;

-- Founding member counter (singleton row)
CREATE TABLE IF NOT EXISTS public.founding_member_counter (
  id boolean PRIMARY KEY DEFAULT true,
  count integer NOT NULL DEFAULT 0,
  CHECK (id = true)
);
INSERT INTO public.founding_member_counter (id, count) VALUES (true, 0) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.founding_member_counter TO anon, authenticated;
GRANT ALL ON public.founding_member_counter TO service_role;
ALTER TABLE public.founding_member_counter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "counter viewable by all" ON public.founding_member_counter FOR SELECT USING (true);

-- Blocks
CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own blocks read" ON public.blocks FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "own blocks write" ON public.blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "own blocks delete" ON public.blocks FOR DELETE USING (auth.uid() = blocker_id);

-- Reports
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post','profile','comment','message')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','actioned','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reports read" ON public.reports FOR SELECT USING (auth.uid() = reporter_id);
CREATE POLICY "auth create reports" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Login activity
CREATE TABLE IF NOT EXISTS public.login_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_activity_user_idx ON public.login_activity(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.login_activity TO authenticated;
GRANT ALL ON public.login_activity TO service_role;
ALTER TABLE public.login_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own login activity read" ON public.login_activity FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "auth insert own login" ON public.login_activity FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Pro subscriptions (Paystack)
CREATE TABLE IF NOT EXISTS public.pro_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pro_subscriptions TO authenticated;
GRANT ALL ON public.pro_subscriptions TO service_role;
ALTER TABLE public.pro_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subs read" ON public.pro_subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Updated handle_new_user: assign founding member + linkshine
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
  new_count INT;
  fm_num INT := NULL;
  pro_until_ts TIMESTAMPTZ := NULL;
BEGIN
  base_username := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'username',''),
    split_part(NEW.email,'@',1),
    'user_' || substr(NEW.id::text, 1, 8)
  );
  base_username := regexp_replace(lower(base_username),'[^a-z0-9_]','','g');
  IF length(base_username) = 0 THEN base_username := 'user_' || substr(NEW.id::text, 1, 8); END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := base_username || counter;
  END LOOP;

  -- Founding member allocation (first 100)
  UPDATE public.founding_member_counter SET count = count + 1 WHERE id = true RETURNING count INTO new_count;
  IF new_count <= 100 THEN
    fm_num := new_count;
    pro_until_ts := now() + interval '30 days';
  END IF;

  INSERT INTO public.profiles (id, username, full_name, avatar_url, linkshine_url, founding_member_number, is_pro, pro_until)
  VALUES (
    NEW.id,
    final_username,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    'eiomps.app/dm/' || final_username,
    fm_num,
    fm_num IS NOT NULL,
    pro_until_ts
  );
  RETURN NEW;
END;
$$;

-- Backfill linkshine for existing users
UPDATE public.profiles SET linkshine_url = 'eiomps.app/dm/' || username WHERE linkshine_url IS NULL;

-- Sync counter with actual founding members
UPDATE public.founding_member_counter SET count = GREATEST(count, (SELECT COALESCE(MAX(founding_member_number),0) FROM public.profiles));
