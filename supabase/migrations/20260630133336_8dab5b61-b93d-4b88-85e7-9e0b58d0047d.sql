
-- Posts: media support + remove 500 char cap for richer posts
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_content_check;
ALTER TABLE public.posts ALTER COLUMN content DROP NOT NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS media_type text CHECK (media_type IN ('image','video','audio'));
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS transcript text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS bookmarks_count integer NOT NULL DEFAULT 0;

-- Profiles: banner
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url text;

-- COMMENTS
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text,
  media_url text,
  media_type text CHECK (media_type IN ('image','video','audio')),
  transcript text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_post_idx ON public.comments(post_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT SELECT ON public.comments TO anon;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments viewable by all" ON public.comments FOR SELECT USING (true);
CREATE POLICY "auth create comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "authors delete own comments" ON public.comments FOR DELETE USING (auth.uid() = author_id);
CREATE POLICY "authors update own comments" ON public.comments FOR UPDATE USING (auth.uid() = author_id);

-- BOOKMARKS
CREATE TABLE IF NOT EXISTS public.bookmarks (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
GRANT SELECT, INSERT, DELETE ON public.bookmarks TO authenticated;
GRANT ALL ON public.bookmarks TO service_role;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bookmarks read" ON public.bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own bookmarks write" ON public.bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own bookmarks delete" ON public.bookmarks FOR DELETE USING (auth.uid() = user_id);

-- FOLLOWS
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT SELECT ON public.follows TO anon;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows viewable by all" ON public.follows FOR SELECT USING (true);
CREATE POLICY "auth create own follow" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "auth delete own follow" ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- Counter triggers
CREATE OR REPLACE FUNCTION public.handle_comment_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pa uuid;
BEGIN
  UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id RETURNING author_id INTO pa;
  IF pa IS NOT NULL AND pa <> NEW.author_id THEN
    INSERT INTO public.notifications(user_id, actor_id, type, post_id) VALUES (pa, NEW.author_id, 'comment', NEW.post_id);
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.handle_comment_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN UPDATE public.posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id; RETURN OLD; END $$;
DROP TRIGGER IF EXISTS comments_ins ON public.comments;
CREATE TRIGGER comments_ins AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.handle_comment_insert();
DROP TRIGGER IF EXISTS comments_del ON public.comments;
CREATE TRIGGER comments_del AFTER DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.handle_comment_delete();

CREATE OR REPLACE FUNCTION public.handle_bookmark_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN UPDATE public.posts SET bookmarks_count = bookmarks_count + 1 WHERE id = NEW.post_id; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.handle_bookmark_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN UPDATE public.posts SET bookmarks_count = GREATEST(bookmarks_count - 1, 0) WHERE id = OLD.post_id; RETURN OLD; END $$;
DROP TRIGGER IF EXISTS bookmarks_ins ON public.bookmarks;
CREATE TRIGGER bookmarks_ins AFTER INSERT ON public.bookmarks FOR EACH ROW EXECUTE FUNCTION public.handle_bookmark_insert();
DROP TRIGGER IF EXISTS bookmarks_del ON public.bookmarks;
CREATE TRIGGER bookmarks_del AFTER DELETE ON public.bookmarks FOR EACH ROW EXECUTE FUNCTION public.handle_bookmark_delete();

-- Re-attach like triggers if missing (idempotent)
DROP TRIGGER IF EXISTS likes_ins ON public.likes;
CREATE TRIGGER likes_ins AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.handle_like_insert();
DROP TRIGGER IF EXISTS likes_del ON public.likes;
CREATE TRIGGER likes_del AFTER DELETE ON public.likes FOR EACH ROW EXECUTE FUNCTION public.handle_like_delete();
