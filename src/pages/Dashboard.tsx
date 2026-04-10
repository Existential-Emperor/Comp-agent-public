import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { supabase } from "@/integrations/supabase/client";
import ChatSidebar from "@/components/ChatSidebar";
import ChatInterface from "@/components/ChatInterface";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserCircle, LogOut, Newspaper, Camera, Loader2 } from "lucide-react";
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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: any;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [evalScores, setEvalScores] = useState<Record<string, any>>({});
  const [traceIds, setTraceIds] = useState<Record<string, string>>({});  // messageId -> traceId
  const abortControllerRef = useRef<AbortController | null>(null);

  // Profile popup state
  const [profileOpen, setProfileOpen] = useState(false);
  const { avatarUrl, setAvatarUrl } = useUserAvatar();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  // Load discovered competitors from DB and merge with seed
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

  // Auto-discover competitors only when sub-category is selected
  useEffect(() => {
    if (!subCategory || !userChangedSubCategory.current) return;
    userChangedSubCategory.current = false;
    const discoverCompetitors = async () => {
      setRefreshing(true);
      try {
        await supabase.functions.invoke("discover-competitors", { body: { category, subCategory } });
        await loadCompetitors();
      } catch { /* seed data still available */ }
      setRefreshing(false);
    };
    discoverCompetitors();
  }, [subCategory]);

  // Track whether we're loading a previous thread's messages
  const [threadLoading, setThreadLoading] = useState(false);

  // Load messages and eval scores for active thread
  useEffect(() => {
    if (!activeThreadId) { setMessages([]); setEvalScores({}); setThreadLoading(false); return; }
    if (!user) return;
    setMessages([]); // Clear stale messages immediately
    setThreadLoading(true);
    const loadMessages = async () => {
      try {
        const [{ data: msgData }, { data: scoreData }] = await Promise.all([
          supabase.from("chat_messages").select("*").eq("thread_id", activeThreadId).order("created_at", { ascending: true }),
          supabase.from("evaluation_scores").select("*").eq("user_id", user.id),
        ]);
        if (msgData) setMessages(msgData as Message[]);
        if (scoreData) {
          const scores: Record<string, any> = {};
          for (const s of scoreData) {
            if (s.message_id) scores[s.message_id] = s;
          }
          setEvalScores(scores);
        }
      } catch (err) {
        console.error("Failed to load thread messages:", err);
      } finally {
        setThreadLoading(false);
      }
    };
    loadMessages();
  }, [activeThreadId, user]);

  // Stop ongoing response
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setChatLoading(false);
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

    setChatLoading(true);

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
    } else {
      setChatLoading(false);
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
        setMessages([]);
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
              // Progressive token streaming — update assistant message in-place
              streamingContent += data.token;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && last.id.startsWith("streaming-")) {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: streamingContent } : m);
                }
                return [...prev, { id: `streaming-${Date.now()}`, role: "assistant" as const, content: streamingContent, created_at: new Date().toISOString() }];
              });
            } else if (currentEvent === "content" && data.content) {
              // Final processed content — save to DB and replace streaming message
              const { data: msgData } = await supabase.from("chat_messages")
                .insert({ thread_id: threadId, user_id: user!.id, role: "assistant", content: data.content })
                .select("id").single();

              const { data: updatedMessages } = await supabase.from("chat_messages")
                .select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
              if (updatedMessages) setMessages(updatedMessages as Message[]);

              if (msgData) {
                (controller as any).__lastMsgId = msgData.id;
              }
            } else if (currentEvent === "metadata") {
              const lastMsgId = (controller as any).__lastMsgId;
              if (data.traceId && lastMsgId) {
                setTraceIds((prev) => ({ ...prev, [lastMsgId]: data.traceId }));
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === lastMsgId
                      ? { ...message, metadata: { ...(message.metadata || {}), trace_id: data.traceId } }
                      : message,
                  ),
                );
                void supabase
                  .from("agent_traces")
                  .update({ message_id: lastMsgId })
                  .eq("id", data.traceId);
              }
              if (data.evalScores && lastMsgId) {
                const scores = data.evalScores;
                const competitorLabel = selectedCompetitors.join(" vs ");
                await supabase.from("evaluation_scores").insert({
                  user_id: user!.id, category, sub_category: subCategory, competitor_name: competitorLabel,
                  message_id: lastMsgId,
                  factual_correctness: scores.factual_correctness?.score ?? scores.factual_correctness,
                  structural_clarity: scores.structural_clarity?.score ?? scores.structural_clarity,
                  depth_of_comparison: scores.depth_of_comparison?.score ?? scores.depth_of_comparison,
                  visual_evidence: scores.visual_evidence?.score ?? scores.visual_evidence,
                  citation_coverage: scores.citation_coverage?.score ?? scores.citation_coverage,
                  overall_score: scores.overall_score,
                });
                setEvalScores((prev) => ({ ...prev, [lastMsgId]: scores }));
              }
            } else if (currentEvent === "error") {
              toast({ title: "Analysis error", description: data.content || "Unknown error", variant: "destructive" });
            }
          } catch { /* ignore parse errors */ }
        }
      }
    }
  };

  const sendAnalysisRequest = async (threadId: string) => {
    if (!user) return;
    setChatLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

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
    setMessages((prev) => [...prev, optimisticUserMsg]);

    await supabase.from("chat_messages").insert({ thread_id: threadId, user_id: user.id, role: "user", content: userMessage });

    try {
      await consumeSSEStream(
        { category, subCategory, competitor: competitorLabel, competitors: selectedCompetitors, message: userMessage, threadId },
        threadId, controller
      );
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) return;
      toast({ title: "Analysis failed", description: "Could not generate analysis. Please try again.", variant: "destructive" });
    }

    if (!controller.signal.aborted) {
      const { data: updatedMessages } = await supabase
        .from("chat_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
      if (updatedMessages) setMessages(updatedMessages as Message[]);
    }
    setChatLoading(false);
    abortControllerRef.current = null;
  };

  const handleSendMessage = async (content: string) => {
    if (!activeThreadId || !user || chatLoading) return;
    setChatLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const optimisticUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    await supabase.from("chat_messages").insert({ thread_id: activeThreadId, user_id: user.id, role: "user", content });

    const { data: msgs } = await supabase
      .from("chat_messages").select("*").eq("thread_id", activeThreadId).order("created_at", { ascending: true });
    if (msgs) setMessages(msgs as Message[]);

    try {
      await consumeSSEStream(
        {
          category, subCategory, competitor: selectedCompetitors.join(" vs "), competitors: selectedCompetitors, message: content,
          threadId: activeThreadId,
          history: msgs?.map((m: any) => ({ role: m.role, content: m.content })) ?? [],
        },
        activeThreadId, controller
      );
    } catch {
      if (!controller.signal.aborted) toast({ title: "Error", description: "Failed to get response.", variant: "destructive" });
    }

    if (!controller.signal.aborted) {
      const { data: finalMsgs } = await supabase
        .from("chat_messages").select("*").eq("thread_id", activeThreadId).order("created_at", { ascending: true });
      if (finalMsgs) setMessages(finalMsgs as Message[]);
    }
    setChatLoading(false);
    abortControllerRef.current = null;
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
    toast({ title: feedback === "like" ? "👍 Added to knowledge base" : "👎 Feedback recorded" });
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
    setActiveThreadId(threadId);
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-tight text-foreground">Comp Intelligence Agent</span>
          <span className="text-xs text-muted-foreground">Adaptive Planning</span>
        </div>
        <div className="flex items-center gap-1">
<Button variant="outline" size="sm" className="gap-1.5 text-xs border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" onClick={() => navigate("/")}>
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

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <ChatSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onNewThread={() => {
            // Abort any ongoing analysis so user can start fresh
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
              abortControllerRef.current = null;
            }
            setChatLoading(false);
            setActiveThreadId(null);
            setCategory("");
            setSubCategory("");
            setSelectedCompetitors([]);
            setMessages([]);
          }}
          onDeleteThread={handleDeleteThread}
          deletingThreadId={deletingThreadId}
        />
        <div className="flex-1">
          <ChatInterface
            messages={messages}
            loading={chatLoading}
            threadLoading={threadLoading}
            onSendMessage={handleSendMessage}
            onFeedback={handleFeedback}
            onStop={handleStop}
            
            category={category}
            subCategory={subCategory}
            selectedCompetitors={selectedCompetitors}
            competitors={mergedCompetitors}
            onCategoryChange={handleCategoryChange}
            onSubCategoryChange={handleSubCategoryChange}
            onCompetitorsChange={setSelectedCompetitors}
            refreshing={refreshing}
            onLetsGo={handleLetsGo}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
