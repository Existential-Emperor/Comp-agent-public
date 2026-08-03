import { MessageSquare, Trash2, Loader2, MessageCirclePlus, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";


interface Thread {
  id: string;
  title: string;
  competitor_name: string | null;
  category: string;
  sub_category: string;
  created_at: string;
}

interface ChatSidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
  deletingThreadId: string | null;
  generatingThreadIds?: string[];
}

const ChatSidebar = ({ threads, activeThreadId, onSelectThread, onNewThread, onDeleteThread, deletingThreadId, generatingThreadIds = [] }: ChatSidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeThreadId && activeRef.current) {
      const scrollContainer = activeRef.current.closest('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        const el = activeRef.current;
        const containerRect = scrollContainer.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.bottom > containerRect.bottom || elRect.top < containerRect.top) {
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    }
  }, [activeThreadId]);

  if (collapsed) {
    return (
      <div className="relative flex h-full w-10 flex-col items-center border-r border-border/60 bg-background/15 backdrop-blur-2xl backdrop-saturate-150 py-3 shadow-[inset_-1px_0_0_hsl(var(--glow-primary)/0.10)]">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground" onClick={() => setCollapsed(false)}>
          <PanelLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-64 flex-col overflow-hidden border-r border-border/60 bg-background/15 backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_-1px_0_0_hsl(var(--glow-primary)/0.10)]">
      {/* Sentinel ambient ribbon — same aesthetic as Feed surfaces */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60"
        style={{
          background:
            "radial-gradient(120% 60% at 0% 0%, hsl(var(--glow-primary) / 0.18) 0%, transparent 60%), radial-gradient(120% 60% at 100% 100%, hsl(var(--glow-accent) / 0.14) 0%, transparent 65%)",
        }}
      />
      
      <div className="relative flex items-center justify-between border-b border-sidebar-border/60 px-4 py-3">
        <span className="text-sm font-semibold text-sidebar-foreground">Threads</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground" onClick={() => setCollapsed(true)}>
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="relative flex-1">
        <div className="space-y-0.5 p-2">
          {/* New Chat entry — mirrors active-thread highlight (glass + cyan inset glow + radar grid) */}
          {(() => {
            const isNewActive = activeThreadId === null;
            return (
              <motion.div
                className={`group relative w-full overflow-hidden rounded-md border transition-colors ${
                  isNewActive
                    ? "bg-background/85 backdrop-blur-xl border-border/60 text-sidebar-foreground shadow-[inset_2px_0_0_hsl(var(--glow-primary)/0.55),0_0_18px_-8px_hsl(var(--glow-primary)/0.35)]"
                    : "bg-background/5 border-border/20 text-sidebar-foreground/80 hover:bg-background/15 hover:text-sidebar-foreground"
                }`}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(hsl(var(--glow-primary) / 0.55) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--glow-primary) / 0.55) 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                    opacity: isNewActive ? 0.06 : 0.04,
                    maskImage:
                      "radial-gradient(ellipse 100% 120% at 50% 50%, black 30%, transparent 100%)",
                    WebkitMaskImage:
                      "radial-gradient(ellipse 100% 120% at 50% 50%, black 30%, transparent 100%)",
                  }}
                />
                <button
                  onClick={onNewThread}
                  className="relative z-10 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  <MessageCirclePlus className="h-3.5 w-3.5 shrink-0" />
                  <span>New Chat</span>
                </button>
              </motion.div>
            );
          })()}

          {threads.length === 0 && activeThreadId !== null && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Select a competitor to start analysis
            </p>
          )}
          <AnimatePresence initial={false}>
            {threads.map((t, i) => {
              const isActive = activeThreadId === t.id;
              return (
              <motion.div
                key={t.id}
                ref={isActive ? activeRef : undefined}
                className={`group relative grid w-full grid-cols-[minmax(0,1fr)_1.75rem] items-center overflow-hidden rounded-md border transition-colors ${
                  isActive
                    ? "bg-background/85 backdrop-blur-xl border-border/60 text-sidebar-foreground shadow-[inset_2px_0_0_hsl(var(--glow-primary)/0.55),0_0_18px_-8px_hsl(var(--glow-primary)/0.35)]"
                    : "bg-background/5 border-border/20 text-sidebar-foreground/80 hover:bg-background/15 hover:text-sidebar-foreground"
                }`}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12, height: 0 }}
                transition={{ duration: 0.25, delay: i * 0.03 }}
                layout
              >
                {/* Radar grid skeleton — mirrors the main chat surface pattern */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(hsl(var(--glow-primary) / 0.55) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--glow-primary) / 0.55) 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                    opacity: isActive ? 0.06 : 0.04,
                    maskImage:
                      "radial-gradient(ellipse 100% 120% at 50% 50%, black 30%, transparent 100%)",
                    WebkitMaskImage:
                      "radial-gradient(ellipse 100% 120% at 50% 50%, black 30%, transparent 100%)",
                  }}
                />
                <button
                  onClick={() => onSelectThread(t.id)}
                  className="relative z-10 min-w-0 overflow-hidden px-3 py-2 text-left text-sm"
                >
                  <div className="flex w-full min-w-0 items-center gap-2">
                     {generatingThreadIds.includes(t.id) ? (
                       <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                     ) : (
                       <MessageSquare className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
                     )}
                     <span className="block min-w-0 max-w-full flex-1 truncate" title={t.title || t.competitor_name || "New Thread"}>
                       {t.title || t.competitor_name || "New Thread"}
                     </span>
                   </div>
                      <p className="mt-0.5 block w-full truncate pl-5 text-xs text-muted-foreground" title={t.sub_category}>
                     {t.sub_category}
                   </p>
                </button>
                <div className="relative z-10 flex h-full items-center justify-center pr-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm({ id: t.id, name: t.title || t.competitor_name || "this thread" });
                    }}
                    disabled={deletingThreadId === t.id}
                    className="h-6 w-6 opacity-0 transition-opacity text-muted-foreground hover:text-destructive group-hover:opacity-100"
                  >
                    {deletingThreadId === t.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete thread?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? All conversational history for this thread will be permanently lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm) onDeleteThread(deleteConfirm.id);
                setDeleteConfirm(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChatSidebar;
