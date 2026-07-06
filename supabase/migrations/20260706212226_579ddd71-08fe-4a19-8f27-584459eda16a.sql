
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Grant admin only for verified email match
CREATE OR REPLACE FUNCTION public.grant_admin_for_verified_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) = 'eiompssocial@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_admin
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.grant_admin_for_verified_email();
DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_admin
AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_admin_for_verified_email();

-- Backfill for existing admin (if account already exists & confirmed)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
WHERE lower(email) = 'eiompssocial@gmail.com' AND email_confirmed_at IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- ============ APP SETTINGS (official account pointer) ============
CREATE TABLE public.app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  official_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO authenticated, anon;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable" ON public.app_settings FOR SELECT USING (true);
INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- ============ PROFILE FLAGS ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_reason TEXT,
  ADD COLUMN IF NOT EXISTS reputation_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interests TEXT[] NOT NULL DEFAULT '{}';

-- Admins can update any profile (ban/verify/etc)
DROP POLICY IF EXISTS "admins update any profile" ON public.profiles;
CREATE POLICY "admins update any profile" ON public.profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Prevent normal users from touching official account
DROP POLICY IF EXISTS "block writes on official" ON public.profiles;

-- ============ POSTS: pinned + admin posting as official ============
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "admins update any post" ON public.posts;
CREATE POLICY "admins update any post" ON public.posts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins delete any post" ON public.posts;
CREATE POLICY "admins delete any post" ON public.posts FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============ SUGGESTED ACCOUNTS ============
CREATE TABLE public.suggested_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);
GRANT SELECT ON public.suggested_accounts TO authenticated, anon;
GRANT ALL ON public.suggested_accounts TO service_role;
ALTER TABLE public.suggested_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sugg readable" ON public.suggested_accounts FOR SELECT USING (true);
CREATE POLICY "admins manage sugg" ON public.suggested_accounts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ AIRDROPS ============
CREATE TABLE public.airdrops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  project TEXT NOT NULL,
  description TEXT,
  reward TEXT,
  url TEXT,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.airdrops TO authenticated, anon;
GRANT ALL ON public.airdrops TO service_role;
ALTER TABLE public.airdrops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "airdrops readable" ON public.airdrops FOR SELECT USING (true);
CREATE POLICY "admins manage airdrops" ON public.airdrops FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ SPACES (stub) ============
CREATE TABLE public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_for TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spaces TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.spaces TO authenticated;
GRANT ALL ON public.spaces TO service_role;
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spaces readable" ON public.spaces FOR SELECT USING (true);
CREATE POLICY "pro users create spaces" ON public.spaces FOR INSERT TO authenticated
WITH CHECK (auth.uid() = host_id AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_pro = true));
CREATE POLICY "hosts manage own" ON public.spaces FOR UPDATE TO authenticated USING (auth.uid() = host_id);
CREATE POLICY "hosts delete own" ON public.spaces FOR DELETE TO authenticated USING (auth.uid() = host_id);

-- ============ REPUTATION recompute helper ============
CREATE OR REPLACE FUNCTION public.recompute_reputation(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  posts_c INT; likes_r INT; comments_r INT; followers_c INT; score INT;
BEGIN
  SELECT COUNT(*) INTO posts_c FROM public.posts WHERE author_id = _user_id;
  SELECT COALESCE(SUM(likes_count),0) INTO likes_r FROM public.posts WHERE author_id = _user_id;
  SELECT COALESCE(SUM(comments_count),0) INTO comments_r FROM public.posts WHERE author_id = _user_id;
  SELECT COUNT(*) INTO followers_c FROM public.follows WHERE following_id = _user_id;
  score := (posts_c * 2) + likes_r + (comments_r * 2) + (followers_c * 5);
  UPDATE public.profiles SET reputation_score = score WHERE id = _user_id;
END; $$;

-- ============ UPDATED handle_new_user: auto-follow official + backfill interests ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  base_username TEXT; final_username TEXT; counter INT := 0;
  new_count INT; fm_num INT := NULL; pro_until_ts TIMESTAMPTZ := NULL;
  official UUID; new_id UUID;
  interests_arr TEXT[] := '{}';
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

  UPDATE public.founding_member_counter SET count = count + 1 WHERE id = true RETURNING count INTO new_count;
  IF new_count <= 100 THEN
    fm_num := new_count;
    pro_until_ts := now() + interval '30 days';
  END IF;

  BEGIN
    interests_arr := ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'interests'));
  EXCEPTION WHEN OTHERS THEN interests_arr := '{}';
  END;

  INSERT INTO public.profiles (id, username, full_name, avatar_url, linkshine_url, founding_member_number, is_pro, pro_until, interests)
  VALUES (
    NEW.id, final_username,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    'eiomps.app/dm/' || final_username,
    fm_num, fm_num IS NOT NULL, pro_until_ts, interests_arr
  ) RETURNING id INTO new_id;

  SELECT official_user_id INTO official FROM public.app_settings WHERE id = true;
  IF official IS NOT NULL AND official <> new_id THEN
    INSERT INTO public.follows (follower_id, following_id) VALUES (new_id, official)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;
