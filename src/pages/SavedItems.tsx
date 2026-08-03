import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Newspaper, MessageCircle, ExternalLink, Bookmark, ArrowLeft, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, staggerItem, fadeInUp } from "@/lib/animations";
import { useToast } from "@/hooks/use-toast";

interface SavedNewsItem {
  id: string;
  saved_at: string;
  news_item: {
    id: string;
    title: string;
    summary: string | null;
    source_url: string;
    source_name: string | null;
    image_url: string | null;
    item_type: string;
    published_at: string | null;
    fetched_at: string;
    metadata: any;
  };
}

const SOCIAL_PLATFORMS = ["Reddit", "LinkedIn", "X/Twitter", "YouTube", "Quora", "Facebook"];

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return format(d, "MMM d, yyyy");
  } catch {
    return "";
  }
};

const isSocialMediaUrl = (url: string) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ["reddit.com", "linkedin.com", "twitter.com", "x.com", "youtube.com", "facebook.com", "quora.com"]
      .some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
};

type FilterTab = "all" | "news" | "community";

const SavedItems = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [savedItems, setSavedItems] = useState<SavedNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  useEffect(() => {
    if (!user) return;
    const fetchSaved = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("saved_items")
        .select("id, saved_at, news_item_id")
        .eq("user_id", user.id)
        .order("saved_at", { ascending: false });

      if (error || !data) {
        setLoading(false);
        return;
      }

      // Fetch the associated news items
      const newsItemIds = data.map(d => d.news_item_id);
      if (newsItemIds.length === 0) {
        setSavedItems([]);
        setLoading(false);
        return;
      }

      const { data: newsData } = await supabase
        .from("news_items")
        .select("*")
        .in("id", newsItemIds);

      const newsMap = new Map((newsData || []).map(n => [n.id, n]));
      const merged = data
        .map(s => {
          const newsItem = newsMap.get(s.news_item_id);
          if (!newsItem) return null;
          return { id: s.id, saved_at: s.saved_at, news_item: newsItem } as SavedNewsItem;
        })
        .filter((s): s is SavedNewsItem => s !== null);

      setSavedItems(merged);
      setLoading(false);
    };
    fetchSaved();
  }, [user]);

  const handleRemove = async (savedItemId: string) => {
    await supabase.from("saved_items").delete().eq("id", savedItemId);
    setSavedItems(prev => prev.filter(s => s.id !== savedItemId));
    toast({ title: "Removed from saved items" });
  };

  const newsItems = useMemo(() =>
    savedItems.filter(s => s.news_item.item_type === "news" && !isSocialMediaUrl(s.news_item.source_url)),
    [savedItems]
  );

  const communityItems = useMemo(() =>
    savedItems.filter(s => s.news_item.item_type === "community" || isSocialMediaUrl(s.news_item.source_url)),
    [savedItems]
  );

  const displayed = filter === "all" ? savedItems : filter === "news" ? newsItems : communityItems;

  return (
    <div className="min-h-screen bg-background">
      <motion.header
        className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Bookmark className="h-5 w-5 text-primary" />
            <span className="text-sm font-bold tracking-tight text-foreground">Saved Items</span>
            <span className="text-xs text-muted-foreground">({savedItems.length})</span>
          </div>
        </div>
      </motion.header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-4">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs px-3 py-1">All ({savedItems.length})</TabsTrigger>
              <TabsTrigger value="news" className="text-xs px-3 py-1">News ({newsItems.length})</TabsTrigger>
              <TabsTrigger value="community" className="text-xs px-3 py-1">Community ({communityItems.length})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : displayed.length === 0 ? (
          <motion.div
            className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Bookmark className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No saved items yet. Save items from the feed to see them here.</p>
          </motion.div>
        ) : (
          <>
            {/* News section */}
            {(filter === "all" || filter === "news") && newsItems.length > 0 && (
              <motion.section className="mb-10" variants={fadeInUp} initial="initial" animate="animate">
                <div className="flex items-center gap-2 mb-4">
                  <Newspaper className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold text-foreground">Saved News</h2>
                </div>
                <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" variants={staggerContainer} initial="initial" animate="animate">
                  {(filter === "news" ? newsItems : newsItems).map((saved) => (
                    <SavedNewsCard key={saved.id} saved={saved} onRemove={handleRemove} />
                  ))}
                </motion.div>
              </motion.section>
            )}

            {/* Community section */}
            {(filter === "all" || filter === "community") && communityItems.length > 0 && (
              <motion.section variants={fadeInUp} initial="initial" animate="animate">
                <div className="flex items-center gap-2 mb-4">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold text-foreground">Saved Community</h2>
                </div>
                <motion.div className="grid gap-3 sm:grid-cols-2" variants={staggerContainer} initial="initial" animate="animate">
                  {communityItems.map((saved) => (
                    <SavedCommunityCard key={saved.id} saved={saved} onRemove={handleRemove} />
                  ))}
                </motion.div>
              </motion.section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

const SavedNewsCard = ({ saved, onRemove }: { saved: SavedNewsItem; onRemove: (id: string) => void }) => {
  const item = saved.news_item;
  return (
    <motion.div
      className="group relative block overflow-hidden rounded-xl border border-border bg-card"
      variants={staggerItem}
    >
      <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="block">
        <div className="relative h-48 w-full overflow-hidden bg-muted">
          {item.image_url ? (
            <img
              src={item.image_url.replace(/&amp;/g, "&")}
              alt={item.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
              }}
            />
          ) : null}
          <div className={`flex h-full items-center justify-center bg-secondary ${item.image_url ? "hidden" : ""}`}>
            <Newspaper className="h-12 w-12 text-muted-foreground/40" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />
          {item.source_name && (
            <span className="absolute left-3 top-3 rounded-full bg-primary/90 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
              {item.source_name}
            </span>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
            {item.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{formatDate(item.published_at || item.fetched_at) || "Recent"}</span>
            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </a>
      <button
        onClick={(e) => { e.preventDefault(); onRemove(saved.id); }}
        className="absolute top-3 right-3 h-7 w-7 rounded-full bg-background/80 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-background transition-all opacity-0 group-hover:opacity-100"
        title="Remove from saved"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
};

const SavedCommunityCard = ({ saved, onRemove }: { saved: SavedNewsItem; onRemove: (id: string) => void }) => {
  const item = saved.news_item;
  return (
    <motion.div
      className="group relative flex gap-3 rounded-xl border border-border bg-card p-4"
      variants={staggerItem}
    >
      <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="flex gap-3 flex-1 min-w-0">
        {item.image_url && (
          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
            <img src={item.image_url.replace(/&amp;/g, "&")} alt="" className="h-full w-full object-cover" loading="lazy" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="line-clamp-2 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
            {item.title}
          </h3>
          {item.summary && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary}</p>
          )}
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            {item.source_name && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium">
                {item.source_name}
              </span>
            )}
            
          </div>
        </div>
      </a>
      <button
        onClick={(e) => { e.preventDefault(); onRemove(saved.id); }}
        className="shrink-0 h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-all opacity-0 group-hover:opacity-100"
        title="Remove from saved"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
};

export default SavedItems;
