import { Check, ExternalLink, Music2, Play, X } from "lucide-react";
import { useState } from "react";
import type { SpotifyActivity } from "@workhard/shared";
import { ApiError, playSpotifySong } from "../api";
import { IconButton } from "../components/IconButton";
import { SpotifyMark } from "./SpotifyMark";
import "./spotify.css";

export function SpotifySongDetails({ activity, own, onClose, onSettings }: {
  activity: SpotifyActivity | undefined;
  own: boolean;
  onClose: () => void;
  onSettings: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [playedTrack, setPlayedTrack] = useState<string>();
  const [error, setError] = useState<{ trackId: string; message: string; connect: boolean }>();
  const play = async () => {
    if (!activity) return;
    setBusy(true);
    setError(undefined);
    try {
      await playSpotifySong(activity.userId, activity.trackId);
      setPlayedTrack(activity.trackId);
    } catch (failure) {
      setError({ trackId: activity.trackId, message: failure instanceof Error ? failure.message : "Spotify could not play this song. Try again.",
        connect: failure instanceof ApiError && failure.code === "SPOTIFY_RECONNECT" });
    } finally {
      setBusy(false);
    }
  };
  const visibleError = error?.trackId === activity?.trackId ? error : undefined;
  return <section className="spotify-song" aria-label="Listening activity" aria-live="polite">
    <header><span><SpotifyMark />Spotify</span><IconButton label="Close song details" icon={X} onClick={onClose} /></header>
    {activity ? <>
      <a className="spotify-track" href={activity.trackUrl} target="_blank" rel="noopener noreferrer">
        {activity.artworkUrl ? <img src={activity.artworkUrl} alt={`${activity.album} album artwork`} referrerPolicy="no-referrer" />
          : <span className="spotify-artwork-empty"><Music2 size={25} /></span>}
        <span className="spotify-track-text"><strong>{activity.title}</strong><span>{activity.artist}</span></span>
      </a>
      <div className="spotify-buttons">
        {!own && <button className="primary-button" disabled={busy} onClick={() => void play()}>
          {playedTrack === activity.trackId ? <Check size={15} /> : <Play size={15} />}Play on my Spotify
        </button>}
        <a className="secondary-button" href={activity.trackUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Open in Spotify</a>
        {activity.jamUrl && <a className="secondary-button" href={activity.jamUrl} target="_blank" rel="noopener noreferrer"><Music2 size={15} />Join Jam</a>}
      </div>
      {visibleError && <div className="spotify-error" role="alert"><p>{visibleError.message}</p>
        {visibleError.connect && <button className="secondary-button" onClick={onSettings}>Open Spotify settings</button>}
      </div>}
    </> : <p className="spotify-muted">No listening activity.</p>}
  </section>;
}
