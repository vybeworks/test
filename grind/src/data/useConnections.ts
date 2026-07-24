import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Platform } from "../lib/releaseToolkit";

export interface ConnectionStatus {
  platform: Platform;
  external_account_label: string | null;
  connected_at: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
}

export function useConnectionStatus(userId: string | undefined) {
  const [statuses, setStatuses] = useState<Partial<Record<Platform, ConnectionStatus>>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("platform_connection_status")
      .select("platform, external_account_label, connected_at, last_synced_at, last_sync_error")
      .eq("user_id", userId);
    if (!error && data) {
      const map: Partial<Record<Platform, ConnectionStatus>> = {};
      for (const row of data as ConnectionStatus[]) map[row.platform] = row;
      setStatuses(map);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { statuses, loading, refresh };
}

/** Starts the YouTube OAuth flow: gets Google's auth URL from the Edge Function, then navigates there. */
export async function connectYoutube(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("youtube-oauth-start");
  if (error || !data?.url) {
    return error?.message ?? "Could not start YouTube connection";
  }
  window.location.href = data.url;
  return null;
}
