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
}

const ChatSidebar = ({ threads, activeThreadId, onSelectThread, onNewThread, onDeleteThread, deletingThreadId }: ChatSidebarProps) => {
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
      <motion.div
        className="flex h-full w-10 flex-col items-center border-r border-border bg-sidebar py-3"
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 40, opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground" onClick={() => setCollapsed(false)}>
          <PanelLeft className="h-4 w-4" />
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex h-full w-64 flex-col border-r border-border bg-sidebar shimmer-bg"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 256, opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
        <span className="text-sm font-semibold text-sidebar-foreground">Threads</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground" onClick={() => setCollapsed(true)}>
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-2">
          {/* New Chat entry */}
          <motion.button
            onClick={onNewThread}
            className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
              activeThreadId === null
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
            }`}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
          >
            <MessageCirclePlus className="h-3.5 w-3.5 shrink-0" />
            <span>New Chat</span>
          </motion.button>

          {threads.length === 0 && activeThreadId !== null && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Select a competitor to start analysis
            </p>
          )}
          <AnimatePresence initial={false}>
            {threads.map((t, i) => (
              <motion.div
                key={t.id}
                ref={activeThreadId === t.id ? activeRef : undefined}
                className={`group relative grid w-full grid-cols-[minmax(0,1fr)_1.75rem] items-center overflow-hidden rounded-md transition-colors ${
                  activeThreadId === t.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground glow-border"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                }`}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12, height: 0 }}
                transition={{ duration: 0.25, delay: i * 0.03 }}
                layout
              >
                <button
                  onClick={() => onSelectThread(t.id)}
                  className="min-w-0 overflow-hidden px-3 py-2 text-left text-sm"
                >
                  <div className="flex w-full min-w-0 items-center gap-2">
                     <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                     <span className="block min-w-0 max-w-full flex-1 truncate" title={t.title || t.competitor_name || "New Thread"}>
                       {t.title || t.competitor_name || "New Thread"}
                     </span>
                   </div>
                      <p className="mt-0.5 block w-full truncate pl-5 text-xs text-muted-foreground" title={t.sub_category}>
                     {t.sub_category}
                   </p>
                </button>
                <div className="flex h-full items-center justify-center pr-1">
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
            ))}
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
    </motion.div>
  );
};

export default ChatSidebar;
