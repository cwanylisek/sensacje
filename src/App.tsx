import { useState, useEffect, useCallback } from "react";
import "./App.css";

const CHANNEL_ID = "UCMBJUdOsTFMFpFAyWAMFkqg"; // Sensacje XX Wieku channel

const STORAGE_KEY_APIKEY = "sensacje_yt_apikey";
const STORAGE_KEY_VIDEOS = "sensacje_yt_videos";
const STORAGE_KEY_HISTORY = "sensacje_yt_history";

interface VideoItem {
  id: string;
  title: string;
  thumb?: string;
  publishedAt: string;
}

interface YouTubeApiError {
  error?: {
    message?: string;
  };
}

interface YouTubeChannelResponse extends YouTubeApiError {
  items?: Array<{
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
}

interface YouTubePlaylistResponse extends YouTubeApiError {
  items?: Array<{
    snippet?: {
      title?: string;
      publishedAt?: string;
      resourceId?: {
        videoId?: string;
      };
      thumbnails?: {
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
  nextPageToken?: string;
}

const formatDate = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export default function SensacjePlayer() {
  const [apiKey, setApiKey] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY_APIKEY) || "",
  );
  const [apiKeyDraft, setApiKeyDraft] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY_APIKEY) || "",
  );
  const [videos, setVideos] = useState<VideoItem[]>(() =>
    safeParse<VideoItem[]>(localStorage.getItem(STORAGE_KEY_VIDEOS), []),
  );
  const [history, setHistory] = useState<VideoItem[]>(() =>
    safeParse<VideoItem[]>(localStorage.getItem(STORAGE_KEY_HISTORY), []),
  );
  const [current, setCurrent] = useState<VideoItem | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [fetching, setFetching] = useState<boolean>(false);

  const saveApiKey = (): void => {
    const trimmed = apiKeyDraft.trim();
    setApiKey(trimmed);
    localStorage.setItem(STORAGE_KEY_APIKEY, trimmed);
    setVideos([]);
    localStorage.removeItem(STORAGE_KEY_VIDEOS);
    setError("");
  };

  const fetchAllVideos = useCallback(async (key: string): Promise<void> => {
    if (!key) return;
    setFetching(true);
    setError("");
    let allVideos: VideoItem[] = [];
    let pageToken = "";

    try {
      // First: get uploads playlist ID
      const channelRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${key}`,
      );
      const channelData: YouTubeChannelResponse = await channelRes.json();

      if (channelData.error) {
        throw new Error(channelData.error.message || "YouTube API error.");
      }

      const uploadsId =
        channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsId)
        throw new Error("Could not find uploads playlist for the channel.");

      // Paginate through playlist
      do {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=50&key=${key}${pageToken ? `&pageToken=${pageToken}` : ""}`;
        const res = await fetch(url);
        const data: YouTubePlaylistResponse = await res.json();
        if (data.error) throw new Error(data.error.message);

        const items: VideoItem[] = (data.items || [])
          .filter(
            (i) =>
              i.snippet?.resourceId?.videoId &&
              i.snippet?.title !== "Private video",
          )
          .map((i) => ({
            id: i.snippet!.resourceId!.videoId as string,
            title: i.snippet!.title as string,
            thumb:
              i.snippet?.thumbnails?.medium?.url ||
              i.snippet?.thumbnails?.default?.url,
            publishedAt: i.snippet!.publishedAt as string,
          }));

        allVideos = [...allVideos, ...items];
        pageToken = data.nextPageToken || "";
      } while (pageToken);

      setVideos(allVideos);
      localStorage.setItem(STORAGE_KEY_VIDEOS, JSON.stringify(allVideos));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error fetching data from YouTube.",
      );
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (apiKey && videos.length === 0) {
      fetchAllVideos(apiKey);
    }
  }, [apiKey, videos.length, fetchAllVideos]);

  const pickRandom = (): void => {
    if (!apiKey) {
      setError("Please enter your YouTube API key first.");
      return;
    }
    if (videos.length === 0) {
      fetchAllVideos(apiKey);
      return;
    }

    setLoading(true);
    setError("");

    // Exclude recently watched (last 10)
    const recentIds = history.slice(0, 10).map((h) => h.id);
    const pool = videos.filter((v) => !recentIds.includes(v.id));
    const source = pool.length > 0 ? pool : videos;
    const pick = source[Math.floor(Math.random() * source.length)];

    setCurrent(pick);

    const newHistory = [pick, ...history.filter((h) => h.id !== pick.id)].slice(
      0,
      20,
    );
    setHistory(newHistory);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(newHistory));

    setTimeout(() => setLoading(false), 300);
  };

  const openVideo = (vid: VideoItem): void => {
    window.open(
      `https://www.youtube.com/watch?v=${vid.id}`,
      "_blank",
      "noopener",
    );
  };

  const openCurrent = (): void => {
    if (current) openVideo(current);
  };

  const clearCache = (): void => {
    setVideos([]);
    localStorage.removeItem(STORAGE_KEY_VIDEOS);
    fetchAllVideos(apiKey);
  };

  return (
    <>
      <div className="app">
        {/* HEADER */}
        <header className="header">
          <p className="eyebrow">Wieczorny seans</p>
          <h1 className="title">
            Sensacje
            <br />
            <em>XX wieku</em>
          </h1>
          <p className="subtitle">Losowy odcinek · jednym kliknięciem</p>
        </header>

        {/* API KEY */}
        <div className="api-section">
          <label className="api-label">YouTube API Key</label>
          <div className="api-row">
            <input
              className="api-input"
              type="password"
              placeholder="AIza..."
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveApiKey()}
            />
            <button className="api-save-btn" onClick={saveApiKey}>
              Zapisz
            </button>
          </div>
          <p className="api-hint">
            Klucz znajdziesz w{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Cloud Console
            </a>{" "}
            → YouTube Data API v3. Przechowywany lokalnie w przeglądarce.
          </p>
        </div>

        {/* BIG BUTTON */}
        <div className="play-zone">
          <button
            className="big-btn"
            onClick={pickRandom}
            disabled={fetching || loading || !apiKey}
            title="Losuj odcinek"
          >
            <span className={`btn-icon ${fetching ? "spin" : ""}`}>
              {fetching ? "⟳" : "▶"}
            </span>
            <span className="btn-label">
              {fetching ? "Ładuję..." : loading ? "Losuję..." : "Losuj"}
            </span>
          </button>

          {videos.length > 0 && (
            <p className="pool-count">
              <span>{videos.length}</span> odcinków w bazie
            </p>
          )}
        </div>

        {/* ERROR */}
        {error && <div className="message error">{error}</div>}

        {/* VIDEO CARD */}
        {current && !error && (
          <div className="video-card">
            <div className="video-thumb-wrap" onClick={openCurrent}>
              {current.thumb && (
                <img
                  className="video-thumb"
                  src={current.thumb}
                  alt={current.title}
                />
              )}
              <div className="play-overlay">
                <div className="play-triangle">
                  <svg viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="video-meta">
              <h2 className="video-title">{current.title}</h2>
              <p className="video-date">{formatDate(current.publishedAt)}</p>
              <div className="video-actions">
                <a
                  className="action-btn action-btn-primary"
                  href={`https://www.youtube.com/watch?v=${current.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ▶ Oglądaj na YouTube
                </a>
                <button
                  className="action-btn action-btn-secondary"
                  onClick={pickRandom}
                >
                  ↺ Inny odcinek
                </button>
                <button
                  className="action-btn action-btn-secondary"
                  onClick={clearCache}
                  title="Odśwież listę odcinków"
                >
                  ⟳ Odśwież bazę
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HISTORY */}
        {history.length > 1 && (
          <div className="history-section">
            <p className="history-label">Ostatnio losowane</p>
            <div className="history-list">
              {history.slice(1, 6).map((v) => (
                <button
                  key={v.id}
                  className="history-item"
                  onClick={() => openVideo(v)}
                >
                  {v.thumb && (
                    <img className="history-thumb" src={v.thumb} alt="" />
                  )}
                  <span className="history-title">{v.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
