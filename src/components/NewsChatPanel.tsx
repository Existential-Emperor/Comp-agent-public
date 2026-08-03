import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, Send, Loader2, UserCircle, History, Trash2, ThumbsUp, ThumbsDown, Copy, Download, Sparkles, TrendingUp, AlertTriangle, Zap, Presentation, Check, Square } from "lucide-react";
import { useBotAvatar } from "@/hooks/useBotAvatar";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { useCompletionNotification } from "@/hooks/useCompletionNotification";
import { supabase } from "@/integrations/supabase/client";
import FormattedResponse from "@/components/FormattedResponse";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/clipboard";
import { downloadAsDoc, generateFeedSlides } from "@/lib/export-utils";
import { motion, AnimatePresence } from "framer-motion";
import { slideInRight, messageVariants } from "@/lib/animations";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  metadata?: any;
}

interface ChatThread {
  id: string;
  title: string | null;
  created_at: string;
}

interface NewsChatPanelProps {
  open: boolean;
  onClose: () => void;
  initialPrompt: string | null;
  newsContext: string;
  feedScope: string;
  sectionLabel: string;
  feedCompetitorFilter?: string[];
}

const NewsChatPanel = ({ open, onClose, initialPrompt, newsContext, feedScope, sectionLabel, feedCompetitorFilter = [] }: NewsChatPanelProps) => {
  const botAvatarImg = useBotAvatar();
  const { avatarUrl: userAvatarUrl } = useUserAvatar();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const processedPromptRef = useRef<string | null>(null);
  const userScrolledUpRef = useRef(false);
  const { toast } = useToast();

  // Per-thread state
  const [threadMessages, setThreadMessages] = useState<Record<string, ChatMessage[]>>({});
  const [threadLoading, setThreadLoading] = useState<Record<string, boolean>>({});
  const threadAbortControllers = useRef<Record<string, AbortController>>({});

  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [feedbackOpenFor, setFeedbackOpenFor] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackOriginalText, setFeedbackOriginalText] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackExisted, setFeedbackExisted] = useState(false);
  const [feedbackVotes, setFeedbackVotes] = useState<Record<string, "like" | "dislike" | null>>({});

  // Derived values for current thread
  const messages = currentThreadId ? (threadMessages[currentThreadId] ?? []) : [];
  const loading = currentThreadId ? (threadLoading[currentThreadId] ?? false) : false;
  const { armPermission } = useCompletionNotification(loading);

  // Helpers
  const setMessagesForThread = (threadId: string, updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setThreadMessages(prev => ({
      ...prev,
      [threadId]: typeof updater === 'function' ? updater(prev[threadId] ?? []) : updater,
    }));
  };

  const setLoadingForThread = (threadId: string, val: boolean) => {
    setThreadLoading(prev => ({ ...prev, [threadId]: val }));
  };

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // Only auto-scroll if user hasn't manually scrolled up
  const prevMessagesLenRef = useRef(0);
  useEffect(() => {
    const currentLen = messages.length;
    if (userScrolledUpRef.current) {
      prevMessagesLenRef.current = currentLen;
      return;
    }
    if (currentLen > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessagesLenRef.current = currentLen;
  }, [messages]);

  useEffect(() => {
    if (open) loadThreads();
  }, [open]);

  const loadThreads = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("chat_threads")
      .select("id, title, created_at")
      .eq("user_id", user.id)
      .eq("category", "News Summary")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (data) setThreads(data);
  };

  const loadThreadMessages = async (threadId: string) => {
    // If already cached, just switch
    if (threadMessages[threadId] !== undefined) {
      setCurrentThreadId(threadId);
      setShowHistory(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data }, { data: traceData }] = await Promise.all([
      supabase
        .from("chat_messages")
        .select("*")
        .eq("thread_id", threadId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("agent_traces")
        .select("id, message_id")
        .eq("thread_id", threadId)
        .not("message_id", "is", null),
    ]);
    const traceMap: Record<string, string> = {};
    for (const t of traceData || []) {
      if (t.message_id) traceMap[t.message_id] = t.id;
    }
    if (data) {
      setMessagesForThread(threadId, data.map(m => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        created_at: m.created_at,
        metadata: { ...(m.metadata as any || {}), ...(traceMap[m.id] ? { trace_id: traceMap[m.id] } : {}) },
      })));
      setCurrentThreadId(threadId);
      setShowHistory(false);
    }
  };

  const createThread = async (firstMessage: string): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const title = firstMessage.length > 60 ? firstMessage.slice(0, 57) + "..." : firstMessage;
    const { data, error } = await supabase
      .from("chat_threads")
      .insert({ user_id: user.id, category: "News Summary", sub_category: sectionLabel, title })
      .select("id")
      .single();
    if (error || !data) return null;
    setCurrentThreadId(data.id);
    loadThreads();
    return data.id;
  };

  const saveMessage = async (threadId: string, role: string, content: string): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ thread_id: threadId, user_id: user.id, role, content })
      .select("id")
      .single();
    if (error || !data?.id) return null;
    return data.id;
  };

  const linkTraceToMessage = async (traceId: string, messageId: string) => {
    await supabase
      .from("agent_traces")
      .update({ message_id: messageId })
      .eq("id", traceId);
  };

  const deleteThread = async (threadId: string) => {
    await supabase.from("chat_threads").update({ is_archived: true }).eq("id", threadId);
    if (currentThreadId === threadId) { setCurrentThreadId(null); }
    // Clean up per-thread state
    setThreadMessages(prev => { const next = { ...prev }; delete next[threadId]; return next; });
    setThreadLoading(prev => { const next = { ...prev }; delete next[threadId]; return next; });
    if (threadAbortControllers.current[threadId]) {
      threadAbortControllers.current[threadId].abort();
      delete threadAbortControllers.current[threadId];
    }
    loadThreads();
  };

  useEffect(() => {
    if (open && initialPrompt && initialPrompt !== processedPromptRef.current && !loading) {
      processedPromptRef.current = initialPrompt;
      if (messages.length > 0 && currentThreadId) {
        sendMessage(initialPrompt, currentThreadId);
      } else {
        setCurrentThreadId(null);
        sendMessage(initialPrompt, null);
      }
    }
  }, [open, initialPrompt]);

  useEffect(() => {
    if (!open) processedPromptRef.current = null;
  }, [open]);

  const sendMessage = async (content: string, threadId: string | null) => {
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content };

    let activeThreadId = threadId || currentThreadId;
    if (!activeThreadId) activeThreadId = await createThread(content);
    if (!activeThreadId) return;

    // Initialize thread messages if needed and add user message
    setMessagesForThread(activeThreadId, prev => [...prev, userMsg]);
    setLoadingForThread(activeThreadId, true);

    await saveMessage(activeThreadId, "user", content);

    const controller = new AbortController();
    threadAbortControllers.current[activeThreadId] = controller;
    const targetThreadId = activeThreadId;

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const currentMsgs = threadMessages[targetThreadId] ?? [];
      const history = [...currentMsgs, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-analysis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          category: "News Summary", subCategory: sectionLabel, competitor: "all",
          message: content, newsContext, feedScope, feedCompetitorFilter, history, isNewsSummary: true, threadId: targetThreadId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Request failed");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let streamingContent = "";
      let currentEvent = "";
      let finalizedAssistantMessageId: string | null = null;
      let pendingTraceId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "token" && data.token) {
                streamingContent += data.token;
                const currentStreamContent = streamingContent;
                setMessagesForThread(targetThreadId, (prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant" && last.id.startsWith("stream-")) {
                    return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: currentStreamContent } : m));
                  }
                  return [...prev, { id: `stream-${Date.now()}`, role: "assistant", content: currentStreamContent }];
                });
              } else if (currentEvent === "content" && data.content) {
                streamingContent = data.content;
                let assistantId = `a-${Date.now()}`;
                if (targetThreadId) {
                  const persistedId = await saveMessage(targetThreadId, "assistant", data.content);
                  if (persistedId) {
                    assistantId = persistedId;
                    finalizedAssistantMessageId = persistedId;
                    await supabase
                      .from("chat_threads")
                      .update({ updated_at: new Date().toISOString() })
                      .eq("id", targetThreadId);

                    if (pendingTraceId) {
                      await linkTraceToMessage(pendingTraceId, persistedId);
                    }
                  }
                }

                setMessagesForThread(targetThreadId, (prev) => {
                  const withoutStream = prev.filter((m) => !m.id.startsWith("stream-"));
                  return [...withoutStream, { id: assistantId, role: "assistant", content: data.content }];
                });
              } else if (currentEvent === "metadata" && data.traceId) {
                pendingTraceId = data.traceId;
                if (finalizedAssistantMessageId) {
                  await linkTraceToMessage(data.traceId, finalizedAssistantMessageId);
                }
                setMessagesForThread(targetThreadId, (prev) =>
                  prev.map((m) =>
                    m.id === finalizedAssistantMessageId || (!finalizedAssistantMessageId && m.role === "assistant" && prev.indexOf(m) === prev.length - 1)
                      ? { ...m, metadata: { ...(m.metadata || {}), trace_id: data.traceId } }
                      : m,
                  ),
                );
              } else if (currentEvent === "error" && data.content) {
                setMessagesForThread(targetThreadId, (prev) => {
                  const withoutStream = prev.filter((m) => !m.id.startsWith("stream-"));
                  return [...withoutStream, { id: `e-${Date.now()}`, role: "assistant" as const, content: data.content }];
                });
              }
            } catch { /* ignore */ }
          }
        }
      }

      if (streamingContent) {
        setMessagesForThread(targetThreadId, (prev) => {
          const hasFinalized = prev.some((m) => m.role === "assistant" && !m.id.startsWith("stream-") && m.content === streamingContent);
          if (hasFinalized) return prev;
          const withoutStream = prev.filter((m) => !m.id.startsWith("stream-"));
          return [...withoutStream, { id: `a-${Date.now()}`, role: "assistant", content: streamingContent }];
        });
      }

      if (targetThreadId && streamingContent && !finalizedAssistantMessageId) {
        const persistedId = await saveMessage(targetThreadId, "assistant", streamingContent);
        if (persistedId && pendingTraceId) {
          await linkTraceToMessage(pendingTraceId, persistedId);
        }
        await supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", targetThreadId);

        const { data: refreshed } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("thread_id", targetThreadId)
          .order("created_at", { ascending: true });
        if (refreshed) {
          setMessagesForThread(targetThreadId, refreshed.map(m => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            created_at: m.created_at,
            metadata: m.metadata,
          })));
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setMessagesForThread(targetThreadId, (prev) => [...prev, { id: `e-${Date.now()}`, role: "assistant", content: "Sorry, I couldn't process that request. Please try again." }]);
      }
    }

    setLoadingForThread(targetThreadId, false);
    delete threadAbortControllers.current[targetThreadId];
  };

  const handleSend = () => {
    if (!input.trim() || loading) return;
    void armPermission();
    const content = input.trim();
    setInput("");
    sendMessage(content, currentThreadId);
  };

  const startNewChat = () => {
    setCurrentThreadId(null);
    processedPromptRef.current = null;
  };

  const handleCopy = async (content: string) => {
    const ok = await copyToClipboard(content);
    toast({
      title: ok ? "Copied" : "Copy failed",
      description: ok ? "Response copied to clipboard." : "Your browser blocked clipboard access.",
      variant: ok ? undefined : "destructive",
    });
  };

  const handleDownload = (content: string) => {
    downloadAsDoc(content, "Comp_Agent_Analysis");
    toast({ title: "Downloaded", description: "Document saved." });
  };

  const [slidesLoading, setSlidesLoading] = useState<string | null>(null);
  const handleGenerateSlides = async (content: string, msgId: string, metadata?: any) => {
    setSlidesLoading(msgId);
    try {
      const msgIndex = messages.findIndex(m => m.id === msgId);
      const precedingUserMsg = msgIndex > 0
        ? [...messages.slice(0, msgIndex)].reverse().find(m => m.role === "user")
        : messages.find(m => m.role === "user");
      const title = precedingUserMsg?.content || sectionLabel;
      await generateFeedSlides(content, title, {
        messageId: msgId.startsWith("a-") || msgId.startsWith("stream-") ? undefined : msgId,
        traceId: metadata?.trace_id,
        traceMetadata: metadata,
      });
      (await import("sonner")).toast.success("Slides generated! Check your downloads folder.", { duration: 2000 });
    } catch (err) {
      console.error("Slide generation error:", err);
      (await import("sonner")).toast.error("Failed to generate slides", { duration: 3000 });
    } finally {
      setSlidesLoading(null);
    }
  };

  const handleFeedback = async (messageId: string, vote: "like" | "dislike") => {
    const msg = messages.find((m) => m.id === messageId);
    const currentVote = feedbackVotes[messageId] ?? null;
    const newVote = currentVote === vote ? null : vote;

    setFeedbackVotes((prev) => ({ ...prev, [messageId]: newVote }));

    const traceId = msg?.metadata?.trace_id || (await resolveTraceId(messageId));
    if (traceId) {
      void supabase
        .from("agent_traces")
        .update({ feedback_vote: newVote })
        .eq("id", traceId);
    }
    if (newVote) {
      toast({ title: "Feedback recorded" });
    } else {
      toast({ title: "Feedback removed" });
    }
  };

  const resolveTraceId = async (msgId: string): Promise<string | null> => {
    // Primary: always look up from agent_traces table
    const { data } = await supabase
      .from("agent_traces")
      .select("id")
      .eq("message_id", msgId)
      .maybeSingle();
    if (data?.id) return data.id;
    // Fallback: in-memory metadata
    const msg = messages.find((m) => m.id === msgId);
    return msg?.metadata?.trace_id ?? null;
  };

  const handleFeedbackComment = async (msgId: string) => {
    if (!feedbackText.trim()) return;
    setFeedbackSaving(true);
    try {
      const traceId = await resolveTraceId(msgId);
      if (!traceId) {
        toast({ title: "No trace linked", description: "Cannot save feedback for this message.", variant: "destructive" });
        return;
      }
      const { error } = await supabase
        .from("agent_traces")
        .update({ feedback_comment: feedbackText.trim() })
        .eq("id", traceId);
      toast({ title: "Feedback saved" });
      setFeedbackOriginalText(feedbackText.trim());
      setFeedbackExisted(true);
      setFeedbackOpenFor(null);
      setFeedbackText("");
    } catch {
      toast({ title: "Failed to save feedback", variant: "destructive" });
    } finally {
      setFeedbackSaving(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-y-0 right-0 z-50 flex h-dvh max-h-dvh min-h-0 w-full max-w-md flex-col overflow-hidden border-l border-border bg-background shadow-2xl"
          variants={slideInRight}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <img src={botAvatarImg} alt="Bot" className="h-5 w-5 rounded-full object-cover" />
              <span className="text-sm font-semibold text-foreground">Feed Agent</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setShowHistory(!showHistory)} className="h-8 w-8" title="Chat History">
                <History className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={startNewChat} className="h-8 text-xs">New Chat</Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Thread history sidebar */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                className="shrink-0 border-b border-border bg-muted/30 px-3 py-2 max-h-48 overflow-y-auto"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Recent Conversations</div>
                {threads.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No previous conversations</p>
                ) : (
                  <div className="space-y-0.5">
                    {threads.map((thread) => (
                      <div
                        key={thread.id}
                        className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                          currentThreadId === thread.id ? "bg-primary/10 text-foreground" : "hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {threadLoading[thread.id] && (
                            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
                          )}
                          <button onClick={() => loadThreadMessages(thread.id)} className="flex-1 text-left truncate">
                            {thread.title || "Untitled"}
                          </button>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); deleteThread(thread.id); }} className="ml-1 shrink-0 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4"
            ref={scrollContainerRef}
            onScroll={() => {
              userScrolledUpRef.current = !isNearBottom();
            }}
          >
            {(() => {
              const suggestionChips = [
                { label: "Summarize latest news", icon: <Sparkles className="h-3 w-3" />, prompt: "Summarize all the latest competitor news articles. Highlight key themes, product updates, and competitive implications for Workday Adaptive Planning." },
                { label: "Key trends", icon: <TrendingUp className="h-3 w-3" />, prompt: "What are the key competitive trends emerging from recent news and community discussions? Identify patterns in product strategy, market positioning, and feature development." },
                { label: "Sentiment analysis", icon: <Zap className="h-3 w-3" />, prompt: "Analyze the overall sentiment in recent community discussions. Are users positive, negative, or mixed? What specific features or issues are driving sentiment?" },
                { label: "Threats & opportunities", icon: <AlertTriangle className="h-3 w-3" />, prompt: "Based on the latest news and community posts, what are the main threats and opportunities for Workday Adaptive Planning? Provide actionable strategic recommendations." },
                { label: "Summarize discussions", icon: <Sparkles className="h-3 w-3" />, prompt: "Summarize the key community discussions and social posts. What are users talking about across Reddit, LinkedIn and other platforms?" },
                { label: "Competitive signals", icon: <AlertTriangle className="h-3 w-3" />, prompt: "Identify competitive intelligence signals from community posts. Are users switching platforms, complaining about specific features, or praising competitor capabilities?" },
              ];

              if (messages.length === 0 && !loading) {
                return (
                  <motion.div
                    className="flex h-full items-center justify-center"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <div className="text-center space-y-4 max-w-xs">
                      <img src={botAvatarImg} alt="Bot" className="mx-auto h-9 w-9 rounded-full object-cover" />
                      <p className="text-sm font-medium text-foreground">Feed Agent</p>
                      <p className="text-xs text-muted-foreground">
                        Ask about news and community discussions. Try a suggestion below or type a question.
                      </p>
                      <div className="space-y-2">
                        {suggestionChips.map((chip, i) => (
                          <motion.button
                            key={chip.label}
                            onClick={() => sendMessage(chip.prompt, null)}
                            className="flex w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-left text-xs font-medium text-foreground transition-all hover:border-primary/40 hover:bg-primary/10"
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 + 0.2 }}
                            whileHover={{ x: 4 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <span className="text-primary">{chip.icon}</span>
                            {chip.label}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                );
              }

              return null;
            })()}
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                >
                  {msg.role === "assistant" && (
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 overflow-hidden rounded-full">
                      <img src={botAvatarImg} alt="Bot" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="max-w-[85%]">
                    <div
                      className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border card-glow"
                      }`}
                    >
                      {msg.role === "assistant" ? <FormattedResponse content={msg.content} /> : msg.content}
                    </div>
                    {msg.role === "assistant" && !msg.id.startsWith("stream-") && !msg.id.startsWith("cancel-") && (
                      <motion.div
                        className="flex flex-col gap-1.5 mt-1.5 ml-1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                      >
                        <div className="flex items-center gap-0.5">
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
                                setTimeout(() => {
                                  const el = document.getElementById(`feed-feedback-${msg.id}`);
                                  el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                                }, 100);
                              }
                            }}
                            title="Add feedback comment"
                          >
                            <span className="text-sm">💬</span>
                          </Button>
                          <Button variant="ghost" size="icon" className={`h-7 w-7 ${feedbackVotes[msg.id] === "like" ? "text-accent" : "text-muted-foreground"} hover:text-accent`} onClick={() => handleFeedback(msg.id, "like")}>
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className={`h-7 w-7 ${feedbackVotes[msg.id] === "dislike" ? "text-destructive" : "text-muted-foreground"} hover:text-destructive`} onClick={() => handleFeedback(msg.id, "dislike")}>
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
                          <div id={`feed-feedback-${msg.id}`} className="flex items-start gap-2">
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
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted items-center justify-center">
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
            {loading && (
              <motion.div
                className="flex gap-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 overflow-hidden rounded-full">
                  <img src={botAvatarImg} alt="Bot" className="h-full w-full object-cover" />
                </div>
                <div className="rounded-lg bg-card border border-border px-4 py-3 glow-border">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing feed data...</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 h-6 gap-1 text-xs text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (currentThreadId) {
                          const controller = threadAbortControllers.current[currentThreadId];
                          if (controller) {
                            controller.abort();
                            delete threadAbortControllers.current[currentThreadId];
                          }
                          setLoadingForThread(currentThreadId, false);
                          setMessagesForThread(currentThreadId, (prev) => {
                            const withoutStream = prev.filter((m) => !m.id.startsWith("stream-"));
                            return [...withoutStream, { id: `cancel-${Date.now()}`, role: "assistant", content: "Response generation was cancelled by the user." }];
                          });
                          // Log cancelled trace
                          const { data: { user } } = await supabase.auth.getUser();
                          if (user) {
                            void supabase.from("agent_traces").insert({
                              user_id: user.id,
                              thread_id: currentThreadId,
                              category: "News Summary",
                              sub_category: sectionLabel || "General",
                              agent_source: "feed_agent",
                              trace_type: "conversation",
                              status: "cancelled",
                              formatted_output: "Response generation was cancelled by the user.",
                            });
                          }
                        }
                      }}
                    >
                      <Square className="h-3 w-3 fill-current" />
                      Stop
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>


          {/* Input */}
          <motion.div
            className="shrink-0 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Ask about the news..."
                disabled={loading}
                className="bg-background/50"
              />
              <Button onClick={handleSend} disabled={!input.trim() || loading} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NewsChatPanel;
