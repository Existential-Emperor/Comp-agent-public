import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import {
  ArrowLeft, Download, CalendarIcon, Columns, Loader2, RefreshCw,
  ArrowUp, ArrowDown, Filter, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";

interface TraceRow {
  id: string;
  user_id: string;
  login_username: string;
  category: string;
  sub_category: string;
  competitor_name: string | null;
  trace_type: string;
  agent_source: string;
  status: string;
  model_used: string | null;
  overall_score: number | null;
  latency_ms: number | null;
  total_tokens: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  feedback_vote: string | null;
  feedback_comment: string | null;
  user_prompt: string | null;
  formatted_output: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  metadata: any;
}

type ColKey = keyof TraceRow | "actions" | "contract_violations" | "judge_failure_reason" | "live_crawl_triggered" | "slide_summary_status" | "gallery_filtered";

const ALL_COLUMNS: { key: ColKey; label: string }[] = [
  { key: "id", label: "Trace ID" },
  { key: "created_at", label: "Date" },
  { key: "user_id", label: "User ID" },
  { key: "login_username", label: "Login Username" },
  { key: "category", label: "Category" },
  { key: "sub_category", label: "Sub-Category" },
  { key: "competitor_name", label: "Competitor" },
  { key: "trace_type", label: "Trace Type" },
  { key: "agent_source", label: "Agent Source" },
  { key: "status", label: "Status" },
  { key: "model_used", label: "Model" },
  { key: "overall_score", label: "Score" },
  { key: "judge_failure_reason", label: "Judge Failure" },
  { key: "contract_violations", label: "Violations" },
  { key: "live_crawl_triggered", label: "Live Crawl" },
  { key: "slide_summary_status", label: "Slide Summary" },
  { key: "gallery_filtered", label: "Gallery Filtered" },
  { key: "latency_ms", label: "Latency (ms)" },
  { key: "total_tokens", label: "Tokens" },
  { key: "prompt_tokens", label: "Prompt Tokens" },
  { key: "completion_tokens", label: "Completion Tokens" },
  { key: "feedback_vote", label: "Feedback" },
  { key: "feedback_comment", label: "Feedback Comment" },
  { key: "user_prompt", label: "User Prompt" },
  { key: "formatted_output", label: "Agent's Response" },
  { key: "error_message", label: "Error" },
  { key: "actions", label: "Actions" },
];

function getCellValue(row: TraceRow, col: ColKey): any {
  if (col === "actions") return null;
  if (col === "judge_failure_reason") return row.metadata?.judge_failure_reason ?? null;
  if (col === "contract_violations") {
    const v = row.metadata?.contract_violations;
    return Array.isArray(v) ? v : null;
  }
  if (col === "live_crawl_triggered") return row.metadata?.live_crawl_triggered ?? null;
  if (col === "slide_summary_status") return row.metadata?.slide_summary_status ?? null;
  if (col === "gallery_filtered") return row.metadata?.gallery_filtered ?? null;
  return (row as any)[col];
}

const DEFAULT_VISIBLE = new Set<string>(ALL_COLUMNS.map(c => c.key));



const renderFormattedContent = (text: string) => {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const Tag = listType;
      elements.push(<Tag key={`list-${elements.length}`}>{listItems}</Tag>);
      listItems = [];
      listType = null;
    }
  };

  const formatInline = (line: string): React.ReactNode => {
    // Bold + italic
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;
    const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|_(.+?)_)/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(remaining)) !== null) {
      if (match.index > lastIndex) parts.push(remaining.slice(lastIndex, match.index));
      if (match[2]) parts.push(<strong key={key++}><em>{match[2]}</em></strong>);
      else if (match[3]) parts.push(<strong key={key++}>{match[3]}</strong>);
      else if (match[4]) parts.push(<em key={key++}>{match[4]}</em>);
      else if (match[5]) parts.push(<strong key={key++}>{match[5]}</strong>);
      else if (match[6]) parts.push(<em key={key++}>{match[6]}</em>);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < remaining.length) parts.push(remaining.slice(lastIndex));
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") { flushList(); elements.push(<br key={`br-${i}`} />); continue; }
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") { flushList(); elements.push(<hr key={`hr-${i}`} />); continue; }
    if (trimmed.startsWith("### ")) { flushList(); elements.push(<h3 key={`h-${i}`}>{formatInline(trimmed.slice(4))}</h3>); continue; }
    if (trimmed.startsWith("## ")) { flushList(); elements.push(<h2 key={`h-${i}`}>{formatInline(trimmed.slice(3))}</h2>); continue; }
    if (trimmed.startsWith("# ")) { flushList(); elements.push(<h1 key={`h-${i}`}>{formatInline(trimmed.slice(2))}</h1>); continue; }

    const ulMatch = trimmed.match(/^[-*•]\s+(.*)/);
    const olMatch = trimmed.match(/^\d+[.)]\s+(.*)/);
    if (ulMatch) {
      if (listType !== "ul") { flushList(); listType = "ul"; }
      listItems.push(<li key={`li-${i}`}>{formatInline(ulMatch[1])}</li>);
      continue;
    }
    if (olMatch) {
      if (listType !== "ol") { flushList(); listType = "ol"; }
      listItems.push(<li key={`li-${i}`}>{formatInline(olMatch[1])}</li>);
      continue;
    }

    flushList();
    elements.push(<p key={`p-${i}`}>{formatInline(trimmed)}</p>);
  }
  flushList();
  return <>{elements}</>;
};

const AgentTraces = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // Server-verified admin gate (null = checking, false = denied, true = admin)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);


  // Filters
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(DEFAULT_VISIBLE));

  // Sort
  const [sortAsc, setSortAsc] = useState(false); // false = newest first

  // Pagination
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Response viewer dialog
  const [responseDialog, setResponseDialog] = useState<{ title: string; content: string } | null>(null);

  // Resolve admin role server-side via user_roles (RLS-protected source of truth).
  useEffect(() => {
    if (!user) { setIsAdmin(null); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!cancelled) setIsAdmin(!error && !!data);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const fetchTraces = useCallback(async () => {
    if (!user || isAdmin !== true) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: "list",
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        sort_asc: String(sortAsc),
      });
      if (dateFrom) params.set("start_date", dateFrom.toISOString());
      if (dateTo) params.set("end_date", dateTo.toISOString());

      const { data, error } = await supabase.functions.invoke(`admin-traces?${params.toString()}`, {
        method: "GET",
      });
      if (error) throw error;
      setTraces(data?.traces ?? []);
      setTotal(data?.total ?? 0);
    } catch (err) {
      console.error("Failed to fetch traces:", err);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, page, dateFrom, dateTo, sortAsc]);

  // Only fetch on explicit triggers, not on tab focus/visibility changes
  const mountedRef = useRef(false);
  useEffect(() => {
    if (isAdmin !== true) return;
    if (!mountedRef.current) {
      mountedRef.current = true;
      fetchTraces();
    }
  }, [isAdmin]);

  // Re-fetch when page/sort/date filters change (but not on initial mount since above handles it)
  const filtersRef = useRef({ page, sortAsc, dateFrom, dateTo });
  useEffect(() => {
    if (isAdmin !== true) return;
    const prev = filtersRef.current;
    if (prev.page !== page || prev.sortAsc !== sortAsc || prev.dateFrom !== dateFrom || prev.dateTo !== dateTo) {
      filtersRef.current = { page, sortAsc, dateFrom, dateTo };
      fetchTraces();
    }
  }, [page, sortAsc, dateFrom, dateTo, isAdmin, fetchTraces]);


  // Multi-select filter state: key -> Set of selected values
  const [multiFilters, setMultiFilters] = useState<Record<string, Set<string>>>({});

  // Compute unique values per column from current data
  const uniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of ALL_COLUMNS) {
      if (col.key === "actions") { map[col.key] = []; continue; }
      const vals = new Set<string>();
      for (const row of traces) {
        const v = getCellValue(row, col.key);
        const display = v == null || v === "" ? "—" : Array.isArray(v) ? `${v.length} violation(s)` : String(v);
        vals.add(display);
      }
      map[col.key] = Array.from(vals).sort();
    }
    return map;
  }, [traces]);

  // Client-side filtering using multi-select filters
  const filteredTraces = useMemo(() => {
    let result = traces;
    for (const [key, selectedSet] of Object.entries(multiFilters)) {
      if (selectedSet.size === 0) continue;
      result = result.filter((row) => {
        const v = getCellValue(row, key as ColKey);
        const display = v == null || v === "" ? "—" : Array.isArray(v) ? `${v.length} violation(s)` : String(v);
        return selectedSet.has(display);
      });
    }
    return result;
  }, [traces, multiFilters]);

  const revalidateTrace = useCallback(async (traceId: string) => {
    try {
      toast.loading("Re-validating trace…", { id: `rv-${traceId}` });
      const { data, error } = await supabase.functions.invoke("validate-trace", {
        method: "POST",
        body: { trace_id: traceId },
      });
      if (error) throw error;
      toast.success(`Re-validated · score ${data?.overall_score ?? "n/a"}`, { id: `rv-${traceId}` });
      fetchTraces();
    } catch (e: any) {
      console.error("revalidateTrace error:", e);
      toast.error(`Re-validate failed: ${e?.message || "unknown error"}`, { id: `rv-${traceId}` });
    }
  }, [fetchTraces]);

  const handleDownloadCSV = () => {
    const visibleCols = ALL_COLUMNS.filter((c) => visibleColumns.has(c.key));
    const header = visibleCols.map((c) => c.label).join(",");
    const rows = filteredTraces.map((row) =>
      visibleCols
        .map((c) => {
          if (c.key === "actions") return '""';
          let val: any = getCellValue(row, c.key);
          if (c.key === "created_at" || c.key === "updated_at") {
            val = val ? format(new Date(val as string), "yyyy-MM-dd HH:mm:ss") : "";
          }
          if (Array.isArray(val)) val = val.map((x: any) => x?.rule || JSON.stringify(x)).join("; ");
          const str = val == null ? "" : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent_traces_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllColumns = () => {
    if (visibleColumns.size === ALL_COLUMNS.length) {
      setVisibleColumns(new Set(["created_at"])); // keep at least one
    } else {
      setVisibleColumns(new Set(ALL_COLUMNS.map((c) => c.key)));
    }
  };

  const formatCell = (col: ColKey, value: any, row: TraceRow) => {
    if (col === "actions") {
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 text-[10px] px-2"
          onClick={() => revalidateTrace(row.id)}
          title="Re-run response contract + judge"
        >
          <ShieldCheck className="h-3 w-3" />
          Re-validate
        </Button>
      );
    }
    if (col === "judge_failure_reason") {
      const reason = row.metadata?.judge_failure_reason;
      if (!reason) return <span className="text-muted-foreground">—</span>;
      const str = String(reason);
      return <span className="text-destructive text-xs" title={str}>{str.slice(0, 40)}{str.length > 40 ? "…" : ""}</span>;
    }
    if (col === "contract_violations") {
      const arr = Array.isArray(value) ? value : [];
      const repairLog = Array.isArray(row.metadata?.contract_repair_log) ? row.metadata.contract_repair_log : [];
      const verdict = row.metadata?.contract_verdict;
      const failedRepairs = repairLog.filter((r: any) => r?.after_excerpt === "[no deterministic repair available]");
      if (arr.length === 0 && failedRepairs.length === 0 && verdict !== "repaired_deterministic") {
        return <span className="text-muted-foreground">—</span>;
      }
      const blockCount = arr.filter((v: any) => v?.severity === "block").length;
      const tooltip = arr.map((v: any) => `[${v?.severity}] ${v?.rule}: ${v?.detail}`).join("\n");
      return (
        <div className="flex flex-col gap-1">
          {arr.length > 0 && (
            <Badge
              variant="outline"
              className={blockCount > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}
              title={tooltip}
            >
              {arr.length} {blockCount > 0 ? `(${blockCount} block)` : ""}
            </Badge>
          )}
          {failedRepairs.length > 0 && (
            <Badge
              variant="outline"
              className="bg-destructive/20 text-destructive border-destructive/40"
              title={`No deterministic repair available for: ${failedRepairs.map((r: any) => r.rule).join(", ")}`}
            >
              ⚠ Repair Failed: {failedRepairs.map((r: any) => r.rule).join(", ")}
            </Badge>
          )}
          {verdict === "repaired_deterministic" && (
            <Badge
              variant="outline"
              className="bg-secondary/30 text-secondary-foreground border-secondary"
              title="Deterministic structural / citation repair applied"
            >
              🛠 Det. Repaired
            </Badge>
          )}
        </div>
      );
    }
    if (col === "live_crawl_triggered") {
      const triggered = row.metadata?.live_crawl_triggered;
      const reason = row.metadata?.live_crawl_reason;
      const details = row.metadata?.live_crawl_details;
      if (triggered === true) {
        const tooltip = `${reason || "triggered"}\n${Array.isArray(details) ? details.map((d: any) => `${d.comp}: ${d.mediaCount ?? 0} imgs, ${d.pageScreenshotsCount ?? 0} pageshots, ${d.intelSnippetCount ?? 0} intel`).join("\n") : ""}`;
        const totalShots = Array.isArray(details) ? details.reduce((s: number, d: any) => s + (d.pageScreenshotsCount ?? 0), 0) : 0;
        return <Badge variant="outline" className="bg-accent/10 text-accent" title={tooltip}>✓ crawled{totalShots > 0 ? ` · ${totalShots}📸` : ""}</Badge>;
      }
      return <span className="text-muted-foreground">—</span>;
    }
    if (col === "slide_summary_status") {
      if (!value) return <span className="text-muted-foreground">—</span>;
      const v = String(value);
      const cls = v === "ready" ? "bg-accent/10 text-accent" : v === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
      const errText = row.metadata?.slide_summary_error;
      const tooltip = v === "failed" && errText ? `Error: ${errText}` : v;
      return <Badge variant="outline" className={cls} title={tooltip}>{v}</Badge>;
    }
    if (col === "gallery_filtered") {
      const n = typeof value === "number" ? value : 0;
      if (n === 0) return <span className="text-muted-foreground">—</span>;
      return <Badge variant="outline" className="bg-muted text-muted-foreground" title="Off-topic gallery items dropped at lookup time for narrow-intent queries">{n}</Badge>;
    }
    if (value == null || value === "") return <span className="text-muted-foreground">—</span>;
    if (col === "id") {
      const str = String(value);
      return <span className="font-mono cursor-pointer" title={str} onClick={() => { void copyToClipboard(str); }}>{str.slice(0, 8)}</span>;
    }
    if (col === "created_at" || col === "updated_at") {
      return format(new Date(value), "MMM d, yyyy HH:mm");
    }
    if (col === "status") {
      const color = value === "completed" ? "bg-accent/10 text-accent" : value === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
      return <Badge variant="outline" className={color}>{value}</Badge>;
    }
    if (col === "feedback_vote") {
      if (value === "like") return <Badge variant="outline" className="bg-accent/10 text-accent">👍</Badge>;
      if (value === "dislike") return <Badge variant="outline" className="bg-destructive/10 text-destructive">👎</Badge>;
      return value;
    }
    if (col === "overall_score") return typeof value === "number" ? value.toFixed(2) : value;
    if (col === "latency_ms" || col === "total_tokens" || col === "prompt_tokens" || col === "completion_tokens") {
      return typeof value === "number" ? value.toLocaleString() : value;
    }
    if (col === "formatted_output" || col === "user_prompt" || col === "error_message" || col === "feedback_comment") {
      const str = String(value);
      const label = col === "formatted_output" ? "Agent's Response" : col === "user_prompt" ? "User Prompt" : "Error Message";
      return (
        <button
          className="text-left text-xs text-primary underline underline-offset-2 hover:text-primary/80 max-w-[200px] truncate block"
          onClick={() => setResponseDialog({ title: label, content: str })}
        >
          {str.slice(0, 60)}{str.length > 60 ? "…" : ""}
        </button>
      );
    }
    const str = String(value);
    return str.length > 80 ? <span title={str}>{str.slice(0, 80)}…</span> : str;
  };

  const toggleFilterValue = (colKey: string, value: string) => {
    setMultiFilters((prev) => {
      const next = { ...prev };
      const s = new Set(next[colKey] || []);
      if (s.has(value)) s.delete(value);
      else s.add(value);
      if (s.size === 0) delete next[colKey];
      else next[colKey] = s;
      return next;
    });
    setPage(0);
  };

  const selectAllFilterValues = (colKey: string) => {
    const vals = uniqueValues[colKey] || [];
    setMultiFilters((prev) => {
      const next = { ...prev };
      const current = next[colKey] || new Set();
      if (current.size === vals.length) {
        delete next[colKey]; // deselect all = no filter
      } else {
        next[colKey] = new Set(vals);
      }
      return next;
    });
    setPage(0);
  };

  const activeFilterCount = Object.keys(multiFilters).length;

  // Column header filter popover — Excel-style unique value checkboxes
  const renderHeaderFilter = (col: { key: ColKey; label: string }) => {
    if (col.key === "actions") return <span>{col.label}</span>;
    const hasFilter = !!multiFilters[col.key];
    const vals = uniqueValues[col.key] || [];
    const selected = multiFilters[col.key] || new Set<string>();
    const allSelected = selected.size === vals.length;

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1 hover:text-foreground">
            <span>{col.label}</span>
            <Filter className={`h-3 w-3 ${hasFilter ? "text-primary" : "text-muted-foreground/50"}`} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <p className="text-xs font-medium text-foreground mb-2">Filter {col.label}</p>
          <ScrollArea className="max-h-56">
            <div className="space-y-1">
              {/* Select All */}
              <label className="flex items-center gap-2 text-xs cursor-pointer font-medium border-b border-border pb-1 mb-1">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => selectAllFilterValues(col.key)}
                />
                Select All
              </label>
              {vals.map((v) => (
                <label key={v} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={selected.has(v)}
                    onCheckedChange={() => toggleFilterValue(col.key, v)}
                  />
                  <span className="truncate max-w-[170px]" title={v}>{v}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
          {hasFilter && (
            <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={() => {
              setMultiFilters((prev) => { const n = { ...prev }; delete n[col.key]; return n; });
              setPage(0);
            }}>
              Clear
            </Button>
          )}
        </PopoverContent>
      </Popover>
    );
  };

  if (authLoading || isAdmin === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAdmin !== true) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background gap-4">
        <ShieldCheck className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold text-foreground">Access Denied</h1>
        <p className="text-sm text-muted-foreground">You do not have permission to view agent traces.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Back to Home</Button>
      </div>
    );
  }


  const visibleCols = ALL_COLUMNS.filter((c) => visibleColumns.has(c.key));
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allColumnsSelected = visibleColumns.size === ALL_COLUMNS.length;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Agent Traces</h1>
            <p className="text-xs text-muted-foreground">{total} total traces</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={fetchTraces} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between border-b border-border px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
        {/* Date range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, "MMM d") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">→</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateTo ? format(dateTo, "MMM d") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="pointer-events-auto" />
          </PopoverContent>
        </Popover>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
            Clear dates
          </Button>
        )}

        <div className="mx-2 h-5 w-px bg-border" />

        {/* Column visibility */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Columns className="h-3.5 w-3.5" />
              Columns ({visibleColumns.size}/{ALL_COLUMNS.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 max-h-80 overflow-y-auto" align="start">
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Show/Hide Columns</p>
              {/* Select All */}
              <label className="flex items-center gap-2 text-xs cursor-pointer font-medium border-b border-border pb-2">
                <Checkbox
                  checked={allColumnsSelected}
                  onCheckedChange={toggleAllColumns}
                />
                Select All
              </label>
              {ALL_COLUMNS.map((col) => (
                <label key={col.key} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={visibleColumns.has(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Active filters count */}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setMultiFilters({}); setPage(0); }}>
            <Filter className="h-3 w-3" />
            Clear {activeFilterCount} filter(s)
          </Button>
        )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setSortAsc((prev) => !prev)}
          >
            {sortAsc ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {sortAsc ? "Oldest First" : "Newest First"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleDownloadCSV}>
            <Download className="h-3.5 w-3.5" />
            Download CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {visibleCols.map((col) => (
                  <TableHead key={col.key} className="text-xs whitespace-nowrap">
                    {renderHeaderFilter(col)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTraces.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleCols.length} className="text-center py-10 text-muted-foreground">
                    No traces found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTraces.map((row) => (
                  <TableRow key={row.id}>
                    {visibleCols.map((col) => (
                      <TableCell key={col.key} className="text-xs max-w-[300px] truncate">
                        {formatCell(col.key, getCellValue(row, col.key), row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} ({total} traces)
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Response viewer dialog */}
      <Dialog open={!!responseDialog} onOpenChange={() => setResponseDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{responseDialog?.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-4">
            <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_em]:italic [&_hr]:my-3 [&_hr]:border-border">
              {renderFormattedContent(responseDialog?.content || "")}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgentTraces;
