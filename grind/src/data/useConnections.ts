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
  has_analytics_scope: boolean;
}

export function useConnectionStatus(userId: string | undefined) {
  const [statuses, setStatuses] = useState<Partial<Record<Platform, ConnectionStatus>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error: fetchError } = await supabase
      .from("platform_connection_status")
      .select("platform, external_account_label, follower_count, connected_at, last_synced_at, last_sync_error, has_analytics_scope")
      .eq("user_id", userId);
    if (fetchError) {
      // Surfaced instead of silently leaving `statuses` at its last-known
      // value - a failed fetch here used to look identical to "nothing is
      // connected," which is exactly wrong when connections actually exist
      // and the query itself is broken (e.g. a column a migration hasn't
      // been applied yet).
      setError(fetchError.message);
    } else if (data) {
      setError(null);
      const map: Partial<Record<Platform, ConnectionStatus>> = {};
      for (const row of data as ConnectionStatus[]) map[row.platform] = row;
      setStatuses(map);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { statuses, loading, error, refresh };
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
