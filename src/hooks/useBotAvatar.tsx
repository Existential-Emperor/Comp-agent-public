import { useEffect, useState } from "react";
import botAvatarImg from "@/assets/bot-avatar.jpeg";

let cachedBlobUrl: string | null = null;
let loadingPromise: Promise<string> | null = null;

function preloadBotAvatar(): Promise<string> {
  if (cachedBlobUrl) return Promise.resolve(cachedBlobUrl);
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetch(botAvatarImg)
    .then((res) => res.blob())
    .then((blob) => {
      cachedBlobUrl = URL.createObjectURL(blob);
      return cachedBlobUrl;
    })
    .catch(() => botAvatarImg);

  return loadingPromise;
}

// Kick off immediately on module load
preloadBotAvatar();

export function useBotAvatar(): string {
  const [src, setSrc] = useState(cachedBlobUrl || botAvatarImg);

  useEffect(() => {
    if (cachedBlobUrl) {
      setSrc(cachedBlobUrl);
      return;
    }
    preloadBotAvatar().then(setSrc);
  }, []);

  return src;
}
