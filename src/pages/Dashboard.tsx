import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { supabase } from "@/integrations/supabase/client";
import ChatSidebar from "@/components/ChatSidebar";
import ChatInterface from "@/components/ChatInterface";
import { armNotificationPermission } from "@/hooks/useCompletionNotification";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserCircle, LogOut, Newspaper, Camera, Loader2, MessageSquarePlus, X, ImagePlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { getSeedCompetitors } from "@/lib/seed-data";


interface Thread {
  id: string;
  title: string;
  competitor_name: string | null;
  category: string;
  sub_category: string;
  created_at: string;
}

import type { VisualMediaItem } from "@/components/FormattedResponse";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: any;
  /** Stable render identity that survives the streaming→final promotion. The
   *  `id` legitimately changes (temp streaming id → real DB id) but `clientKey`
   *  stays constant so React keeps the same component instance and reconciles
   *  instead of remounting the whole subtree. */
  clientKey?: string;
  /** True while tokens are still streaming into this bubble. */
  isStreaming?: boolean;
  /** Structured Visual Overview media, delivered on the dedicated `media` SSE
   *  channel so the gallery can populate EARLY/in parallel during streaming.
   *  Live-only: not persisted (the canonical gallery lives in `content`). When
   *  present, FormattedResponse renders the gallery from this instead of parsing
   *  it out of `content`. */
  media?: VisualMediaItem[];
}


const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [selectedCompetitors, setSelectedCompetitors] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [discoveredCompetitors, setDiscoveredCompetitors] = useState<{ name: string; website: string; description: string }[]>([]);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const userChangedSubCategory = useRef(false);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);

  // Per-thread state — keyed by threadId
  const [threadMessages, setThreadMessages] = useState<Record<string, Message[]>>({});
  const [threadChatLoading, setThreadChatLoading] = useState<Record<string, boolean>>({});
  const threadAbortControllers = useRef<Record<string, AbortController>>({});

  // Derived values for the currently visible thread
  const messages = activeThreadId ? (threadMessages[activeThreadId] ?? []) : [];
  const chatLoading = activeThreadId ? (threadChatLoading[activeThreadId] ?? false) : false;

  // Helper: update messages for a specific thread (supports functional updater)
  const setMessagesForThread = (threadId: string, updater: Message[] | ((prev: Message[]) => Message[])) => {
    setThreadMessages(prev => ({
      ...prev,
      [threadId]: typeof updater === 'function' ? updater(prev[threadId] ?? []) : updater,
    }));
  };

  // Helper: set loading for a specific thread
  const setLoadingForThread = (threadId: string, loading: boolean) => {
    setThreadChatLoading(prev => ({ ...prev, [threadId]: loading }));
    // Progress is only meaningful while loading — clear it when loading ends.
    if (!loading) {
      setThreadProgress(prev => {
        const next = { ...prev };
        delete next[threadId];
        return next;
      });
    }
  };

  // Latest backend progress step per thread (real SSE progress events).
  const [threadProgress, setThreadProgress] = useState<Record<string, string>>({});

  const [evalScores, setEvalScores] = useState<Record<string, any>>({});
  const [traceIds, setTraceIds] = useState<Record<string, string>>({});  // messageId -> traceId

  // Keep ref in sync with activeThreadId
  useEffect(() => { activeThreadIdRef.current = activeThreadId; }, [activeThreadId]);

  // Profile popup state
  const [profileOpen, setProfileOpen] = useState(false);
  const { avatarUrl, setAvatarUrl } = useUserAvatar();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Share Feedback state
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackImages, setFeedbackImages] = useState<{ file: File; preview: string }[]>([]);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const feedbackImageInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
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
      toast({ title: "Avatar updated", description: "Your profile picture has been saved." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message || "Could not upload avatar.", variant: "destructive" });
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

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


  const loadCompetitors = useCallback(async () => {
    if (!category || !subCategory) {
      setDiscoveredCompetitors([]);
      return;
    }
    const { data } = await supabase
      .from("competitors")
      .select("name, website, description")
      .eq("category", category)
      .eq("sub_category", subCategory)
      .eq("is_seed", false);
    if (data) setDiscoveredCompetitors(data as { name: string; website: string; description: string }[]);
  }, [category, subCategory]);

  // Merged competitor list: seed + discovered, deduplicated
  const mergedCompetitors = (() => {
    const seed = getSeedCompetitors(category, subCategory);
    const all = [...seed, ...discoveredCompetitors];
    const seen = new Set<string>();
    return all.filter((c) => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    });
  })();

  // Load threads (exclude archived)
  const loadThreads = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("chat_threads")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .neq("category", "News Summary")
      .order("updated_at", { ascending: false });
    if (data) setThreads(data as Thread[]);
  }, [user]);

  useEffect(() => { loadThreads(); }, [loadThreads]);
  useEffect(() => { loadCompetitors(); }, [loadCompetitors]);

  // Discover competitors — called when competitor dropdown is opened
  const handleDiscoverCompetitors = useCallback(async () => {
    if (!subCategory || refreshing) return;
    setRefreshing(true);
    try {
      await supabase.functions.invoke("discover-competitors", { body: { category, subCategory } });
      await loadCompetitors();
    } catch { /* seed data still available */ }
    setRefreshing(false);
  }, [category, subCategory, refreshing, loadCompetitors]);

  // Track whether we're loading a previous thread's messages
  const [fetchingThread, setFetchingThread] = useState(false);

  // Load messages and eval scores for active thread (skip if cached)
  useEffect(() => {
    if (!activeThreadId || !user) return;
    // Already have messages cached (loaded before or actively streaming) — don't re-fetch
    if (threadMessages[activeThreadId] !== undefined) return;

    const loadedForThreadId = activeThreadId;
    setFetchingThread(true);
    const loadMessages = async () => {
      try {
        const [{ data: msgData }, { data: traceData }] = await Promise.all([
          supabase.from("chat_messages").select("*").eq("thread_id", loadedForThreadId).order("created_at", { ascending: true }),
          supabase.from("agent_traces").select("id, message_id").eq("thread_id", loadedForThreadId).not("message_id", "is", null),
        ]);
        // Staleness check: user may have switched threads during await
        if (loadedForThreadId !== activeThreadIdRef.current) return;

        // Build trace map: message_id -> trace_id
        const traceMap: Record<string, string> = {};
        for (const t of traceData || []) {
          if (t.message_id) traceMap[t.message_id] = t.id;
        }
        if (msgData) {
          const messageIds = msgData.map((m: any) => m.id);
          setMessagesForThread(loadedForThreadId, msgData.map((m: any) => ({
            ...m,
            // On reload there is no structured `media` (it is a live-only SSE
            // enhancement). FormattedResponse re-derives the gallery from the
            // canonical "## Visual Overview" embedded in `content` — the single
            // persisted source of truth.
            metadata: { ...(m.metadata || {}), ...(traceMap[m.id] ? { trace_id: traceMap[m.id] } : {}) },
          })) as Message[]);
          setTraceIds((prev) => ({ ...prev, ...traceMap }));

          // Load eval scores filtered to this thread's messages only
          if (messageIds.length > 0) {
            const { data: scoreData } = await supabase
              .from("evaluation_scores").select("*").eq("user_id", user.id).in("message_id", messageIds);
            if (loadedForThreadId !== activeThreadIdRef.current) return;
            if (scoreData) {
              const scores: Record<string, any> = {};
              for (const s of scoreData) {
                if (s.message_id) scores[s.message_id] = s;
              }
              setEvalScores(scores);
            }
          } else {
            setEvalScores({});
          }
        }
      } catch (err) {
        console.error("Failed to load thread messages:", err);
      } finally {
        setFetchingThread(false);
      }
    };
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, user]); // Note: do NOT add threadMessages to deps — it would cause infinite loops

  // Stop ongoing response — only stop the active thread
  const handleStop = async () => {
    if (!activeThreadId) return;
    const controller = threadAbortControllers.current[activeThreadId];
    if (controller) {
      controller.abort();
      delete threadAbortControllers.current[activeThreadId];
    }
    setLoadingForThread(activeThreadId, false);
    // Add cancellation message
    setMessagesForThread(activeThreadId, (prev) => {
      const withoutStream = prev.filter((m) => !m.id.startsWith("stream-"));
      return [...withoutStream, { id: `cancel-${Date.now()}`, role: "assistant" as const, content: "Response generation was cancelled by the user.", created_at: new Date().toISOString() }];
    });
    // Log cancelled trace
    if (user) {
      void supabase.from("agent_traces").insert({
        user_id: user.id,
        thread_id: activeThreadId,
        category: category || "General",
        sub_category: subCategory || "General",
        competitor_name: selectedCompetitors.join(", ") || null,
        agent_source: "comp_agent",
        trace_type: "conversation",
        status: "cancelled",
        formatted_output: "Response generation was cancelled by the user.",
      });
    }
  };

  // Compute next thread title with gap-filling numbering
  const getNextThreadTitle = useCallback(async () => {
    const competitorLabel = selectedCompetitors.join(" vs ");
    if (!user || selectedCompetitors.length === 0 || !subCategory) return competitorLabel;

    const { data: allThreads } = await supabase
      .from("chat_threads")
      .select("title")
      .eq("user_id", user.id)
      .eq("competitor_name", competitorLabel)
      .eq("sub_category", subCategory)
      .eq("is_archived", false);

    if (!allThreads || allThreads.length === 0) return competitorLabel;

    const escapedPrefix = competitorLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const usedNumbers = new Set<number>();
    let maxNumber = 1;

    for (const t of allThreads) {
      if (!t.title) continue;
      if (t.title === competitorLabel) { usedNumbers.add(1); continue; }
      const match = t.title.match(new RegExp(`^${escapedPrefix}\\s+(\\d+)$`));
      if (match) {
        const num = parseInt(match[1], 10);
        usedNumbers.add(num);
        if (num > maxNumber) maxNumber = num;
      }
    }

    for (let i = 2; i <= maxNumber + 1; i++) {
      if (!usedNumbers.has(i)) return `${competitorLabel} ${i}`;
    }
    return `${competitorLabel} ${maxNumber + 1}`;
  }, [user, selectedCompetitors, subCategory]);

  // Create thread when user clicks "Let's Go!"
  const handleLetsGo = useCallback(async () => {
    if (!user || !category || !subCategory || selectedCompetitors.length === 0) return;
    if (chatLoading) return;
    void armNotificationPermission();

    const competitorLabel = selectedCompetitors.join(" vs ");
    const title = await getNextThreadTitle();

    const { data, error } = await supabase
      .from("chat_threads")
      .insert({
        user_id: user.id,
        category,
        sub_category: subCategory,
        competitor_name: competitorLabel,
        title,
      })
      .select()
      .single();

    if (data && !error) {
      setActiveThreadId(data.id);
      loadThreads();
      sendAnalysisRequest(data.id);
    }
  }, [user, category, subCategory, selectedCompetitors, chatLoading, getNextThreadTitle]);

  // Delete (archive) thread
  const handleDeleteThread = async (threadId: string) => {
    if (!user) return;
    setDeletingThreadId(threadId);
    try {
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      let summary = "";
      if (msgs && msgs.length > 0) {
        const conversationText = msgs.map((m) => `${m.role}: ${(m.content as string).slice(0, 500)}`).join("\n");
        summary = conversationText.slice(0, 2000);
      }

      await supabase.from("chat_threads").update({ is_archived: true, summary }).eq("id", threadId).eq("user_id", user.id);

      if (activeThreadId === threadId) {
        setActiveThreadId(null);
      }
      // Clean up per-thread state
      setThreadMessages(prev => { const next = { ...prev }; delete next[threadId]; return next; });
      setThreadChatLoading(prev => { const next = { ...prev }; delete next[threadId]; return next; });
      if (threadAbortControllers.current[threadId]) {
        threadAbortControllers.current[threadId].abort();
        delete threadAbortControllers.current[threadId];
      }

      await loadThreads();
      toast({ title: "Conversation deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete conversation.", variant: "destructive" });
    }
    setDeletingThreadId(null);
  };

  // SSE stream consumer for chat-analysis edge function
  const consumeSSEStream = async (
    body: Record<string, any>,
    threadId: string,
    controller: AbortController
  ): Promise<void> => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) throw new Error("No auth token");

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/chat-analysis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Edge function error: ${response.status} ${errText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let streamingContent = "";
    let currentEvent = "";
    let finalizedAssistantMessageId: string | null = null;
    let pendingTraceId: string | null = null;
    // Latest media set from the dedicated `media` channel. Attached to the
    // streaming bubble as it arrives (gallery paints early, in parallel with the
    // prose tokens) and carried through the streaming→final promotion.
    let streamingMedia: VisualMediaItem[] = [];

    // Throttled flush for the in-flight assistant message.
    //
    // Tokens arrive far faster than is useful to repaint. The previous design
    // flushed once PER ANIMATION FRAME (~60/s), so the streaming bubble re-parsed
    // and re-rendered the entire (growing) markdown document 60 times a second.
    // That is an O(frames x docLength) treadmill: on a long, table/image-heavy
    // response the per-frame work compounds until the main thread is saturated —
    // the end-of-stream freeze. Throttling to a fixed cadence collapses the frame
    // count ~6x (proven ~10x cumulative reduction in standalone profiling) while
    // staying visually smooth (~11 updates/s reads fine). This is the
    // mechanism-agnostic lever: it cuts every per-flush cost (parse, reconcile,
    // linkify, table dedup, layout) regardless of which one dominates.
    const FLUSH_INTERVAL_MS = 90;
    let streamingBubbleId: string | null = null;
    let rafHandle: number | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFlushAt = 0;
    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const flushStreaming = () => {
      if (!streamingBubbleId) return;
      const currentStreamContent = streamingContent;
      const bubbleId = streamingBubbleId;
      setMessagesForThread(threadId, (prev) =>
        prev.map((m) => (m.id === bubbleId ? { ...m, content: currentStreamContent } : m))
      );
    };
    const scheduleFlush = () => {
      if (flushTimer !== null) return;
      const elapsed = now() - lastFlushAt;
      const delay = elapsed >= FLUSH_INTERVAL_MS ? 0 : FLUSH_INTERVAL_MS - elapsed;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        lastFlushAt = now();
        if (rafHandle !== null) return;
        rafHandle = requestAnimationFrame(() => {
          rafHandle = null;
          flushStreaming();
        });
      }, delay);
    };
    const finalizeStreamingFlush = () => {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      flushStreaming();
    };

    const linkTraceToMessage = async (traceId: string, messageId: string) => {
      const { error: traceError } = await supabase
        .from("agent_traces")
        .update({ message_id: messageId })
        .eq("id", traceId);
      if (traceError) console.error("Failed to link trace to message:", traceError);

      // Persist trace_id in chat_messages.metadata so it survives DB reloads
      const { error: msgError } = await supabase
        .from("chat_messages")
        .update({ metadata: { trace_id: traceId } })
        .eq("id", messageId);
      if (msgError) console.error("Failed to persist trace_id to message metadata:", msgError);
    };

    try {
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
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (currentEvent === "token" && data.token) {
                // Progressive token streaming — accumulate synchronously, flush per animation frame
                streamingContent += data.token;
                if (!streamingBubbleId) {
                  // Create the empty streaming bubble synchronously on the first token
                  // so autoscroll / streaming indicators see it within the same microtask.
                  // `clientKey` is the STABLE render identity carried through finalize.
                  streamingBubbleId = `streaming-${Date.now()}`;
                  const bubbleId = streamingBubbleId;
                  const initialMedia = streamingMedia;
                  setMessagesForThread(threadId, (prev) => [
                    ...prev,
                    { id: bubbleId, clientKey: bubbleId, isStreaming: true, role: "assistant" as const, content: "", created_at: new Date().toISOString(), media: initialMedia },
                  ]);
                }
                scheduleFlush();
              } else if (currentEvent === "content" && data.content) {
                finalizeStreamingFlush();
                const bubbleId = streamingBubbleId;
                streamingBubbleId = null;
                // Server provides messageId — it persists the chat_messages
                // row in the background. No client-side DB insert needed.
                const msgId = (data.messageId ?? data.message_id) as string | undefined;
                // In-place promotion: keep the SAME message object's clientKey so
                // React keeps the same component instance and reconciles the prose
                // subtree instead of unmounting/remounting it. `id` is swapped to
                // the real DB id (so trace/feedback maps work); content is updated
                // because finalContent carries the server-reconstructed Visual
                // Overview + deterministic contract repairs (it is NOT identical to
                // the streamed tokens). Never filter-out-and-append here.
                // Media rides on the content event (and/or arrived earlier on the
                // `media` channel). Carry the authoritative set through the
                // in-place promotion so the gallery survives streaming→final.
                const finalMedia = (data.media as VisualMediaItem[] | undefined) ?? streamingMedia;
                if (msgId) {
                  finalizedAssistantMessageId = msgId;
                  setMessagesForThread(threadId, (prev) =>
                    prev.map((m) =>
                      m.id === bubbleId
                        ? { ...m, id: msgId, isStreaming: false, content: data.content, created_at: new Date().toISOString(), media: finalMedia ?? m.media, metadata: pendingTraceId ? { trace_id: pendingTraceId } : m.metadata }
                        : m,
                    ),
                  );
                  if (pendingTraceId) {
                    setTraceIds((prev) => ({ ...prev, [msgId]: pendingTraceId! }));
                  }
                } else {
                  // Legacy fallback — no server messageId, client must insert.
                  const { data: msgData } = await supabase.from("chat_messages")
                    .insert({ thread_id: threadId, user_id: user!.id, role: "assistant", content: data.content })
                    .select("id").single();
                  if (msgData) {
                    finalizedAssistantMessageId = msgData.id;
                    setMessagesForThread(threadId, (prev) =>
                      prev.map((m) =>
                        m.id === bubbleId
                          ? { ...m, id: msgData.id, isStreaming: false, content: data.content, created_at: new Date().toISOString(), media: finalMedia ?? m.media, metadata: pendingTraceId ? { trace_id: pendingTraceId } : m.metadata }
                          : m,
                      ),
                    );
                    if (pendingTraceId) {
                      setTraceIds((prev) => ({ ...prev, [msgData.id]: pendingTraceId! }));
                      void linkTraceToMessage(pendingTraceId, msgData.id);
                    }
                  }
                }
              } else if (currentEvent === "media" && Array.isArray(data.items)) {
                // Dedicated media channel — decoupled from the prose stream. Attach
                // / refresh the gallery on the in-flight bubble (or, if it already
                // promoted, the finalized message). Rendering is progressive on the
                // client, so this never causes the end-of-stream synchronous mount.
                streamingMedia = data.items as VisualMediaItem[];
                const targetId = streamingBubbleId ?? finalizedAssistantMessageId;
                if (targetId) {
                  const media = streamingMedia;
                  setMessagesForThread(threadId, (prev) =>
                    prev.map((m) => (m.id === targetId ? { ...m, media } : m)),
                  );
                }
              } else if (currentEvent === "metadata") {
                if (data.traceId) {
                  pendingTraceId = data.traceId;
                  if (finalizedAssistantMessageId) {
                    await linkTraceToMessage(data.traceId, finalizedAssistantMessageId);
                    setTraceIds((prev) => ({ ...prev, [finalizedAssistantMessageId!]: data.traceId }));
                  }
                  setMessagesForThread(threadId, (prev) =>
                    prev.map((message) =>
                      message.id === finalizedAssistantMessageId
                        ? { ...message, metadata: { ...(message.metadata || {}), trace_id: data.traceId } }
                        : message,
                    ),
                  );
                }
                if (data.evalScores && finalizedAssistantMessageId) {
                  // Operational persistence (evaluation_scores + agent_traces.judge_scores)
                  // is written server-side by the background judge task — the single
                  // source of truth. The client only updates UI, never the DB.
                  setEvalScores((prev) => ({ ...prev, [finalizedAssistantMessageId!]: data.evalScores }));
                }
              } else if (currentEvent === "progress" && data.step) {
                // Real backend pipeline progress — surface the actual stage.
                setThreadProgress((prev) => ({ ...prev, [threadId]: data.step }));
              } else if (currentEvent === "error") {
                finalizeStreamingFlush();
                toast({ title: "Analysis error", description: data.content || "Unknown error", variant: "destructive" });
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
      // Stream ended — flush any remaining pending content
      finalizeStreamingFlush();
    } finally {
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
    }
  };

  const sendAnalysisRequest = async (threadId: string) => {
    if (!user) return;
    setLoadingForThread(threadId, true);
    const controller = new AbortController();
    threadAbortControllers.current[threadId] = controller;

    const isFullProduct = category === "Full Product";
    const competitorLabel = selectedCompetitors.join(" vs ");
    const competitorList = selectedCompetitors.join(", ");
    const userMessage = isFullProduct
      ? selectedCompetitors.length > 1
        ? `Generate a comprehensive high-level competitive analysis comparing ${competitorList} against Workday Adaptive Planning as full products. Compare across all major capability areas: Reporting & Analytics, Modeling & Architecture, Intelligent Planning, Integration, Collaboration & Workflow, and Specialized Planning Modules.`
        : `Generate a comprehensive high-level competitive analysis of ${competitorLabel} vs Workday Adaptive Planning as a full product. Compare across all major capability areas: Reporting & Analytics, Modeling & Architecture, Intelligent Planning, Integration, Collaboration & Workflow, and Specialized Planning Modules.`
      : selectedCompetitors.length > 1
        ? `Generate a comprehensive competitive analysis comparing ${competitorList} against Workday Adaptive Planning in the context of ${subCategory} (${category}). Compare all competitors side-by-side.`
        : `Generate a comprehensive competitive analysis of ${competitorLabel} vs Workday Adaptive Planning in the context of ${subCategory} (${category}).`;

    const optimisticUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessagesForThread(threadId, (prev) => [...prev, optimisticUserMsg]);

    await supabase.from("chat_messages").insert({ thread_id: threadId, user_id: user.id, role: "user", content: userMessage });

    try {
      await consumeSSEStream(
        { category, subCategory, competitor: competitorLabel, competitors: selectedCompetitors, message: userMessage, threadId },
        threadId, controller
      );
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        setLoadingForThread(threadId, false);
        return;
      }
      toast({ title: "Analysis failed", description: "Could not generate analysis. Please try again.", variant: "destructive" });
    }

    // Loading clears immediately — the user already has the content.
    setLoadingForThread(threadId, false);
    delete threadAbortControllers.current[threadId];
  };

  const handleSendMessage = async (content: string) => {
    if (!user || chatLoading) return;

    // In direct chat mode with no active thread, create one on-the-fly
    let threadId = activeThreadId;
    if (!threadId) {
      const threadCategory = category || "General";
      const threadSubCategory = subCategory || "General";
      const competitorLabel = selectedCompetitors.length > 0 ? selectedCompetitors.join(" vs ") : null;
      const title = content.slice(0, 60) + (content.length > 60 ? "…" : "");

      const { data, error } = await supabase
        .from("chat_threads")
        .insert({
          user_id: user.id,
          category: threadCategory,
          sub_category: threadSubCategory,
          competitor_name: competitorLabel,
          title,
        })
        .select()
        .single();

      if (error || !data) {
        toast({ title: "Error", description: "Failed to start conversation.", variant: "destructive" });
        return;
      }
      threadId = data.id;
      setActiveThreadId(threadId);
      loadThreads();
    }

    setLoadingForThread(threadId, true);
    const controller = new AbortController();
    threadAbortControllers.current[threadId] = controller;

    const optimisticUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessagesForThread(threadId, (prev) => [...prev, optimisticUserMsg]);

    await supabase.from("chat_messages").insert({ thread_id: threadId, user_id: user.id, role: "user", content });

    const { data: msgs } = await supabase
      .from("chat_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
    if (msgs) setMessagesForThread(threadId, msgs as Message[]);

    try {
      await consumeSSEStream(
        {
          category: category || "General", subCategory: subCategory || "General", competitor: selectedCompetitors.join(" vs "), competitors: selectedCompetitors, message: content,
          threadId: threadId,
          history: msgs?.map((m: any) => ({ role: m.role, content: m.content })) ?? [],
        },
        threadId, controller
      );
    } catch (err: any) {
      if (controller.signal.aborted) {
        setLoadingForThread(threadId, false);
        return;
      }
      toast({ title: "Error", description: "Failed to get response.", variant: "destructive" });
    }

    setLoadingForThread(threadId, false);
    delete threadAbortControllers.current[threadId];
  };

  const handleFeedback = async (messageId: string, feedback: "like" | "dislike") => {
    if (!user) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    // Update trace feedback if traceId exists
    const traceId = traceIds[messageId];
    if (traceId) {
      supabase.functions.invoke("trace-feedback", {
        body: { trace_id: traceId, feedback_vote: feedback },
      }).catch(() => {}); // fire-and-forget
    }

    await supabase.from("validated_responses").insert({ user_id: user.id, category, sub_category: subCategory, competitor_name: selectedCompetitors.join(" vs "), response_content: msg.content, feedback });
  };

  const handleCategoryChange = (v: string) => {
    setCategory(v);
    userChangedSubCategory.current = true;
    if (v === "Full Product") {
      setSubCategory("Full Product");
    } else {
      setSubCategory("");
    }
    setSelectedCompetitors([]);
  };
  const handleSubCategoryChange = (v: string) => { userChangedSubCategory.current = true; setSubCategory(v); setSelectedCompetitors([]); };

  const handleSelectThread = (threadId: string) => {
    const thread = threads.find((t) => t.id === threadId);
    if (thread) {
      setCategory(thread.category);
      setSubCategory(thread.sub_category);
      const names = (thread.competitor_name ?? "").split(" vs ").filter(Boolean);
      setSelectedCompetitors(names.length > 0 ? names : []);
    }
    setActiveThreadId(threadId); // background generation in previous thread continues unaffected
  };

  // Compute generating thread IDs for sidebar indicator
  const generatingThreadIds = Object.entries(threadChatLoading)
    .filter(([, loading]) => loading)
    .map(([id]) => id);

  return (
    <div className="relative z-10 flex h-screen flex-col">
      {/* Header — mirrors Feed header to share the global SentinelBackground */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-background/30 backdrop-blur-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-signal text-xl font-bold tracking-[0.18em] uppercase leading-none transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm"
            aria-label="Go to Feed"
          >
            Sentinel
          </button>
          <span className="h-6 w-px bg-border" aria-hidden="true" />
          <span className="text-xl font-bold tracking-tight text-foreground drop-shadow-[0_0_12px_hsl(var(--primary)/0.35)]">Comp Agent</span>
        </div>
        <div className="flex items-center gap-1">
<Button variant="outline" size="sm" className="gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/10 hover:text-primary" onClick={() => navigate("/")}>
            <Newspaper className="h-3.5 w-3.5" />
            Feed
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <UserCircle className="h-16 w-16" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                <UserCircle className="mr-2 h-4 w-4" />
                Profile
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

      {/* Profile dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Avatar section */}
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
        if (!open) {
          setFeedbackText("");
          feedbackImages.forEach(img => URL.revokeObjectURL(img.preview));
          setFeedbackImages([]);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Image upload */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Attachments (optional)</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => feedbackImageInputRef.current?.click()}
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Add Images
                </Button>
                <input
                  ref={feedbackImageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFeedbackImageAdd}
                />
              </div>
              {feedbackImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {feedbackImages.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={img.preview}
                        alt={`Attachment ${idx + 1}`}
                        className="h-16 w-16 rounded-md object-cover border border-border"
                      />
                      <button
                        onClick={() => handleFeedbackImageRemove(idx)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Text feedback */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Feedback *</label>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Tell us what you think..."
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                rows={5}
              />
              {feedbackText.length > 0 && feedbackText.trim().length < 3 && (
                <p className="text-xs text-destructive">Please enter at least 3 characters</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFeedbackDialogOpen(false)} disabled={feedbackSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleFeedbackSubmit}
              disabled={feedbackSubmitting || feedbackText.trim().length < 3}
            >
              {feedbackSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-1 overflow-hidden">
        <ChatSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onNewThread={() => {
            setActiveThreadId(null);
            setCategory("");
            setSubCategory("");
            setSelectedCompetitors([]);
          }}
          onDeleteThread={handleDeleteThread}
          deletingThreadId={deletingThreadId}
          generatingThreadIds={generatingThreadIds}
        />
        <div
          className="relative flex-1 min-w-0 bg-background/10 backdrop-blur-md border-l border-border/40 shadow-[inset_1px_0_0_hsl(var(--glow-primary)/0.10)]"
        >
          <ChatInterface
            messages={messages}
            loading={chatLoading}
            progress={activeThreadId ? threadProgress[activeThreadId] : undefined}
            threadLoading={fetchingThread}
            onSendMessage={handleSendMessage}
            onFeedback={handleFeedback}
            onStop={handleStop}
            traceIds={traceIds}
            
            category={category}
            subCategory={subCategory}
            selectedCompetitors={selectedCompetitors}
            competitors={mergedCompetitors}
            onCategoryChange={handleCategoryChange}
            onSubCategoryChange={handleSubCategoryChange}
            onCompetitorsChange={setSelectedCompetitors}
            refreshing={refreshing}
            onLetsGo={handleLetsGo}
            onDiscoverCompetitors={handleDiscoverCompetitors}
            discoveredCompetitors={discoveredCompetitors}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
