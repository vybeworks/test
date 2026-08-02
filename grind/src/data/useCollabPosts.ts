import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { CollabCategory, ContactMethod } from "../lib/collab";

export interface CollabPost {
  id: string;
  user_id: string;
  poster_display_name: string | null;
  category: CollabCategory;
  title: string;
  description: string;
  contact_method: ContactMethod | null;
  contact_value: string | null;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
}

/**
 * Fetches every visible post, not just the current user's - the first hook
 * in this app where that's true. RLS already scopes this correctly (any
 * authenticated user can browse every row), so the query itself needs no
 * user_id filter; callers split into "Browse" (status === 'open') vs.
 * "My Posts" (user_id === the current user) client-side, same pattern as
 * the Track page's platform view-filter tabs.
 */
export function useCollabPosts(userId: string | undefined) {
  const [posts, setPosts] = useState<CollabPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error: fetchError } = await supabase
      .from("collab_posts")
      .select(
        "id, user_id, poster_display_name, category, title, description, contact_method, contact_value, status, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      // Explicit, generous ceiling rather than trusting Supabase's
      // project-level default - a query silently returning fewer rows than
      // exist looks identical to "that's all of them" (see the same fix on
      // usePerformanceEntries).
      .limit(5000);
    if (fetchError) {
      setError(fetchError.message);
    } else if (data) {
      setError(null);
      setPosts(data as CollabPost[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addPost = async (fields: {
    category: CollabCategory;
    title: string;
    description: string;
    contactMethod: ContactMethod | null;
    contactValue: string | null;
    posterDisplayName: string | null;
  }): Promise<string | null> => {
    if (!userId) return null;
    const { error } = await supabase.from("collab_posts").insert({
      user_id: userId,
      poster_display_name: fields.posterDisplayName,
      category: fields.category,
      title: fields.title,
      description: fields.description,
      contact_method: fields.contactMethod,
      contact_value: fields.contactValue,
    });
    if (!error) await refresh();
    // Surfaces the open-post-cap trigger's exact message (see
    // enforce_open_collab_post_cap in 0018_collab_board.sql) directly to
    // the user, not just a generic "insert failed."
    return error?.message ?? null;
  };

  const updatePost = async (
    id: string,
    fields: Partial<{
      category: CollabCategory;
      title: string;
      description: string;
      contact_method: ContactMethod | null;
      contact_value: string | null;
      status: "open" | "closed";
    }>
  ): Promise<string | null> => {
    if (!userId) return null;
    const { error } = await supabase.from("collab_posts").update(fields).eq("id", id).eq("user_id", userId);
    if (!error) await refresh();
    return error?.message ?? null;
  };

  const removePost = async (id: string) => {
    if (!userId) return;
    await supabase.from("collab_posts").delete().eq("id", id).eq("user_id", userId);
    await refresh();
  };

  const reportPost = async (postId: string, reason: string): Promise<string | null> => {
    if (!userId) return null;
    const { error } = await supabase
      .from("collab_post_reports")
      .insert({ post_id: postId, reporter_user_id: userId, reason: reason.trim() || null });
    return error?.message ?? null;
  };

  return { posts, loading, error, addPost, updatePost, removePost, reportPost, refresh };
}
