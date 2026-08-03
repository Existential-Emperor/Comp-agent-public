import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageSquare, ExternalLink, Newspaper, MessageCircle, ChevronDown, ChevronUp, Sparkles, TrendingUp, AlertTriangle, Zap, X, UserCircle, LogOut, Camera, Loader2, Bookmark, MessageSquarePlus, ImagePlus } from "lucide-react";
import { useBotAvatar } from "@/hooks/useBotAvatar";
import { format } from "date-fns";
import NewsChatPanel from "@/components/NewsChatPanel";
import { armNotificationPermission } from "@/hooks/useCompletionNotification";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem, headerVariants, fadeInUp } from "@/lib/animations";
import { createPortal } from "react-dom";
import { useToast } from "@/hooks/use-toast";

interface NewsItem {
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
}

type TimeRange = "7" | "31" | "90" | "365";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "7", label: "Last Week" },
  { value: "31", label: "Last Month" },
  { value: "90", label: "Last Quarter" },
  { value: "365", label: "Last Year" },
];

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

type FlyAnimationPosition = { x: number; y: number; targetX: number; targetY: number };

const SaveFlyAnimation = ({
  animPos,
  onComplete,
}: {
  animPos: FlyAnimationPosition | null;
  onComplete: () => void;
}) => {
  if (typeof document === "undefined" || !animPos) return null;

  const controlX = (animPos.x + animPos.targetX) / 2;
  const controlY = Math.min(animPos.y, animPos.targetY) - 90;

  return createPortal(
    <motion.div
      className="fixed left-0 top-0 z-[120] pointer-events-none"
      initial={{ x: animPos.x - 14, y: animPos.y - 14, scale: 1.2, opacity: 0 }}
      animate={{
        x: [animPos.x - 14, controlX - 14, animPos.targetX - 14],
        y: [animPos.y - 14, controlY - 14, animPos.targetY - 14],
        scale: [1.2, 1, 0.8],
        opacity: [0, 1, 1],
      }}
      transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={onComplete}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40">
        <Bookmark className="h-4 w-4 fill-current" />
      </span>
    </motion.div>,
    document.body,
  );
};

const NewsCard = ({ item, isSaved, onSave, onUnsave }: { item: NewsItem; isSaved: boolean; onSave: (id: string, el: HTMLElement) => void; onUnsave: (id: string) => void }) => {
  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSaved) { onUnsave(item.id); return; }
    onSave(item.id, e.currentTarget as HTMLElement);
  };

  return (
    <>
      <motion.a
        href={item.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
        variants={staggerItem}
        whileHover={{ y: -4, transition: { duration: 0.2 } }}
      >
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
          <button
            onClick={handleSave}
            className={`absolute right-3 top-3 h-8 w-8 rounded-full flex items-center justify-center transition-all border ${
              isSaved
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background/70 text-foreground border-border/60 hover:bg-primary hover:text-primary-foreground hover:border-primary"
            }`}
            title={isSaved ? "Unsave item" : "Save item"}
          >
            <Bookmark className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
          </button>
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
      </motion.a>
    </>
  );
};

const CommunityCard = ({ item, isSaved, onSave, onUnsave }: { item: NewsItem; isSaved: boolean; onSave: (id: string, el: HTMLElement) => void; onUnsave: (id: string) => void }) => {
  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSaved) { onUnsave(item.id); return; }
    onSave(item.id, e.currentTarget as HTMLElement);
  };

  return (
    <>
      <motion.a
        href={item.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative flex gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
        variants={staggerItem}
        whileHover={{ y: -2, transition: { duration: 0.2 } }}
      >
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
            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <button
          onClick={handleSave}
          className={`shrink-0 self-start h-7 w-7 rounded-full flex items-center justify-center transition-all ${
            isSaved
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-primary"
          }`}
          title={isSaved ? "Unsave item" : "Save item"}
        >
          <Bookmark className={`h-3.5 w-3.5 ${isSaved ? "fill-current" : ""}`} />
        </button>
      </motion.a>
    </>
  );
};

interface PromptChip {
  label: string;
  icon: React.ReactNode;
  prompt: string;
}

const SectionPromptChips = ({
  chips,
  onChipClick,
}: {
  chips: PromptChip[];
  onChipClick: (prompt: string) => void;
}) => {
  const botAvatar = useBotAvatar();
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 relative z-10">
      <img src={botAvatar} alt="Bot" className="h-5 w-5 rounded-full object-cover" />
      <span className="text-xs font-medium text-muted-foreground mr-1">Ask Agent:</span>
      {chips.map((chip) => (
        <button
          key={chip.label}
          onClick={() => onChipClick(chip.prompt)}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card/90 backdrop-blur-sm px-3.5 py-1.5 text-xs font-semibold text-primary cursor-pointer transition-all hover:border-primary/60 hover:bg-primary/20 hover:shadow-md hover:shadow-primary/10 active:scale-95"
        >
          {chip.icon}
          {chip.label}
        </button>
      ))}
    </div>
  );
};

const ITEMS_PER_ROW_NEWS = 3;
const ITEMS_PER_ROW_COMMUNITY = 2;
const DEFAULT_ROWS = 2;

const buildNewsContext = (items: NewsItem[]): string => {
  return items
    .slice(0, 30)
    .map((item, i) => {
      const date = formatDate(item.published_at || item.fetched_at) || "Unknown date";
      return `[${i + 1}] "${item.title}" — ${item.source_name || "Unknown source"} (${date})\nURL: ${item.source_url}${item.summary ? `\nSummary: ${item.summary}` : ""}`;
    })
    .join("\n\n");
};

// Multi-select competitor filter component
const CompetitorMultiSelect = ({
  selectedCompetitors,
  competitorNames,
  onChange,
}: {
  selectedCompetitors: string[];
  competitorNames: string[];
  onChange: (selected: string[]) => void;
}) => {
  const [open, setOpen] = useState(false);

  const allSelected = competitorNames.length > 0 && selectedCompetitors.length === competitorNames.length;

  const toggle = (name: string) => {
    if (selectedCompetitors.includes(name)) {
      onChange(selectedCompetitors.filter((c) => c !== name));
    } else {
      onChange([...selectedCompetitors, name]);
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange([...competitorNames]);
    }
  };

  const label =
    selectedCompetitors.length === 0
      ? "All Competitors"
      : selectedCompetitors.length === 1
      ? selectedCompetitors[0]
      : `${selectedCompetitors.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-[160px] justify-between text-xs font-normal text-foreground hover:text-foreground hover:bg-primary/15 hover:border-primary/50"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-2" align="start">
        <div className="mb-2 px-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Filter by competitors
        </div>
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {/* Select All checkbox */}
          <button
            onClick={toggleAll}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors border-b border-border mb-1 pb-2 ${
              allSelected ? "bg-primary/10 text-foreground" : "hover:bg-muted text-foreground"
            }`}
          >
            <Checkbox checked={allSelected} className="h-3.5 w-3.5" tabIndex={-1} />
            <span>All Competitors</span>
          </button>
          {competitorNames.map((name) => {
            const checked = selectedCompetitors.includes(name);
            return (
              <button
                key={name}
                onClick={() => toggle(name)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                  checked ? "bg-primary/10 text-foreground" : "hover:bg-muted text-foreground"
                }`}
              >
                <Checkbox checked={checked} className="h-3.5 w-3.5" tabIndex={-1} />
                <span className="truncate">{name}</span>
              </button>
            );
          })}
        </div>
        {selectedCompetitors.length > 0 && (
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex flex-wrap gap-1">
              {selectedCompetitors.map((name) => (
                <span key={name} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-foreground">
                  {name}
                  <button onClick={() => toggle(name)} className="hover:text-destructive">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <button
              onClick={() => onChange([])}
              className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

const NewsLanding = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { avatarUrl, setAvatarUrl } = useUserAvatar();
  const { toast } = useToast();
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Share Feedback state
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackImages, setFeedbackImages] = useState<{ file: File; preview: string }[]>([]);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const feedbackImageInputRef = useRef<HTMLInputElement>(null);

  const handleFeedbackImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newImages = files.filter(f => f.type.startsWith("image/")).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setFeedbackImages(prev => [...prev, ...newImages]);
    if (feedbackImageInputRef.current) feedbackImageInputRef.current.value = "";
  };

  const handleFeedbackImageRemove = (index: number) => {
    setFeedbackImages(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleFeedbackSubmit = async () => {
    if (!user || feedbackText.trim().length < 3) return;
    setFeedbackSubmitting(true);
    try {
      const imageUrls: string[] = [];
      for (const img of feedbackImages) {
        const ext = img.file.name.split(".").pop() || "png";
        const path = `${user.id}/feedback/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, img.file, { upsert: false });
        if (!uploadErr) {
          const { data: pubUrl } = supabase.storage.from("avatars").getPublicUrl(path);
          imageUrls.push(pubUrl.publicUrl);
        }
      }

      await supabase.from("user_feedback").insert({
        user_id: user.id,
        username: user.email || "",
        feedback_text: feedbackText.trim(),
        image_urls: imageUrls,
      });

      toast({ title: "Feedback submitted", description: "Thank you for your feedback!" });
      setFeedbackDialogOpen(false);
      setFeedbackText("");
      feedbackImages.forEach(img => URL.revokeObjectURL(img.preview));
      setFeedbackImages([]);
    } catch (err: any) {
      toast({ title: "Failed to submit", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) return;
    setAvatarUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${user.id}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);
      const url = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", user.id);
      setAvatarUrl(url);
    } catch { /* ignore */ }
    finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };
  const [allItems, setAllItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newsExpanded, setNewsExpanded] = useState(false);
  const [communityExpanded, setCommunityExpanded] = useState(false);
  const [newsTimeRange, setNewsTimeRange] = useState<TimeRange>("31");
  
  const [newsCompetitors, setNewsCompetitors] = useState<string[]>([]);
  const [communityCompetitors, setCommunityCompetitors] = useState<string[]>([]);
  const [savedItemIds, setSavedItemIds] = useState<Set<string>>(new Set());
  const [flyAnimationPos, setFlyAnimationPos] = useState<FlyAnimationPosition | null>(null);
  const profileIconRef = useRef<HTMLButtonElement>(null);

  // Chat panel state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);
  const [chatSectionLabel, setChatSectionLabel] = useState("News");

  // Load saved item IDs
  useEffect(() => {
    if (!user) return;
    const loadSaved = async () => {
      const { data } = await supabase
        .from("saved_items")
        .select("news_item_id")
        .eq("user_id", user.id);
      if (data) {
        setSavedItemIds(new Set(data.map(d => d.news_item_id)));
      }
    };
    loadSaved();
  }, [user]);

  const handleSaveItem = async (newsItemId: string, triggerEl: HTMLElement) => {
    if (!user || savedItemIds.has(newsItemId)) return;

    const btnRect = triggerEl.getBoundingClientRect();
    const profileTargetEl = profileIconRef.current ?? document.getElementById("profile-menu-trigger");
    const profileRect = profileTargetEl?.getBoundingClientRect();
    if (profileRect) {
      setFlyAnimationPos({
        x: btnRect.left + btnRect.width / 2,
        y: btnRect.top + btnRect.height / 2,
        targetX: profileRect.left + profileRect.width / 2,
        targetY: profileRect.top + profileRect.height / 2,
      });
    }

    setSavedItemIds(prev => new Set(prev).add(newsItemId));
    await supabase.from("saved_items").insert({ user_id: user.id, news_item_id: newsItemId });
  };

  const handleUnsaveItem = async (newsItemId: string) => {
    if (!user) return;
    setSavedItemIds(prev => { const next = new Set(prev); next.delete(newsItemId); return next; });
    await supabase.from("saved_items").delete().eq("user_id", user.id).eq("news_item_id", newsItemId);
  };

  // Fetch items based on the max time range needed
  const maxDays = useMemo(() => {
    return parseInt(newsTimeRange);
  }, [newsTimeRange]);

  useEffect(() => {
    const fetchItems = async () => {
      setLoading(true);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxDays);

      const { data } = await supabase
        .from("news_items")
        .select("*")
        .or(`published_at.gte.${cutoff.toISOString()},and(published_at.is.null,fetched_at.gte.${cutoff.toISOString()})`)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(1000);

      if (data) {
        setAllItems(data as unknown as NewsItem[]);
      }
      setLoading(false);
    };
    fetchItems();
  }, [maxDays]);

  // Extended time range: just re-query the DB (no user-triggered fetches — cron handles it)
  const [fetchingExtended, setFetchingExtended] = useState(false);
  useEffect(() => {
    const days = parseInt(newsTimeRange);
    if (days <= 31) return;

    const refetchFromDb = async () => {
      setFetchingExtended(true);
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const { data } = await supabase
          .from("news_items")
          .select("*")
          .or(`published_at.gte.${cutoff.toISOString()},and(published_at.is.null,fetched_at.gte.${cutoff.toISOString()})`)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(1000);
        if (data) {
          setAllItems(data as unknown as NewsItem[]);
        }
      } catch {
        // Silently fail
      } finally {
        setFetchingExtended(false);
      }
    };
    refetchFromDb();
  }, [newsTimeRange]);

  const SOCIAL_PLATFORMS = ["Reddit", "LinkedIn", "X/Twitter", "YouTube", "Quora", "Facebook"];

  const hostMatchesDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

  const isSocialMediaUrl = (url: string) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return ["reddit.com", "linkedin.com", "twitter.com", "x.com", "youtube.com", "facebook.com", "quora.com"]
        .some((domain) => hostMatchesDomain(host, domain));
    } catch {
      return false;
    }
  };

  // Detect official competitor company pages (LinkedIn company posts, official YouTube channels, etc.)
  const OFFICIAL_SLUGS = [
    "anaplan", "planful", "pigment", "datarails", "jedox", "onestream", "prophix",
    "workiva", "oracle", "sap", "ibm", "board-international", "boardinternational",
    "vena-solutions", "venasolutions", "wolters-kluwer", "cch-tagetik", "workday",
    "onesoftware", "prophixsoftware", "venasolutions", "jedoxag",
  ];

  const isOfficialCompetitorPost = (url: string): boolean => {
    try {
      const lower = url.toLowerCase();
      const urlObj = new URL(lower);
      const host = urlObj.hostname;
      const path = urlObj.pathname;

      // LinkedIn company pages: /company/anaplan/, /posts/ from company pages
      if (host.includes("linkedin.com")) {
        if (path.includes("/company/")) {
          return OFFICIAL_SLUGS.some((slug) => path.includes(`/company/${slug}`));
        }
      }
      // YouTube official channels
      if (host.includes("youtube.com")) {
        if (path.startsWith("/@") || path.startsWith("/c/") || path.startsWith("/channel/")) {
          return OFFICIAL_SLUGS.some((slug) => path.includes(slug));
        }
      }
      // Official Twitter/X accounts
      if (host.includes("twitter.com") || host.includes("x.com")) {
        const handle = path.split("/")[1]?.toLowerCase() || "";
        return OFFICIAL_SLUGS.some((slug) => handle.includes(slug));
      }
      return false;
    } catch {
      return false;
    }
  };

  const competitorNames = useMemo(() => {
    const names = new Set<string>();
    allItems.forEach((item) => {
      if (item.source_name && !item.source_name.includes(".") && !SOCIAL_PLATFORMS.includes(item.source_name)) {
        names.add(item.source_name);
      }
    });
    return Array.from(names).sort();
  }, [allItems]);

  const filterByTimeRange = (items: NewsItem[], range: TimeRange) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(range));
    return items.filter((item) => {
      const dateStr = item.published_at || item.fetched_at;
      const d = new Date(dateStr);
      return d >= cutoff;
    });
  };

  const filterByCompetitors = (items: NewsItem[], competitors: string[]) => {
    if (competitors.length === 0) return items;
    return items.filter((item) => competitors.includes(item.source_name || ""));
  };

  const isAdaptivePlanning = (item: NewsItem) => {
    const name = (item.source_name || "").toLowerCase();
    return name.includes("workday adaptive") || name === "workday adaptive planning";
  };

  const newsItems = useMemo(() => {
    const byType = allItems.filter((i) => i.item_type === "news" && !isSocialMediaUrl(i.source_url));
    const byCompetitor = filterByCompetitors(byType, newsCompetitors);
    return filterByTimeRange(byCompetitor, newsTimeRange);
  }, [allItems, newsTimeRange, newsCompetitors]);

  // Community items: show ALL regardless of time range, only filter by competitor
  const [allCommunityItems, setAllCommunityItems] = useState<NewsItem[]>([]);
  useEffect(() => {
    const fetchAllCommunity = async () => {
      const { data } = await supabase
        .from("news_items")
        .select("*")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (data) {
        const community = (data as unknown as NewsItem[]).filter((i) =>
          (i.item_type === "community" || isSocialMediaUrl(i.source_url)) &&
          !isOfficialCompetitorPost(i.source_url)
        );
        setAllCommunityItems(community);
      }
    };
    fetchAllCommunity();
  }, []);

  const communityItems = useMemo(() => {
    return filterByCompetitors(allCommunityItems, communityCompetitors);
  }, [allCommunityItems, communityCompetitors]);

  const newsDefaultCount = DEFAULT_ROWS * ITEMS_PER_ROW_NEWS;
  const communityDefaultCount = DEFAULT_ROWS * ITEMS_PER_ROW_COMMUNITY;

  const visibleNews = newsExpanded ? newsItems : newsItems.slice(0, newsDefaultCount);
  const visibleCommunity = communityExpanded ? communityItems : communityItems.slice(0, communityDefaultCount);

  const hasMoreNews = newsItems.length > newsDefaultCount;
  const hasMoreCommunity = communityItems.length > communityDefaultCount;

  const timeRangeLabel = (range: TimeRange) => TIME_RANGE_OPTIONS.find((o) => o.value === range)?.label || "";

  const describeChatScope = (section: string) => {
    if (section === "News") {
      return `Section: News. Time range: ${timeRangeLabel(newsTimeRange)}. Competitor filter: ${newsCompetitors.length > 0 ? newsCompetitors.join(", ") : "All competitors"}. In-scope filtered items: ${newsItems.length}. Answer strictly from the provided filtered feed items.`;
    }

    if (section === "Community") {
      return `Section: Community. Competitor filter: ${communityCompetitors.length > 0 ? communityCompetitors.join(", ") : "All competitors"}. In-scope filtered items: ${communityItems.length}. Answer strictly from the provided filtered feed items.`;
    }

    return `Section: Full Feed. News time range: ${timeRangeLabel(newsTimeRange)}. News competitor filter: ${newsCompetitors.length > 0 ? newsCompetitors.join(", ") : "All competitors"}. Community competitor filter: ${communityCompetitors.length > 0 ? communityCompetitors.join(", ") : "All competitors"}. In-scope filtered items: ${newsItems.length + communityItems.length}. Answer strictly from the provided filtered feed items.`;
  };

  const activeChatContext = useMemo(() => {
    if (chatSectionLabel === "News") return buildNewsContext(newsItems);
    if (chatSectionLabel === "Community") return buildNewsContext(communityItems);
    return buildNewsContext([...newsItems, ...communityItems]);
  }, [chatSectionLabel, newsItems, communityItems]);

  const activeChatScope = useMemo(() => describeChatScope(chatSectionLabel), [
    chatSectionLabel,
    newsTimeRange,
    newsCompetitors,
    communityCompetitors,
    newsItems,
    communityItems,
  ]);

  const competitorFilterLabel = (competitors: string[]) => {
    if (competitors.length === 0) return "";
    return competitors.join(", ") + " ";
  };

  const openChatWithPrompt = (prompt: string, section: "News" | "Community") => {
    void armNotificationPermission();
    setChatSectionLabel(section);
    setChatPrompt(prompt);
    setChatOpen(true);
  };

  const newsChips: PromptChip[] = [
    {
      label: "Summarize this news",
      icon: <Sparkles className="h-3 w-3" />,
      prompt: `Summarize all the ${competitorFilterLabel(newsCompetitors)}news articles from the ${timeRangeLabel(newsTimeRange).toLowerCase()}. Highlight key themes, product updates, and competitive implications for Workday Adaptive Planning.`,
    },
    {
      label: "Key trends",
      icon: <TrendingUp className="h-3 w-3" />,
      prompt: `What are the key competitive trends emerging from these ${competitorFilterLabel(newsCompetitors)}news articles? Identify patterns in product strategy, market positioning, and feature development.`,
    },
    {
      label: "Threats & opportunities",
      icon: <AlertTriangle className="h-3 w-3" />,
      prompt: `Based on these news articles, what are the main threats and opportunities for Workday Adaptive Planning? Provide actionable strategic recommendations.`,
    },
  ];

  const communityChips: PromptChip[] = [
    {
      label: "Summarize discussions",
      icon: <Sparkles className="h-3 w-3" />,
      prompt: `Summarize the key community discussions and social posts${communityCompetitors.length > 0 ? ` about ${communityCompetitors.join(", ")}` : ""}. What are users talking about?`,
    },
    {
      label: "Sentiment analysis",
      icon: <TrendingUp className="h-3 w-3" />,
      prompt: `Analyze the overall sentiment in these community discussions. Are users positive, negative, or mixed? What specific features or issues are driving sentiment?`,
    },
    {
      label: "Competitive signals",
      icon: <AlertTriangle className="h-3 w-3" />,
      prompt: `Identify competitive intelligence signals from these community posts. Are users switching platforms, complaining about specific features, or praising competitor capabilities?`,
    },
  ];

  return (
    <div className="relative z-10 flex h-dvh overflow-hidden">
      {/* Left column: scrollable feed (independent from chat panel viewport) */}
      <div
        className={`flex-1 min-w-0 h-dvh overflow-y-auto transition-[margin] duration-300 ${chatOpen ? "mr-[28rem]" : ""}`}
      >
      {/* Header */}
      <motion.header
        className="sticky top-0 z-40 border-b border-border/60 bg-background/30 backdrop-blur-xl"
        variants={headerVariants}
        initial="initial"
        animate="animate"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-signal text-xl font-bold tracking-[0.18em] uppercase leading-none transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm"
              aria-label="Go to Feed home"
            >
              Sentinel
            </button>
            <span className="h-6 w-px bg-border" aria-hidden="true" />
            <span className="text-xl font-bold tracking-tight text-foreground drop-shadow-[0_0_12px_hsl(var(--primary)/0.35)]">Feed</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                void armNotificationPermission();
                setChatSectionLabel("Feed");
                setChatPrompt(null);
                setChatOpen(true);
              }}
              size="sm"
              variant="outline"
              className="gap-2 border-primary/30 text-primary hover:bg-primary/15 hover:text-primary hover:border-primary/60"
            >
              <Zap className="h-4 w-4" />
              Feed Agent
            </Button>
            <Button
              onClick={() => navigate("/agent")}
              size="sm"
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <MessageSquare className="h-4 w-4" />
              Comp Agent
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button id="profile-menu-trigger" ref={profileIconRef as any} variant="ghost" size="icon" className="text-muted-foreground">
                  <UserCircle className="h-16 w-16" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                  <UserCircle className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/saved")}>
                  <Bookmark className="mr-2 h-4 w-4" />
                  Saved Items
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFeedbackDialogOpen(true)}>
                  <MessageSquarePlus className="mr-2 h-4 w-4" />
                  Share Feedback
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.header>

      {/* Profile dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="flex flex-col items-center gap-3">
              <div className="relative group">
                <div className="h-20 w-20 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <UserCircle className="h-12 w-12 text-muted-foreground" />
                  )}
                </div>
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                >
                  {avatarUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-foreground" />
                  ) : (
                    <Camera className="h-5 w-5 text-foreground" />
                  )}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <p className="text-xs text-muted-foreground">Click to change photo</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <p className="text-sm text-foreground">{user?.email}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Password</label>
              <p className="text-sm text-foreground font-mono">••••••••</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setProfileOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Feedback dialog */}
      <Dialog open={feedbackDialogOpen} onOpenChange={(open) => {
        setFeedbackDialogOpen(open);
        if (!open) { setFeedbackText(""); feedbackImages.forEach(img => URL.revokeObjectURL(img.preview)); setFeedbackImages([]); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Attachments (optional)</label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => feedbackImageInputRef.current?.click()}>
                  <ImagePlus className="h-3.5 w-3.5" />
                  Add Images
                </Button>
                <input ref={feedbackImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFeedbackImageAdd} />
              </div>
              {feedbackImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {feedbackImages.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img src={img.preview} alt={`Attachment ${idx + 1}`} className="h-16 w-16 rounded-md object-cover border border-border" />
                      <button onClick={() => handleFeedbackImageRemove(idx)} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Feedback *</label>
              <textarea value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} placeholder="Tell us what you think..." className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none" rows={5} />
              {feedbackText.length > 0 && feedbackText.trim().length < 3 && (
                <p className="text-xs text-destructive">Please enter at least 3 characters</p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFeedbackDialogOpen(false)} disabled={feedbackSubmitting}>Cancel</Button>
            <Button onClick={handleFeedbackSubmit} disabled={feedbackSubmitting || feedbackText.trim().length < 3}>
              {feedbackSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-12">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            {/* News Section */}
            <motion.section variants={fadeInUp} initial="initial" animate="animate">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-bold text-foreground">Latest News</h2>
                </div>
                <div className="flex items-center gap-2">
                  <CompetitorMultiSelect
                    selectedCompetitors={newsCompetitors}
                    competitorNames={competitorNames}
                    onChange={(v) => { setNewsCompetitors(v); setNewsExpanded(false); }}
                  />
                  <Tabs value={newsTimeRange} onValueChange={(v) => { setNewsTimeRange(v as TimeRange); setNewsExpanded(false); }}>
                    <TabsList className="h-8">
                      {TIME_RANGE_OPTIONS.map((opt) => (
                        <TabsTrigger key={opt.value} value={opt.value} className="text-xs px-2.5 py-1">
                          {opt.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              </div>
              {newsItems.length > 0 && (
                <SectionPromptChips
                  chips={newsChips}
                  onChipClick={(prompt) => openChatWithPrompt(prompt, "News")}
                />
              )}
              {newsItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <Newspaper className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No news items found for this time range.</p>
                </div>
              ) : (
                <>
                  <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" variants={staggerContainer} initial="initial" animate="animate">
                    {visibleNews.map((item) => (
                        <NewsCard key={item.id} item={item} isSaved={savedItemIds.has(item.id)} onSave={handleSaveItem} onUnsave={handleUnsaveItem} />
                    ))}
                  </motion.div>
                  {hasMoreNews && (
                    <div className="mt-4 flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setNewsExpanded(!newsExpanded)}
                        className="gap-1.5 text-muted-foreground hover:text-foreground"
                      >
                        {newsExpanded ? (
                          <>Show Less <ChevronUp className="h-4 w-4" /></>
                        ) : (
                          <>Show {newsItems.length - newsDefaultCount} More <ChevronDown className="h-4 w-4" /></>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </motion.section>

            {/* Community Section */}
            <motion.section variants={fadeInUp} initial="initial" animate="animate" transition={{ delay: 0.15 }}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-bold text-foreground">What People Are Saying</h2>
                </div>
                <div className="flex items-center gap-2">
                  <CompetitorMultiSelect
                    selectedCompetitors={communityCompetitors}
                    competitorNames={competitorNames}
                    onChange={(v) => { setCommunityCompetitors(v); setCommunityExpanded(false); }}
                  />
                </div>
              </div>
              {communityItems.length > 0 && (
                <SectionPromptChips
                  chips={communityChips}
                  onChipClick={(prompt) => openChatWithPrompt(prompt, "Community")}
                />
              )}
              {communityItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <MessageCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No community posts found.</p>
                </div>
              ) : (
                <>
                  <motion.div className="grid gap-3 sm:grid-cols-2" variants={staggerContainer} initial="initial" animate="animate">
                    {visibleCommunity.map((item) => (
                      <CommunityCard key={item.id} item={item} isSaved={savedItemIds.has(item.id)} onSave={handleSaveItem} onUnsave={handleUnsaveItem} />
                    ))}
                  </motion.div>
                  {hasMoreCommunity && (
                    <div className="mt-4 flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCommunityExpanded(!communityExpanded)}
                        className="gap-1.5 text-muted-foreground hover:text-foreground"
                      >
                        {communityExpanded ? (
                          <>Show Less <ChevronUp className="h-4 w-4" /></>
                        ) : (
                          <>Show {communityItems.length - communityDefaultCount} More <ChevronDown className="h-4 w-4" /></>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </motion.section>
          </>
        )}
      </main>

      <SaveFlyAnimation animPos={flyAnimationPos} onComplete={() => setFlyAnimationPos(null)} />
      </div>

      {/* Chat Panel — fixed-position sibling so its viewport is independent from the feed scroll */}
      <NewsChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        initialPrompt={chatPrompt}
        newsContext={activeChatContext}
        feedScope={activeChatScope}
        sectionLabel={chatSectionLabel}
        feedCompetitorFilter={chatSectionLabel === "News" ? newsCompetitors : chatSectionLabel === "Community" ? communityCompetitors : [...new Set([...newsCompetitors, ...communityCompetitors])]}
      />
    </div>
  );
};

export default NewsLanding;
