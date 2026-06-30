import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Transcribe an audio file already uploaded to the `media` Supabase storage bucket.
 * Downloads via service role, forwards bytes to Lovable AI gpt-4o-mini-transcribe,
 * returns the text. Caller writes the transcript back to the row it belongs to.
 */
export const transcribeStorageAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const data = input as { path?: unknown; mime?: unknown };
    if (typeof data?.path !== "string" || data.path.length === 0) {
      throw new Error("path is required");
    }
    const mime = typeof data.mime === "string" ? data.mime : "audio/webm";
    return { path: data.path, mime };
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file, error } = await supabaseAdmin.storage.from("media").download(data.path);
    if (error || !file) throw new Error(error?.message || "audio not found");

    const extByMime: Record<string, string> = {
      "audio/webm": "webm",
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
    };
    const baseMime = data.mime.split(";")[0];
    const ext = extByMime[baseMime] ?? "webm";

    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", file, `audio.${ext}`);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Transcription failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as { text?: string };
    return { text: json.text ?? "" };
  });
