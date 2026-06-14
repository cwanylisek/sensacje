import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

const CHANNEL_ID = "UCWljECeVQz5jbHRQmyoMTHA"; // Sensacje XX Wieku channel
const CLOUD_CONSOLE_URL = "https://console.cloud.google.com/apis/credentials";

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

type LineKind =
  | "prompt"
  | "output"
  | "error"
  | "dim"
  | "accent"
  | "banner"
  | "video";

interface TerminalLine {
  kind: LineKind;
  text?: string;
  video?: VideoItem;
}

const BANNER = String.raw`
 ████ █████ █   █  ████  ███   ███    ███ █████ 
█     █     ██  █ █     █   █ █        █  █     
 ███  ████  █ █ █  ███  █████ █        █  ████  
    █ █     █  ██     █ █   █ █     █  █  █     
████  █████ █   █ ████  █   █  ███   ██   █████ 
                           
  X X   W I E K U   ::  RANDOM EPISODE PLAYER
`;

const HELP_TEXT = [
  "Available commands:",
  "  play              random episode from the channel",
  "  apikey <value>    store your YouTube Data API v3 key",
  "  apikey            show whether a key is currently stored",
  "  getapi            open Google Cloud Console to create a key",
  "  help              show this message",
  "  clear             clear the terminal",
].join("\n");

const formatDate = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
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

const maskKey = (key: string): string => {
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}${"*".repeat(key.length - 8)}${key.slice(-4)}`;
};

export default function SensacjePlayer() {
  const [apiKey, setApiKey] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY_APIKEY) || "",
  );
  const [videos, setVideos] = useState<VideoItem[]>(() =>
    safeParse<VideoItem[]>(localStorage.getItem(STORAGE_KEY_VIDEOS), []),
  );
  const [history, setHistory] = useState<VideoItem[]>(() =>
    safeParse<VideoItem[]>(localStorage.getItem(STORAGE_KEY_HISTORY), []),
  );
  const [input, setInput] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [lines, setLines] = useState<TerminalLine[]>([
    { kind: "banner", text: BANNER },
    { kind: "dim", text: "type 'help' to list available commands" },
    { kind: "dim", text: "" },
  ]);

  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const pushLines = useCallback((newLines: TerminalLine[]) => {
    setLines((prev) => [...prev, ...newLines]);
  }, []);

  const pushLine = useCallback((line: TerminalLine) => {
    setLines((prev) => [...prev, line]);
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [lines]);

  const fetchAllVideos = useCallback(
    async (key: string): Promise<VideoItem[]> => {
      let allVideos: VideoItem[] = [];
      let pageToken = "";

      const channelRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${key}`,
      );
      const channelData: YouTubeChannelResponse = await channelRes.json();

      if (channelData.error) {
        throw new Error(channelData.error.message || "YouTube API error");
      }

      const uploadsId =
        channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsId) throw new Error("Channel not found. Check CHANNEL_ID.");

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

      return allVideos;
    },
    [],
  );

  const handlePlay = useCallback(async () => {
    if (!apiKey) {
      pushLines([
        { kind: "error", text: "no API key stored." },
        {
          kind: "dim",
          text: "run 'apikey <your_key>' first, or 'getapi' to create one.",
        },
      ]);
      return;
    }

    setBusy(true);

    let pool = videos;

    if (pool.length === 0) {
      pushLine({ kind: "dim", text: "fetching episode list from channel..." });
      try {
        pool = await fetchAllVideos(apiKey);
        setVideos(pool);
        localStorage.setItem(STORAGE_KEY_VIDEOS, JSON.stringify(pool));
        pushLine({ kind: "dim", text: `${pool.length} episodes cached.` });
      } catch (e) {
        pushLine({
          kind: "error",
          text:
            e instanceof Error ? e.message : "failed to fetch episode list.",
        });
        setBusy(false);
        return;
      }
    }

    if (pool.length === 0) {
      pushLine({ kind: "error", text: "no episodes found." });
      setBusy(false);
      return;
    }

    const recentIds = history.slice(0, 10).map((h) => h.id);
    const filteredPool = pool.filter((v) => !recentIds.includes(v.id));
    const source = filteredPool.length > 0 ? filteredPool : pool;
    const pick = source[Math.floor(Math.random() * source.length)];

    const newHistory = [pick, ...history.filter((h) => h.id !== pick.id)].slice(
      0,
      20,
    );
    setHistory(newHistory);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(newHistory));

    pushLines([
      { kind: "output", text: "now playing:" },
      { kind: "video", video: pick },
    ]);

    setBusy(false);
  }, [apiKey, videos, history, fetchAllVideos, pushLine, pushLines]);

  const handleCommand = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      const promptLine: TerminalLine = {
        kind: "prompt",
        text: trimmed,
      };

      if (trimmed === "") {
        pushLine(promptLine);
        return;
      }

      pushLine(promptLine);

      const [cmd, ...rest] = trimmed.split(/\s+/);
      const arg = rest.join(" ");

      switch (cmd.toLowerCase()) {
        case "help": {
          pushLine({ kind: "output", text: HELP_TEXT });
          break;
        }

        case "clear": {
          setLines([]);
          break;
        }

        case "play": {
          await handlePlay();
          break;
        }

        case "apikey": {
          if (arg.length === 0) {
            if (apiKey) {
              pushLine({
                kind: "output",
                text: `stored key: ${maskKey(apiKey)}`,
              });
            } else {
              pushLine({
                kind: "dim",
                text: "no API key stored. usage: apikey <value>",
              });
            }
          } else {
            setApiKey(arg);
            setVideos([]);
            localStorage.setItem(STORAGE_KEY_APIKEY, arg);
            localStorage.removeItem(STORAGE_KEY_VIDEOS);
            pushLine({
              kind: "accent",
              text: `API key saved: ${maskKey(arg)}`,
            });
          }
          break;
        }

        case "getapi": {
          pushLines([
            { kind: "output", text: "opening Google Cloud Console..." },
            { kind: "dim", text: CLOUD_CONSOLE_URL },
            {
              kind: "dim",
              text: "enable 'YouTube Data API v3', then create an API key.",
            },
          ]);
          window.open(CLOUD_CONSOLE_URL, "_blank", "noopener");
          break;
        }

        default: {
          pushLines([
            { kind: "error", text: `command not found: ${cmd}` },
            { kind: "dim", text: "type 'help' to list available commands" },
          ]);
        }
      }
    },
    [apiKey, handlePlay, pushLine, pushLines],
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const value = input;
    setInput("");
    await handleCommand(value);
  };

  const renderLine = (line: TerminalLine, idx: number) => {
    switch (line.kind) {
      case "banner":
        return (
          <pre key={idx} className="banner">
            {line.text}
          </pre>
        );

      case "prompt":
        return (
          <div key={idx} className="line line-prompt">
            <span className="prompt-prefix">guest@sensacje:~$ </span>
            {line.text}
          </div>
        );

      case "error":
        return (
          <div key={idx} className="line line-error">
            {line.text}
          </div>
        );

      case "dim":
        return (
          <div key={idx} className="line line-dim">
            {line.text}
          </div>
        );

      case "accent":
        return (
          <div key={idx} className="line line-accent">
            {line.text}
          </div>
        );

      case "video": {
        const v = line.video;
        if (!v) return null;
        return (
          <div key={idx} className="video-block">
            <div className="video-block-title">{v.title}</div>
            <div className="video-block-meta">
              published: {formatDate(v.publishedAt)}
            </div>
            <a
              className="video-block-link"
              href={`https://www.youtube.com/watch?v=${v.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              https://www.youtube.com/watch?v={v.id}
            </a>
          </div>
        );
      }

      case "output":
      default:
        return (
          <div key={idx} className="line line-output">
            {line.text}
          </div>
        );
    }
  };

  return (
    <div className="app">
      <div className="terminal" onClick={() => inputRef.current?.focus()}>
        <div className="terminal-bar">
          <span className="terminal-dot" />
          <span className="terminal-dot" />
          <span className="terminal-dot" />
          <span className="terminal-title">sensacje.exe</span>
        </div>

        <div className="terminal-body" ref={bodyRef}>
          {lines.map(renderLine)}
        </div>

        <form className="input-row" onSubmit={onSubmit}>
          <span className="input-prompt">guest@sensacje:~$</span>
          <input
            ref={inputRef}
            className="input-field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <span className="cursor" />
        </form>
      </div>
    </div>
  );
}
