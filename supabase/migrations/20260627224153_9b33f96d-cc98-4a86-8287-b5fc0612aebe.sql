
-- Profession enum
CREATE TYPE public.profession AS ENUM ('web3_designer','nft_artist','dao_developer','crypto_trader','community_manager','other');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  wallet_address TEXT,
  profession public.profession DEFAULT 'other',
  profession_other TEXT,
  linkshine_url TEXT,
  linkshine_public BOOLEAN NOT NULL DEFAULT true,
  theme_color TEXT DEFAULT '#8b5cf6',
  x_handle TEXT,
  instagram_handle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- POSTS
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT ON public.posts TO anon;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Posts are viewable by everyone" ON public.posts FOR SELECT USING (true);
CREATE POLICY "Authenticated can create posts" ON public.posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update own posts" ON public.posts FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Authors can delete own posts" ON public.posts FOR DELETE USING (auth.uid() = author_id);
CREATE INDEX posts_author_id_idx ON public.posts(author_id);
CREATE INDEX posts_created_at_idx ON public.posts(created_at DESC);

-- LIKES
CREATE TABLE public.likes (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
GRANT SELECT, INSERT, DELETE ON public.likes TO authenticated;
GRANT SELECT ON public.likes TO anon;
GRANT ALL ON public.likes TO service_role;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Likes viewable by everyone" ON public.likes FOR SELECT USING (true);
CREATE POLICY "Users can like" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- CONVERSATIONS (1:1, deterministic via sorted user pair)
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_pair_ordered CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view conversations" ON public.conversations FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "Participants can create conversations" ON public.conversations FOR INSERT WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "Participants can update conversations" ON public.conversations FOR UPDATE USING (auth.uid() = user_a OR auth.uid() = user_b);

-- MESSAGES
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can read messages" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (auth.uid() = c.user_a OR auth.uid() = c.user_b))
);
CREATE POLICY "Sender can send messages" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (auth.uid() = c.user_a OR auth.uid() = c.user_b))
);
CREATE INDEX messages_conversation_id_idx ON public.messages(conversation_id, created_at);

-- NOTIFICATIONS
CREATE TYPE public.notification_type AS ENUM ('like','message','follow','mention');
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated can create notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
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
  INSERT INTO public.profiles (id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    final_username,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: bump last_message_at on new message
CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_message_insert AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_last_message();

-- Trigger: maintain post likes_count + create notification
CREATE OR REPLACE FUNCTION public.handle_like_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pa UUID;
BEGIN
  UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id RETURNING author_id INTO pa;
  IF pa IS NOT NULL AND pa <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id) VALUES (pa, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_like_insert AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.handle_like_insert();

CREATE OR REPLACE FUNCTION public.handle_like_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER on_like_delete AFTER DELETE ON public.likes FOR EACH ROW EXECUTE FUNCTION public.handle_like_delete();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
