import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";

// The workflow portal is the single source of truth. Every page mount asks the
// backend to re-pull it (server-side throttle keeps that cheap) and refetches the
// affected queries when anything actually changed.
const KEYS = ["summary", "vendors", "vendor", "bills", "work-orders", "bill-changes", "sync-status", "sync-runs"];
let inFlight = null;

export function useAutoSync(enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    inFlight = inFlight || apiPost("/sync/auto").finally(() => { inFlight = null; });
    inFlight
      .then((res) => {
        if (!cancelled && res?.synced) KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled, qc]);
}
