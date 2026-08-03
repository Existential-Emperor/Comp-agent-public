import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThumbsUp, ThumbsDown, Copy, Send, Loader2, Rocket, Square, X, Download, Presentation, UserCircle, MessageSquare, SlidersHorizontal, Check } from "lucide-react";
import { useBotAvatar } from "@/hooks/useBotAvatar";
import { useCompletionNotification } from "@/hooks/useCompletionNotification";
import { supabase } from "@/integrations/supabase/client";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import FormattedResponse, { type VisualMediaItem } from "@/components/FormattedResponse";

import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/clipboard";
import { getCategoryNames, getSubCategories } from "@/lib/seed-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadAsDoc, extractCompetitorNames } from "@/lib/export-utils";
import { motion, AnimatePresence } from "framer-motion";
import { messageVariants, fadeInUp, scaleIn } from "@/lib/animations";

const PREDEFINED_COMPETITORS = [
  "Vena", "Anaplan", "Oracle EPM", "Pigment", "Planful", "SAP", "OneStream",
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: any;
  /** Stable render identity that survives the streaming→final promotion. */
  clientKey?: string;
  /** True while tokens are still streaming into this bubble. */
  isStreaming?: boolean;
  /** Structured Visual Overview media (decoupled `media` SSE channel). */
  media?: VisualMediaItem[];
}


interface ChatInterfaceProps {
  messages: Message[];
  loading: boolean;
  threadLoading?: boolean;
  onSendMessage: (content: string) => void;
  onFeedback: (messageId: string, feedback: "like" | "dislike") => void;
  onStop?: () => void;
  
  category: string;
  subCategory: string;
  selectedCompetitors: string[];
  competitors: { name: string; website: string; description: string }[];
  onCategoryChange: (v: string) => void;
  onSubCategoryChange: (v: string) => void;
  onCompetitorsChange: (v: string[]) => void;
  refreshing?: boolean;
  onLetsGo?: () => void;
  onDiscoverCompetitors?: () => void;
  discoveredCompetitors?: { name: string; website: string; description: string }[];
  traceIds?: Record<string, string>;
  progress?: string;
}

const THINKING_STEPS = [
  "Searching for competitive intelligence...",
  "Crawling official product documentation...",
  "Analyzing feature capabilities...",
  "Comparing product architectures...",
  "Reviewing pricing and positioning...",
  "Evaluating integration ecosystems...",
  "Checking analyst reports and reviews...",
  "Synthesizing competitive insights...",
  "Structuring the analysis report...",
  "Finalizing competitive breakdown...",
];

const DISCOVERY_STEPS = [
  "Scanning the competitive landscape...",
  "Searching for enterprise FP&A platforms...",
  "Identifying key market players...",
  "Cross-referencing analyst reports...",
  "Validating competitor websites...",
  "Checking for emerging challengers...",
  "Compiling competitor profiles...",
];

const ChatInterface = ({
  messages,
  loading,
  threadLoading,
  onSendMessage,
  onFeedback,
  onStop,
  
  category,
  subCategory,
  selectedCompetitors,
  competitors,
  onCategoryChange,
  onSubCategoryChange,
  onCompetitorsChange,
  refreshing,
  onLetsGo,
  onDiscoverCompetitors,
  discoveredCompetitors = [],
  traceIds = {},
  progress,
}: ChatInterfaceProps) => {
  const [input, setInput] = useState("");
  const [directChatMode, setDirectChatMode] = useState(false);
  const [feedbackOpenFor, setFeedbackOpenFor] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackOriginalText, setFeedbackOriginalText] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackExisted, setFeedbackExisted] = useState(false);
  const [feedbackVotes, setFeedbackVotes] = useState<Record<string, "like" | "dislike" | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const { toast } = useToast();
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [discoveryIndex, setDiscoveryIndex] = useState(0);
  const [competitorPopoverOpen, setCompetitorPopoverOpen] = useState(false);
  const botAvatarImg = useBotAvatar();
  const { avatarUrl: userAvatarUrl } = useUserAvatar();
  const { armPermission } = useCompletionNotification(loading);

  const categoryNames = getCategoryNames();
  const subCategoryNames = category ? getSubCategories(category) : [];

  useEffect(() => {
    if (!loading) {
      setThinkingIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setThinkingIndex((prev) => (prev + 1) % THINKING_STEPS.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (!refreshing) {
      setDiscoveryIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setDiscoveryIndex((prev) => (prev + 1) % DISCOVERY_STEPS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [refreshing]);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // Autoscroll WITHOUT layout thrash. The previous implementation called
  // scrollIntoView({behavior:"smooth"}) on every streamed flush (~60/s). Each
  // call restarts a smooth-scroll animation that fires `scroll` events, whose
  // handler synchronously reads scrollHeight/scrollTop (forcing a full reflow of
  // a huge, image-heavy, still-growing DOM). Write→scroll→read→reflow at 60/s on
  // the largest document at end-of-stream saturates the main thread — the
  // "Page Unresponsive"/"stuck at the end" freeze. Fix: coalesce to at most one
  // scroll per animation frame and do a single INSTANT write (no smooth
  // animation, no animation-driven scroll-event storm).
  const scrollRafRef = useRef<number | null>(null);
  const scrollToBottom = useCallback(() => {
    if (userScrolledUpRef.current) return;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  useEffect(() => () => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
  }, []);

  const hasWarnedNotificationBlockRef = useRef(false);
  const handleSend = () => {
    if (!input.trim()) return;
    void armPermission().then((result) => {
      if (result === "embedded" && !hasWarnedNotificationBlockRef.current) {
        hasWarnedNotificationBlockRef.current = true;
        toast({
          title: "Notifications blocked in preview",
          description: "Open the published app directly to enable browser notifications.",
        });
      } else if (result === "denied" && !hasWarnedNotificationBlockRef.current) {
        hasWarnedNotificationBlockRef.current = true;
        toast({
          title: "Notifications are blocked",
          description: "Enable browser notifications for this site in your browser settings.",
        });
      }
    });
    onSendMessage(input.trim());
    setInput("");
  };

  const handleCopy = async (content: string) => {
    const ok = await copyToClipboard(content);
    toast({
      title: ok ? "Copied to clipboard" : "Copy failed",
      description: ok ? undefined : "Your browser blocked clipboard access.",
      variant: ok ? undefined : "destructive",
    });
  };

  const handleDownload = (content: string) => {
    downloadAsDoc(content, "Comp_Agent_Analysis");
    toast({ title: "Downloading document..." });
  };

  const isTransientAssistantMessage = (msgId: string) =>
    msgId.startsWith("streaming-") || msgId.startsWith("cancel-");

  const resolveTraceId = async (msgId: string): Promise<string | null> => {
    // 1. Check the traceIds map passed from Dashboard (fastest, most reliable)
    if (traceIds[msgId]) return traceIds[msgId];
    // 2. Check in-memory message metadata
    const msg = messages.find((m) => m.id === msgId);
    if (msg?.metadata?.trace_id) return msg.metadata.trace_id;
    // 3. Last resort: query agent_traces table by message_id
    const { data } = await supabase
      .from("agent_traces")
      .select("id")
      .eq("message_id", msgId)
      .maybeSingle();
    return data?.id ?? null;
  };

  const handleFeedbackComment = async (msgId: string) => {
    if (isTransientAssistantMessage(msgId) || !feedbackText.trim()) return;
    setFeedbackSaving(true);
    try {
      const traceId = await resolveTraceId(msgId);
      if (!traceId) {
        toast({ title: "No trace linked", description: "Cannot save feedback for this message.", variant: "destructive" });
        return;
      }
      const { error } = await supabase.functions.invoke("trace-feedback", {
        body: { trace_id: traceId, feedback_comment: feedbackText.trim() },
      });
      if (error) throw new Error(error.message);
      toast({ title: "Feedback saved" });
      setFeedbackOriginalText(feedbackText.trim());
      setFeedbackExisted(true);
      // Auto-close the feedback field after saving
      setFeedbackOpenFor(null);
      setFeedbackText("");
    } catch {
      toast({ title: "Failed to save feedback", variant: "destructive" });
    } finally {
      setFeedbackSaving(false);
    }
  };

  const handleVote = async (msgId: string, vote: "like" | "dislike") => {
    if (isTransientAssistantMessage(msgId)) return;

    const msg = messages.find((m) => m.id === msgId);
    const traceId = msg?.metadata?.trace_id;
    const currentVote = feedbackVotes[msgId] ?? null;
    const newVote = currentVote === vote ? null : vote;

    setFeedbackVotes((prev) => ({ ...prev, [msgId]: newVote }));

    const resolvedTraceId = traceIds[msgId] || traceId || (await resolveTraceId(msgId));
    if (resolvedTraceId) {
      void supabase.functions.invoke("trace-feedback", {
        body: { trace_id: resolvedTraceId, feedback_vote: newVote },
      });
    }

    if (newVote) {
      toast({ title: "Feedback recorded" });
    } else {
      toast({ title: "Feedback removed" });
    }

    onFeedback(msgId, vote);
  };

  const [slidesLoading, setSlidesLoading] = useState<string | null>(null);
  const handleGenerateSlides = async (content: string, msgId: string, metadata?: any) => {
    setSlidesLoading(msgId);
    try {
      const msgIndex = messages.findIndex((m) => m.id === msgId);
      const precedingUserMsg = msgIndex > 0
        ? [...messages.slice(0, msgIndex)].reverse().find((m) => m.role === "user")
        : undefined;

      const contextPrompt = precedingUserMsg?.content ?? "";
      const messageCompNames = extractCompetitorNames(content, metadata);
      const contextCompNames = contextPrompt ? extractCompetitorNames(contextPrompt) : [];
      const finalCompNames = Array.from(new Set([...messageCompNames, ...contextCompNames])).filter(Boolean);
      const contextLabel = contextPrompt || "Competitive Analysis";

      const { generateFeedSlides } = await import("@/lib/export-utils");
      const title = contextLabel || "Competitive Analysis";
      await generateFeedSlides(content, title, {
        messageId: msgId,
        traceId: metadata?.trace_id,
        traceMetadata: metadata,
      }, 'comp');
      (await import("sonner")).toast.success("Slides generated! Check your downloads folder.", { duration: 2000 });
    } catch (err) {
      console.error("Slide generation error:", err);
      (await import("sonner")).toast.error("Failed to generate slides", { duration: 3000 });
    } finally {
      setSlidesLoading(null);
    }
  };

  const toggleCompetitor = (name: string) => {
    if (selectedCompetitors.includes(name)) {
      onCompetitorsChange(selectedCompetitors.filter(c => c !== name));
    } else if (selectedCompetitors.length < 2) {
      onCompetitorsChange([...selectedCompetitors, name]);
    }
  };

  const isFullProduct = category === "Full Product";
  const hasContext = category && subCategory && selectedCompetitors.length > 0;
  const hasStarted = messages.length > 0 || loading || threadLoading;
  // Hide selectors for direct/general chats. Once a conversation has started
  // without a real Charter (i.e. "General" general query), keep selectors hidden
  // — both for the active session and when re-opening past general threads.
  const isGeneralThread = !category || category === "General";
  const showSelectors = !directChatMode && (!hasStarted || !isGeneralThread);
  const showLetsGo = !hasStarted && !directChatMode;
  const showChatInput = hasStarted || directChatMode;
  const showToggle = !hasStarted; // toggle disappears after first message
  

  const competitorLabel = selectedCompetitors.length === 0
    ? (refreshing ? "Discovering..." : "Competitor(s)")
    : selectedCompetitors.length === 1
      ? selectedCompetitors[0]
      : `${selectedCompetitors.length} selected`;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-transparent">
      <div className="relative z-10 flex-1 overflow-y-auto p-4" ref={scrollRef} onScroll={() => { userScrolledUpRef.current = !isNearBottom(); }}>
        {messages.length === 0 && (!hasContext || directChatMode) && (
          <div className="relative flex h-full items-center justify-center overflow-hidden">


            <motion.div
              className="relative z-10 text-center space-y-3 max-w-md"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <motion.div
                className="mx-auto h-[72px] w-[72px] rounded-full overflow-hidden glow-pulse"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <img src={botAvatarImg} alt="Bot" className="h-full w-full object-cover" />
              </motion.div>
              <h3 className="text-lg font-semibold text-foreground">
                Comp Intelligence Agent
              </h3>
              <p className="text-sm text-muted-foreground">
                Select a Category, Sub-Category, and up to 3 Competitors from the input area below to generate a competitive analysis or simply toggle to chat directly.
              </p>
            </motion.div>
          </div>
        )}

        <div className="space-y-4 max-w-4xl mx-auto">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.clientKey ?? msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
              >
                {msg.role === "assistant" && (
                  <div className="shrink-0 mt-1 h-9 w-9 rounded-full overflow-hidden subtle-float">
                    <img src={botAvatarImg} alt="Bot" className="h-full w-full object-cover" />
                  </div>
                )}
                <div
                  className={
                    msg.role === "user"
                      ? "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-primary/90 text-primary-foreground border border-primary/30 shadow-md shadow-primary/20"
                      : "max-w-[85%] rounded-2xl text-sm leading-relaxed bg-background/85 border-border/60 card-glow glow-pulse px-[16px] pt-4 pb-3 border shadow-sm opacity-90"
                  }
                >
                  {msg.role === "assistant" ? (
                    <FormattedResponse content={msg.content} media={msg.media} />
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}

                  {msg.role === "assistant" && !msg.isStreaming && !msg.id.startsWith("streaming-") && !msg.id.startsWith("cancel-") && (
                    <motion.div
                      className="mt-3 border-t border-border pt-2 space-y-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      <div className="flex items-center gap-1">
                      <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${feedbackOpenFor === msg.id ? "text-accent" : "text-muted-foreground"} hover:text-accent`}
                          onClick={async () => {
                            if (feedbackOpenFor === msg.id) {
                              setFeedbackOpenFor(null);
                              setFeedbackText("");
                              setFeedbackOriginalText("");
                              setFeedbackExisted(false);
                            } else {
                              setFeedbackOpenFor(msg.id);
                              setFeedbackText("");
                              setFeedbackOriginalText("");
                              setFeedbackExisted(false);
                              const traceId = msg.metadata?.trace_id || (await resolveTraceId(msg.id));
                              if (traceId) {
                                setFeedbackLoading(true);
                                try {
                                  const { data } = await supabase
                                    .from("agent_traces")
                                    .select("feedback_comment, feedback_vote")
                                    .eq("id", traceId)
                                    .single();
                                  if (data?.feedback_comment) {
                                    setFeedbackText(data.feedback_comment);
                                    setFeedbackOriginalText(data.feedback_comment);
                                    setFeedbackExisted(true);
                                  }
                                  if (data?.feedback_vote) {
                                    setFeedbackVotes((prev) => ({ ...prev, [msg.id]: data.feedback_vote as "like" | "dislike" }));
                                  }
                                } catch {}
                                setFeedbackLoading(false);
                              }
                              // Scroll the feedback area into view after a tick
                              setTimeout(() => {
                                const el = document.getElementById(`feedback-${msg.id}`);
                                el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                              }, 100);
                            }
                          }}
                          title="Add feedback comment"
                        >
                          <span className="text-sm">💬</span>
                        </Button>
                        <Button variant="ghost" size="icon" className={`h-7 w-7 ${feedbackVotes[msg.id] === "like" ? "text-accent" : "text-muted-foreground"} hover:text-accent`} onClick={() => handleVote(msg.id, "like")}>
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className={`h-7 w-7 ${feedbackVotes[msg.id] === "dislike" ? "text-destructive" : "text-muted-foreground"} hover:text-destructive`} onClick={() => handleVote(msg.id, "dislike")}>
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleCopy(msg.content)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleDownload(msg.content)} title="Download as Doc">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground ml-1"
                          onClick={() => handleGenerateSlides(msg.content, msg.id, msg.metadata)}
                          disabled={slidesLoading === msg.id}
                          title="Generate Slides"
                        >
                          {slidesLoading === msg.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Presentation className="h-3.5 w-3.5" />
                          )}
                          Slides
                        </Button>
                      </div>
                      {feedbackOpenFor === msg.id && (
                        <div id={`feedback-${msg.id}`} className="flex items-start gap-2">
                          {feedbackLoading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Loading feedback...
                            </div>
                          ) : (
                            <>
                              <Textarea
                                placeholder="Write your feedback about this response..."
                                value={feedbackText}
                                onChange={(e) => setFeedbackText(e.target.value)}
                                className="min-h-[60px] text-xs resize-none flex-1"
                                rows={2}
                              />
                              <Button
                                size="sm"
                                className="h-8 gap-1 text-xs"
                                onClick={() => handleFeedbackComment(msg.id)}
                                disabled={feedbackSaving || !feedbackText.trim() || (feedbackExisted && feedbackText.trim() === feedbackOriginalText)}
                              >
                                {feedbackSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                {feedbackExisted ? "Update" : "Save"}
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="shrink-0 mt-1 h-7 w-7 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                    {userAvatarUrl ? (
                      <img src={userAvatarUrl} alt="You" className="h-full w-full object-cover" />
                    ) : (
                      <UserCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {threadLoading && (
            <motion.div
              className="flex gap-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="shrink-0 mt-1 h-9 w-9 rounded-full overflow-hidden">
                <img src={botAvatarImg} alt="Bot" className="h-full w-full object-cover" />
              </div>
              <div className="rounded-lg bg-card border border-border px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading conversation...</span>
                </div>
              </div>
            </motion.div>
          )}

          {loading && !threadLoading && (
            <motion.div
              className="flex gap-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="shrink-0 mt-1 h-9 w-9 rounded-full overflow-hidden">
                <img src={botAvatarImg} alt="Bot" className="h-full w-full object-cover" />
              </div>
              <div className="rounded-lg bg-card border border-border px-4 py-3 glow-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={progress || `thinking-${thinkingIndex}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                    >
                      {progress || THINKING_STEPS[thinkingIndex]}
                    </motion.span>
                  </AnimatePresence>
                  <Button variant="ghost" size="sm" className="ml-2 h-6 gap-1 text-xs text-destructive hover:text-destructive" onClick={onStop}>
                    <Square className="h-3 w-3 fill-current" />
                    Stop
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>



      <div className="border-t border-border p-4">
        <div className="mx-auto max-w-4xl space-y-3">
          {/* Mode toggle — disappears after first message */}
          {showToggle && (
            <div className="inline-flex items-center rounded-full bg-muted p-0.5">
              <button
                onClick={() => setDirectChatMode(false)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  !directChatMode
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <SlidersHorizontal className="h-3 w-3" />
                Use Selectors
              </button>
              <button
                onClick={() => setDirectChatMode(true)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  directChatMode
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageSquare className="h-3 w-3" />
                Chat Directly
              </button>
            </div>
          )}

          {/* Selectors row — only rendered when in selector mode or after conversation started */}
          {showSelectors && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={category} onValueChange={onCategoryChange} disabled={hasStarted}>
                  <SelectTrigger className="h-8 w-[180px] bg-background/50 text-xs">
                    <SelectValue placeholder="Charters" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryNames.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={subCategory} onValueChange={onSubCategoryChange} disabled={!category || hasStarted || isFullProduct}>
                  <SelectTrigger className="h-8 w-[200px] bg-background/50 text-xs">
                    <SelectValue placeholder="Product Areas" />
                  </SelectTrigger>
                  <SelectContent>
                    {subCategoryNames.map((sc) => (
                      <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Popover open={competitorPopoverOpen} onOpenChange={(open) => {
                  setCompetitorPopoverOpen(open);
                  if (open && subCategory && onDiscoverCompetitors) {
                    onDiscoverCompetitors();
                  }
                }}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-[200px] justify-between bg-background/50 text-xs font-normal"
                      disabled={!subCategory || hasStarted}
                    >
                      <span className="truncate">{competitorLabel}</span>
                      {selectedCompetitors.length > 0 && !hasStarted && (
                        <span className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                          {selectedCompetitors.length}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] p-2" align="start">
                    <div className="mb-2 px-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Select up to 2 competitors
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-0.5">
                      {/* Predefined competitors */}
                      {PREDEFINED_COMPETITORS.map((name) => {
                        const checked = selectedCompetitors.includes(name);
                        const disabled = !checked && selectedCompetitors.length >= 2;
                        return (
                          <div
                            key={name}
                            role="button"
                            tabIndex={disabled ? -1 : 0}
                            aria-disabled={disabled}
                            aria-pressed={checked}
                            onClick={() => { if (!disabled) toggleCompetitor(name); }}
                            onKeyDown={(e) => {
                              if (disabled) return;
                              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCompetitor(name); }
                            }}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                              checked ? "bg-primary/10 text-foreground" : disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-muted text-foreground"
                            }`}
                          >
                            <Checkbox checked={checked} className="h-3.5 w-3.5" tabIndex={-1} />
                            <span className="truncate">{name}</span>
                          </div>

                        );
                      })}

                      {/* Separator + discovered competitors */}
                      {discoveredCompetitors.length > 0 && (
                        <>
                          <div className="my-1.5 border-t border-border" />
                          <div className="px-1 pb-1 text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                            Discovered
                          </div>
                          {discoveredCompetitors
                            .filter((c) => !PREDEFINED_COMPETITORS.includes(c.name))
                            .map((comp) => {
                              const checked = selectedCompetitors.includes(comp.name);
                              const disabled = !checked && selectedCompetitors.length >= 2;
                              return (
                                <div
                                  key={comp.name}
                                  role="button"
                                  tabIndex={disabled ? -1 : 0}
                                  aria-disabled={disabled}
                                  aria-pressed={checked}
                                  onClick={() => { if (!disabled) toggleCompetitor(comp.name); }}
                                  onKeyDown={(e) => {
                                    if (disabled) return;
                                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCompetitor(comp.name); }
                                  }}
                                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                                    checked ? "bg-primary/10 text-foreground" : disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-muted text-foreground"
                                  }`}
                                >
                                  <Checkbox checked={checked} className="h-3.5 w-3.5" tabIndex={-1} />
                                  <span className="truncate">{comp.name}</span>
                                </div>

                              );
                            })}
                        </>
                      )}

                      {/* Scanning indicator */}
                      {refreshing && (
                        <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Scanning for more competitors...</span>
                        </div>
                      )}
                    </div>
                    {selectedCompetitors.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 border-t border-border pt-2">
                        {selectedCompetitors.map(name => (
                          <span key={name} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-foreground">
                            {name}
                            <button onClick={() => toggleCompetitor(name)} className="hover:text-destructive">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>



                {showLetsGo && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.25 }}
                  >
                    <Button onClick={onLetsGo} size="sm" className="gap-2 glow-pulse" disabled={!hasContext}>
                      <Rocket className="h-4 w-4" />
                      Let's Go!
                    </Button>
                  </motion.div>
                )}
              </div>
            </div>
          )}

          <AnimatePresence>
            {showChatInput && (
              <motion.div
                className="flex gap-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder={directChatMode && !hasStarted ? "Type your research question..." : "Ask a follow-up question..."}
                  disabled={loading}
                  className="bg-background/85 backdrop-blur-xl"
                />
                <Button onClick={handleSend} disabled={!input.trim() || loading} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
