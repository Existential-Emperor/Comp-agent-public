import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface UserAvatarContextType {
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
  refreshAvatar: () => Promise<void>;
}

const UserAvatarContext = createContext<UserAvatarContextType>({
  avatarUrl: null,
  setAvatarUrl: () => {},
  refreshAvatar: async () => {},
});

const CACHE_KEY = "user_avatar_url";

export const UserAvatarProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrlState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CACHE_KEY);
    } catch {
      return null;
    }
  });

  const setAvatarUrl = useCallback((url: string | null) => {
    setAvatarUrlState(url);
    try {
      if (url) localStorage.setItem(CACHE_KEY, url);
      else localStorage.removeItem(CACHE_KEY);
    } catch {}
  }, []);

  const refreshAvatar = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .single();
    if (data?.avatar_url) {
      setAvatarUrl(data.avatar_url);
    }
  }, [user, setAvatarUrl]);

  // Load on mount / user change
  useEffect(() => {
    if (!user) {
      setAvatarUrl(null);
      return;
    }
    refreshAvatar();
  }, [user?.id]);

  return (
    <UserAvatarContext.Provider value={{ avatarUrl, setAvatarUrl, refreshAvatar }}>
      {children}
    </UserAvatarContext.Provider>
  );
};

export const useUserAvatar = () => useContext(UserAvatarContext);
