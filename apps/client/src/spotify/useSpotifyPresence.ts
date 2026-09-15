import { useCallback, useEffect, useState } from "react";
import type { ServerEvent, SpotifyActivity } from "@workhard/shared";

export function useSpotifyPresence() {
  const [activities, setActivities] = useState<Record<string, SpotifyActivity>>({});
  const handleEvent = useCallback((event: ServerEvent) => {
    if (event.type === "spotify.snapshot") {
      setActivities(Object.fromEntries(event.activities.filter((activity) => activity.expiresAt > event.serverTime)
        .map((activity) => [activity.userId, { ...activity, expiresAt: Date.now() + Math.min(30_000, activity.expiresAt - event.serverTime) }])));
    } else if (event.type === "spotify.activity") {
      setActivities((current) => {
        const next = { ...current };
        if (event.activity && event.activity.expiresAt > event.serverTime) next[event.userId] = {
          ...event.activity, expiresAt: Date.now() + Math.min(30_000, event.activity.expiresAt - event.serverTime),
        };
        else delete next[event.userId];
        return next;
      });
    }
  }, []);
  const clear = useCallback(() => setActivities({}), []);
  useEffect(() => {
    const prune = () => setActivities((current) => {
      const entries = Object.entries(current).filter(([, activity]) => activity.expiresAt > Date.now());
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
    const timer = window.setInterval(prune, 500);
    document.addEventListener("visibilitychange", prune);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", prune); };
  }, []);
  return { activities, handleEvent, clear };
}
