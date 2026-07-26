import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Platform } from "../lib/releaseToolkit";

export interface ConnectionStatus {
  platform: Platform;
  external_account_label: string | null;
  follower_count: number | null;
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
      .select("platform, external_account_label, follower_count, connected_at, last_synced_at, last_sync_error")
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

/** Gets the platform's authorization URL from its start function, then navigates there. */
async function startOAuth(functionName: string, platformLabel: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke(functionName);
  if (error || !data?.url) {
    return error?.message ?? `Could not start ${platformLabel} connection`;
  }
  window.location.href = data.url;
  return null;
}

export function connectYoutube(): Promise<string | null> {
  return startOAuth("youtube-oauth-start", "YouTube");
}

export function connectInstagram(): Promise<string | null> {
  return startOAuth("instagram-oauth-start", "Instagram");
}
