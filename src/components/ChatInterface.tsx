import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThumbsUp, ThumbsDown, Copy, Send, Loader2, Rocket, Square, X, Download, Presentation, UserCircle } from "lucide-react";
import { useBotAvatar } from "@/hooks/useBotAvatar";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import FormattedResponse from "@/components/FormattedResponse";

import { useToast } from "@/hooks/use-toast";
import { getCategoryNames, getSubCategories } from "@/lib/seed-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadAsDoc, generateSwotSlides, extractCompetitorNames } from "@/lib/export-utils";
import { motion, AnimatePresence } from "framer-motion";
import { messageVariants, fadeInUp, scaleIn } from "@/lib/animations";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: any;
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
}: ChatInterfaceProps) => {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const { toast } = useToast();
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [discoveryIndex, setDiscoveryIndex] = useState(0);
  const [competitorPopoverOpen, setCompetitorPopoverOpen] = useState(false);
  const botAvatarImg = useBotAvatar();
  const { avatarUrl: userAvatarUrl } = useUserAvatar();

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

  const scrollToBottom = useCallback(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied to clipboard" });
  };

  const handleDownload = (content: string) => {
    downloadAsDoc(content, "Comp_Agent_Analysis");
    toast({ title: "Downloading document..." });
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
      const contextLabel = contextPrompt.length > 0
        ? (contextPrompt.length > 90 ? `${contextPrompt.slice(0, 87)}...` : contextPrompt)
        : "Competitive Analysis";

      // Detect if content has SWOT structure; if not, use generic feed slides
      const hasSwotStructure = /\b(strengths?|weaknesses?|opportunities|threats)\b/i.test(content) &&
        [/strength/i, /weakness|limitation/i, /opportunit/i, /threat|risk/i].filter(r => r.test(content)).length >= 3;

      if (hasSwotStructure) {
        await generateSwotSlides(
          content,
          finalCompNames.length > 0 ? finalCompNames : ["Analysis"],
          contextLabel,
          "",
          { messageId: msgId, traceId: metadata?.trace_id, traceMetadata: metadata },
        );
      } else {
        const { generateFeedSlides } = await import("@/lib/export-utils");
        const title = contextLabel || "Competitive Analysis";
        await generateFeedSlides(content, title, {
          messageId: msgId,
          traceId: metadata?.trace_id,
          traceMetadata: metadata,
        }, 'comp');
      }
      toast({ title: "Slides generated!", description: "Check your downloads folder." });
    } catch (err) {
      console.error("Slide generation error:", err);
      toast({ title: "Failed to generate slides", variant: "destructive" });
    } finally {
      setSlidesLoading(null);
    }
  };

  const toggleCompetitor = (name: string) => {
    if (selectedCompetitors.includes(name)) {
      onCompetitorsChange(selectedCompetitors.filter(c => c !== name));
    } else if (selectedCompetitors.length < 3) {
      onCompetitorsChange([...selectedCompetitors, name]);
    }
  };

  const isFullProduct = category === "Full Product";
  const hasContext = category && subCategory && selectedCompetitors.length > 0;
  const hasStarted = messages.length > 0 || loading || threadLoading;
  const showLetsGo = !hasStarted;
  const showChatInput = hasStarted;

  const competitorLabel = selectedCompetitors.length === 0
    ? (refreshing ? "Discovering..." : "Competitor(s)")
    : selectedCompetitors.length === 1
      ? selectedCompetitors[0]
      : `${selectedCompetitors.length} selected`;

  return (
    <div className="relative flex h-full flex-col">
      
      <div className="relative flex-1 overflow-y-auto p-4" ref={scrollRef} onScroll={() => { userScrolledUpRef.current = !isNearBottom(); }}>
        {!hasContext && messages.length === 0 && (
          <div className="relative flex h-full items-center justify-center overflow-hidden">
            {/* Ambient orbs */}
            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute left-1/4 top-1/3 h-64 w-64 rounded-full orb-drift"
                style={{ background: "radial-gradient(circle, hsl(var(--glow-primary) / 0.15) 0%, transparent 70%)" }}
              />
              <div
                className="absolute right-1/4 bottom-1/3 h-48 w-48 rounded-full orb-drift"
                style={{ background: "radial-gradient(circle, hsl(var(--glow-accent) / 0.12) 0%, transparent 70%)", animationDelay: "4s" }}
              />
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 rounded-full orb-drift"
                style={{ background: "radial-gradient(circle, hsl(var(--glow-primary) / 0.08) 0%, transparent 65%)", animationDelay: "8s" }}
              />
            </div>

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
                Select a Category, Sub-Category, and up to 3 Competitors from the input area below to generate a competitive analysis.
              </p>
            </motion.div>
          </div>
        )}

        <div className="space-y-4 max-w-4xl mx-auto">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
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
                  className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border card-glow"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <FormattedResponse content={msg.content} />
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}

                  {msg.role === "assistant" && (
                    <motion.div
                      className="mt-3 flex items-center gap-1 border-t border-border pt-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-accent" onClick={() => onFeedback(msg.id, "like")}>
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onFeedback(msg.id, "dislike")}>
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
                      key={thinkingIndex}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                    >
                      {THINKING_STEPS[thinkingIndex]}
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

      <motion.div
        className="border-t border-border p-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
        <div className="mx-auto max-w-4xl space-y-3">
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

            <Popover open={competitorPopoverOpen} onOpenChange={setCompetitorPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-[200px] justify-between bg-background/50 text-xs font-normal"
                  disabled={!subCategory || refreshing || hasStarted}
                >
                  <span className="truncate">{competitorLabel}</span>
                  {selectedCompetitors.length > 0 && !hasStarted && (
                    <span className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                      {selectedCompetitors.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-2" align="start">
                <div className="mb-2 px-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Select up to 3 competitors
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {competitors.map((comp) => {
                    const checked = selectedCompetitors.includes(comp.name);
                    const disabled = !checked && selectedCompetitors.length >= 3;
                    return (
                      <button
                        key={comp.name}
                        onClick={() => toggleCompetitor(comp.name)}
                        disabled={disabled}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                          checked ? "bg-primary/10 text-foreground" : disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <Checkbox checked={checked} className="h-3.5 w-3.5" tabIndex={-1} />
                        <span className="truncate">{comp.name}</span>
                      </button>
                    );
                  })}
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

            {refreshing && (
              <motion.div
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <AnimatePresence mode="wait">
                  <motion.span
                    key={discoveryIndex}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    {DISCOVERY_STEPS[discoveryIndex]}
                  </motion.span>
                </AnimatePresence>
              </motion.div>
            )}

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
                  placeholder="Ask a follow-up question..."
                  disabled={loading}
                  className="bg-background/50"
                />
                <Button onClick={handleSend} disabled={!input.trim() || loading} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default ChatInterface;
