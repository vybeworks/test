import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Platform } from "../lib/releaseToolkit";

export interface Release {
  id: string;
  title: string;
  release_date: string;
}

export function useReleases(userId: string | undefined) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("releases")
      .select("id, title, release_date")
      .eq("user_id", userId)
      .order("release_date", { ascending: true });
    if (!error && data) setReleases(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addRelease = async (title: string, releaseDate: string) => {
    if (!userId) return null;
    const { error } = await supabase.from("releases").insert({ user_id: userId, title, release_date: releaseDate });
    if (!error) await refresh();
    return error?.message ?? null;
  };

  const removeRelease = async (id: string) => {
    if (!userId) return;
    await supabase.from("releases").delete().eq("user_id", userId).eq("id", id);
    await refresh();
  };

  return { releases, loading, addRelease, removeRelease, refresh };
}

export function useRolloutCompletions(userId: string | undefined, releaseId: string | undefined) {
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId || !releaseId) {
      setCompleted(new Set());
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("rollout_completions")
      .select("step_index")
      .eq("user_id", userId)
      .eq("release_id", releaseId);
    if (!error && data) setCompleted(new Set(data.map((r) => r.step_index)));
    setLoading(false);
  }, [userId, releaseId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = async (stepIndex: number): Promise<boolean> => {
    if (!userId || !releaseId) return completed.has(stepIndex);
    const wasDone = completed.has(stepIndex);
    if (wasDone) {
      await supabase
        .from("rollout_completions")
        .delete()
        .eq("user_id", userId)
        .eq("release_id", releaseId)
        .eq("step_index", stepIndex);
    } else {
      await supabase.from("rollout_completions").insert({ user_id: userId, release_id: releaseId, step_index: stepIndex });
    }
    setCompleted((prev) => {
      const next = new Set(prev);
      if (wasDone) next.delete(stepIndex);
      else next.add(stepIndex);
      return next;
    });
    return !wasDone;
  };

  return { completed, loading, toggle, refresh };
}

export interface PerformanceEntry {
  id: string;
  platform: Platform;
  post_date: string;
  content_type: string | null;
  views: number;
  likes: number;
  comments: number;
  follows_gained: number;
  note: string | null;
  source: "manual" | "instagram_api" | "youtube_api";
  is_trial_reel: boolean;
  thumbnail_url: string | null;
  content_format: "reel" | "feed" | "story" | "short" | "video" | null;
}

export function usePerformanceEntries(userId: string | undefined) {
  const [entries, setEntries] = useState<PerformanceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("performance_entries")
      .select(
        "id, platform, post_date, content_type, views, likes, comments, follows_gained, note, source, is_trial_reel, thumbnail_url, content_format"
      )
      .eq("user_id", userId)
      .order("post_date", { ascending: false });
    if (!error && data) setEntries(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addEntry = async (entry: {
    platform: Platform;
    post_date: string;
    content_type: string | null;
    views: number;
    likes: number;
    comments: number;
    follows_gained: number;
    note: string | null;
    is_trial_reel: boolean;
  }) => {
    if (!userId) return null;
    const { error } = await supabase.from("performance_entries").insert({ user_id: userId, ...entry });
    if (!error) await refresh();
    return error?.message ?? null;
  };

  const removeEntry = async (id: string) => {
    if (!userId) return;
    await supabase.from("performance_entries").delete().eq("user_id", userId).eq("id", id);
    await refresh();
  };

  /** Toggles the Trial Reel tag on an existing entry - manual or auto-synced - without a full edit form. */
  const setTrialReelTag = async (id: string, isTrialReel: boolean) => {
    if (!userId) return null;
    const { error } = await supabase
      .from("performance_entries")
      .update({ is_trial_reel: isTrialReel })
      .eq("user_id", userId)
      .eq("id", id);
    if (!error) await refresh();
    return error?.message ?? null;
  };

  return { entries, loading, addEntry, removeEntry, setTrialReelTag, refresh };
}

/** Lightweight fetch of just the platform column, for the GRIND Score's stats component. */
export function usePlatformsLogged(userId: string | undefined) {
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set());

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("performance_entries")
      .select("platform")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (!error && data) setPlatforms(new Set(data.map((r) => r.platform as Platform)));
      });
  }, [userId]);

  return platforms;
}

/** Count of rollout steps completed across all of the user's releases, for the GRIND Score. */
export function useRolloutStepsCompletedTotal(userId: string | undefined) {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("rollout_completions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .then(({ count, error }) => {
        if (!error && count !== null) setTotal(count);
      });
  }, [userId]);

  return total;
}
