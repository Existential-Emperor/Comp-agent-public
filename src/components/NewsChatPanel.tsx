import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Send, Loader2, UserCircle, History, Trash2, ThumbsUp, ThumbsDown, Copy, Download, Sparkles, TrendingUp, AlertTriangle, Zap, Presentation } from "lucide-react";
import { useBotAvatar } from "@/hooks/useBotAvatar";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { supabase } from "@/integrations/supabase/client";
import FormattedResponse from "@/components/FormattedResponse";
import { useToast } from "@/hooks/use-toast";
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
  sectionLabel: string;
}

const NewsChatPanel = ({ open, onClose, initialPrompt, newsContext, sectionLabel }: NewsChatPanelProps) => {
  const botAvatarImg = useBotAvatar();
  const { avatarUrl: userAvatarUrl } = useUserAvatar();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const processedPromptRef = useRef<string | null>(null);
  const userScrolledUpRef = useRef(false);
  const { toast } = useToast();

  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (data) {
      setMessages(data.map(m => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        created_at: m.created_at,
        metadata: m.metadata,
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
    if (currentThreadId === threadId) { setCurrentThreadId(null); setMessages([]); }
    loadThreads();
  };

  useEffect(() => {
    if (open && initialPrompt && initialPrompt !== processedPromptRef.current && !loading) {
      processedPromptRef.current = initialPrompt;
      // If there's an existing conversation, send as a new prompt in the same chat
      if (messages.length > 0 && currentThreadId) {
        sendMessage(initialPrompt, messages, currentThreadId);
      } else {
        // First prompt — start a new chat
        setCurrentThreadId(null);
        setMessages([]);
        sendMessage(initialPrompt, [], null);
      }
    }
  }, [open, initialPrompt]);

  useEffect(() => {
    if (!open) processedPromptRef.current = null;
  }, [open]);

  const sendMessage = async (content: string, currentMessages: ChatMessage[], threadId: string | null) => {
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content };
    const updatedMessages = [...currentMessages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    let activeThreadId = threadId || currentThreadId;
    if (!activeThreadId) activeThreadId = await createThread(content);
    if (activeThreadId) await saveMessage(activeThreadId, "user", content);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const history = updatedMessages.map((m) => ({ role: m.role, content: m.content }));
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-analysis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          category: "News Summary", subCategory: sectionLabel, competitor: "all",
          message: content, newsContext, history, isNewsSummary: true, threadId: activeThreadId,
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
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant" && last.id.startsWith("stream-")) {
                    return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: streamingContent } : m));
                  }
                  return [...prev, { id: `stream-${Date.now()}`, role: "assistant", content: streamingContent }];
                });
              } else if (currentEvent === "content" && data.content) {
                streamingContent = data.content;
                let assistantId = `a-${Date.now()}`;
                if (activeThreadId) {
                  const persistedId = await saveMessage(activeThreadId, "assistant", data.content);
                  if (persistedId) {
                    assistantId = persistedId;
                    finalizedAssistantMessageId = persistedId;
                    await supabase
                      .from("chat_threads")
                      .update({ updated_at: new Date().toISOString() })
                      .eq("id", activeThreadId);

                    if (pendingTraceId) {
                      await linkTraceToMessage(pendingTraceId, persistedId);
                    }
                  }
                }

                setMessages((prev) => {
                  const withoutStream = prev.filter((m) => !m.id.startsWith("stream-"));
                  return [...withoutStream, { id: assistantId, role: "assistant", content: data.content }];
                });
              } else if (currentEvent === "metadata" && data.traceId) {
                pendingTraceId = data.traceId;
                if (finalizedAssistantMessageId) {
                  await linkTraceToMessage(data.traceId, finalizedAssistantMessageId);
                }
              }
            } catch { /* ignore */ }
          }
        }
      }

      if (streamingContent) {
        setMessages((prev) => {
          const hasFinalized = prev.some((m) => m.role === "assistant" && !m.id.startsWith("stream-") && m.content === streamingContent);
          if (hasFinalized) return prev;
          const withoutStream = prev.filter((m) => !m.id.startsWith("stream-"));
          return [...withoutStream, { id: `a-${Date.now()}`, role: "assistant", content: streamingContent }];
        });
      }

      if (activeThreadId && streamingContent && !finalizedAssistantMessageId) {
        const persistedId = await saveMessage(activeThreadId, "assistant", streamingContent);
        if (persistedId && pendingTraceId) {
          await linkTraceToMessage(pendingTraceId, persistedId);
        }
        await supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", activeThreadId);

        const { data: refreshed } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("thread_id", activeThreadId)
          .order("created_at", { ascending: true });
        if (refreshed) {
          setMessages(refreshed.map(m => ({
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
        setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "assistant", content: "Sorry, I couldn't process that request. Please try again." }]);
      }
    }

    setLoading(false);
    abortRef.current = null;
  };

  const handleSend = () => {
    if (!input.trim() || loading) return;
    sendMessage(input.trim(), messages, currentThreadId);
  };

  const startNewChat = () => {
    setCurrentThreadId(null);
    setMessages([]);
    processedPromptRef.current = null;
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied", description: "Response copied to clipboard." });
  };

  const handleDownload = (content: string) => {
    downloadAsDoc(content, "Comp_Agent_Analysis");
    toast({ title: "Downloaded", description: "Document saved." });
  };

  const [slidesLoading, setSlidesLoading] = useState<string | null>(null);
  const handleGenerateSlides = async (content: string, msgId: string, metadata?: any) => {
    setSlidesLoading(msgId);
    try {
      // Find the user message that precedes this assistant message to use as title
      const msgIndex = messages.findIndex(m => m.id === msgId);
      const precedingUserMsg = msgIndex > 0
        ? [...messages.slice(0, msgIndex)].reverse().find(m => m.role === "user")
        : messages.find(m => m.role === "user");
      const title = precedingUserMsg
        ? (precedingUserMsg.content.length > 60 ? precedingUserMsg.content.slice(0, 57) + "..." : precedingUserMsg.content)
        : sectionLabel;
      await generateFeedSlides(content, title, {
        messageId: msgId.startsWith("a-") || msgId.startsWith("stream-") ? undefined : msgId,
        traceId: metadata?.trace_id,
        traceMetadata: metadata,
      });
      toast({ title: "Slides generated!", description: "Check your downloads folder." });
    } catch (err) {
      console.error("Slide generation error:", err);
      toast({ title: "Failed to generate slides", variant: "destructive" });
    } finally {
      setSlidesLoading(null);
    }
  };

  const handleFeedback = async (messageId: string, vote: "like" | "dislike") => {
    toast({ title: vote === "like" ? "👍 Thanks!" : "👎 Noted", description: "Feedback recorded." });
    if (currentThreadId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("agent_traces").insert({
          user_id: user.id, category: "News Summary", sub_category: sectionLabel,
          agent_source: "feed_agent", trace_type: "feedback", status: "completed",
          feedback_vote: vote, thread_id: currentThreadId,
          message_id: messageId.startsWith("a-") || messageId.startsWith("stream-") ? undefined : messageId,
        });
      }
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl"
          variants={slideInRight}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
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
                className="border-b border-border bg-muted/30 px-3 py-2 max-h-48 overflow-y-auto"
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
                        <button onClick={() => loadThreadMessages(thread.id)} className="flex-1 text-left truncate">
                          {thread.title || "Untitled"}
                        </button>
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
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
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
                            onClick={() => sendMessage(chip.prompt, [], null)}
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
                  variants={messageVariants}
                  initial="initial"
                  animate="animate"
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
                          : "bg-card border border-border"
                      }`}
                    >
                      {msg.role === "assistant" ? <FormattedResponse content={msg.content} /> : msg.content}
                    </div>
                    {msg.role === "assistant" && !msg.id.startsWith("stream-") && (
                      <motion.div
                        className="flex items-center gap-0.5 mt-1.5 ml-1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                      >
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-green-500" onClick={() => handleFeedback(msg.id, "like")}>
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleFeedback(msg.id, "dislike")}>
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
                <div className="mt-0.5 flex h-14 w-14 shrink-0 overflow-hidden rounded-full">
                  <img src={botAvatarImg} alt="Bot" className="h-full w-full object-cover" />
                </div>
                <div className="rounded-lg bg-card border border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing feed data...</span>
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>


          {/* Input */}
          <motion.div
            className="border-t border-border px-4 py-3"
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
