import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Mood, Track, Weekday } from "../lib/rhythm";

export type RhythmMap = Record<Track, Partial<Record<Weekday, string>>>;

export function useRhythmEntries(userId: string | undefined) {
  const [entries, setEntries] = useState<RhythmMap>({ content: {}, music: {} });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("rhythm_entries")
      .select("track, weekday, text")
      .eq("user_id", userId);
    if (!error && data) {
      const map: RhythmMap = { content: {}, music: {} };
      for (const row of data) {
        map[row.track as Track][row.weekday as Weekday] = row.text;
      }
      setEntries(map);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveEntry = async (track: Track, weekday: Weekday, text: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from("rhythm_entries")
      .upsert({ user_id: userId, track, weekday, text }, { onConflict: "user_id,track,weekday" });
    if (!error) await refresh();
    return error?.message ?? null;
  };

  const clearEntry = async (track: Track, weekday: Weekday) => {
    if (!userId) return;
    await supabase.from("rhythm_entries").delete().eq("user_id", userId).eq("track", track).eq("weekday", weekday);
    await refresh();
  };

  const bulkInsert = async (rows: { track: Track; weekday: Weekday; text: string }[]) => {
    if (!userId || rows.length === 0) return;
    await supabase
      .from("rhythm_entries")
      .upsert(
        rows.map((r) => ({ user_id: userId, ...r })),
        { onConflict: "user_id,track,weekday" }
      );
    await refresh();
  };

  return { entries, loading, saveEntry, clearEntry, bulkInsert, refresh };
}

export interface CheckinRow {
  date: string;
  types: string[];
  mood: Mood;
  mood_bonus: number;
  xp_awarded: number;
}

export function useCheckins(userId: string | undefined) {
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("daily_checkins")
      .select("date, types, mood, mood_bonus, xp_awarded")
      .eq("user_id", userId)
      .order("date", { ascending: false });
    if (!error && data) setCheckins(data as CheckinRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { checkins, loading, refresh };
}

export function useRhythmCompletions(userId: string | undefined, date: string) {
  const [done, setDone] = useState<Record<Track, boolean>>({ content: false, music: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("rhythm_completions")
      .select("track")
      .eq("user_id", userId)
      .eq("date", date);
    if (!error && data) {
      setDone({
        content: data.some((r) => r.track === "content"),
        music: data.some((r) => r.track === "music"),
      });
    }
    setLoading(false);
  }, [userId, date]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Returns the new completed state, so the caller can decide whether to award/revoke XP. */
  const toggle = async (track: Track): Promise<boolean> => {
    if (!userId) return done[track];
    const wasDone = done[track];
    if (wasDone) {
      await supabase.from("rhythm_completions").delete().eq("user_id", userId).eq("date", date).eq("track", track);
    } else {
      await supabase.from("rhythm_completions").insert({ user_id: userId, date, track });
    }
    setDone((prev) => ({ ...prev, [track]: !wasDone }));
    return !wasDone;
  };

  return { done, loading, toggle, refresh };
}

/** Atomic XP add/subtract via the increment_xp RPC. Returns the new total, or null on failure. */
export async function addXp(delta: number): Promise<number | null> {
  if (delta === 0) return null;
  const { data, error } = await supabase.rpc("increment_xp", { delta });
  if (error) return null;
  return data as number;
}
