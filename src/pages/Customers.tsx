import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, Loader2, RefreshCw, Filter, Play, ExternalLink, Columns,
} from "lucide-react";
import { toast } from "sonner";

interface CustomerRow {
  id: string;
  customer_external_id: string;
  customer_name: string;
  customer_url: string | null;
  match_status: string;
  matched_competitors: string[];
  match_details: Record<string, { slug: string; hostname: string; liveness?: string }> | null;
}

type ColKey = "customer_name" | "customer_external_id" | "customer_url" | "matched_competitors" | "matched_url";

const ALL_COLUMNS: { key: ColKey; label: string }[] = [
  { key: "customer_name", label: "Customer Name" },
  { key: "customer_external_id", label: "Customer ID" },
  { key: "customer_url", label: "Customer URL" },
  { key: "matched_competitors", label: "Competitor part?" },
  { key: "matched_url", label: "Matched URL" },
];

const COMPETITORS = ["Board", "CCH Tagetik", "Jedox", "OneStream", "Planful", "Vena"];
// "Competitor part?" filter options: each competitor + special statuses.
const COMPETITOR_FILTER_OPTIONS = [...COMPETITORS, "Unmatched", "Pending"];

const PAGE_SIZE = 100;

// Text-search column filter: holds a local draft, commits only on Apply.
const TextColumnFilter = ({
  label, value, onApply,
}: { label: string; value: string; onApply: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (open) setDraft(value); }, [open, value]);
  const hasFilter = value.trim().length > 0;
  const apply = () => { onApply(draft); setOpen(false); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 hover:text-foreground">
          <span>{label}</span>
          <Filter className={`h-3 w-3 ${hasFilter ? "text-primary" : "text-muted-foreground/50"}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <p className="text-xs font-medium text-foreground mb-2">Filter {label}</p>
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
          placeholder={`Search ${label.toLowerCase()}…`}
          className="h-8 text-xs"
        />
        <div className="flex gap-1 mt-2">
          <Button size="sm" className="flex-1 text-xs" onClick={apply}>Apply</Button>
          {hasFilter && (
            <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => { onApply(""); setOpen(false); }}>
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Competitor checkbox-list filter: holds a local draft set, commits only on Apply.
const CompetitorColumnFilter = ({
  label, options, value, onApply,
}: { label: string; options: string[]; value: Set<string>; onApply: (next: Set<string>) => void }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(value);
  useEffect(() => { if (open) setDraft(new Set(value)); }, [open, value]);
  const hasFilter = value.size > 0;
  const allSelected = draft.size === options.length;
  const toggle = (v: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };
  const toggleAll = () => setDraft((prev) => (prev.size === options.length ? new Set() : new Set(options)));
  const apply = () => { onApply(new Set(draft)); setOpen(false); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 hover:text-foreground">
          <span>{label}</span>
          <Filter className={`h-3 w-3 ${hasFilter ? "text-primary" : "text-muted-foreground/50"}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <p className="text-xs font-medium text-foreground mb-2">Filter {label}</p>
        <ScrollArea className="max-h-56">
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer font-medium border-b border-border pb-1 mb-1">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              Select All
            </label>
            {options.map((v) => (
              <label key={v} className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={draft.has(v)} onCheckedChange={() => toggle(v)} />
                <span className="truncate max-w-[170px]" title={v}>{v}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
        <div className="flex gap-1 mt-2">
          <Button size="sm" className="flex-1 text-xs" onClick={apply}>Apply</Button>
          {hasFilter && (
            <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => { onApply(new Set()); setOpen(false); }}>
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const Customers = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [running, setRunning] = useState(false);

  // Per-column filters (server-side).
  const [nameFilter, setNameFilter] = useState("");
  const [idFilter, setIdFilter] = useState("");
  const [urlFilter, setUrlFilter] = useState("");
  // Default: show only matched competitor rows (exclude Unmatched + Pending).
  const [competitorFilter, setCompetitorFilter] = useState<Set<string>>(new Set(COMPETITORS));

  // Column visibility (matches /agent-traces show/hide UX).
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(ALL_COLUMNS.map((c) => c.key)),
  );

  // Trimmed committed text filters (only change on Apply).
  const trimmed = {
    name: nameFilter.trim(),
    id: idFilter.trim(),
    url: urlFilter.trim(),
  };


  // Stat chips.
  const [stats, setStats] = useState<{ total: number; matched: number; unmatched: number; pending: number } | null>(null);

  const buildQuery = useCallback((forCount: boolean) => {
    let q = supabase.from("customers").select(
      "id, customer_external_id, customer_name, customer_url, match_status, matched_competitors, match_details",
      forCount ? { count: "exact", head: true } : undefined,
    );
    if (trimmed.name) q = q.ilike("customer_name", `%${trimmed.name}%`);
    if (trimmed.id) q = q.ilike("customer_external_id", `%${trimmed.id}%`);
    if (trimmed.url) q = q.ilike("customer_url", `%${trimmed.url}%`);

    const comps = [...competitorFilter];
    const statusFilters: string[] = [];
    const compNames = comps.filter((c) => COMPETITORS.includes(c));
    if (comps.includes("Unmatched")) statusFilters.push("unmatched");
    if (comps.includes("Pending")) statusFilters.push("pending");

    // Combine selected competitor names (OR via overlaps) with status selections (OR).
    const orClauses: string[] = [];
    if (compNames.length) {
      const arrayLiteral = `{${compNames.map((c) => `"${c}"`).join(",")}}`;
      orClauses.push(`matched_competitors.ov.${arrayLiteral}`);
    }
    for (const s of statusFilters) orClauses.push(`match_status.eq.${s}`);
    if (orClauses.length) q = q.or(orClauses.join(","));

    return q;
  }, [trimmed.name, trimmed.id, trimmed.url, competitorFilter]);

  const fetchPage = useCallback(async (pageNum: number, replace: boolean) => {
    if (!user) return;
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const dataQuery = buildQuery(false)
        .order("customer_name", { ascending: true })
        .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1);

      if (replace) {
        const [{ data, error }, { count, error: countErr }] = await Promise.all([dataQuery, buildQuery(true)]);
        if (error) throw error;
        if (countErr) throw countErr;
        setRows((data as CustomerRow[]) ?? []);
        setTotal(count ?? 0);
      } else {
        const { data, error } = await dataQuery;
        if (error) throw error;
        setRows((prev) => [...prev, ...((data as CustomerRow[]) ?? [])]);
      }
    } catch (e: any) {
      console.error("fetchPage error:", e);
      toast.error(`Failed to load customers: ${e?.message ?? "unknown error"}`);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, buildQuery]);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    try {
      const counts = await Promise.all(
        [null, "matched", "unmatched", "pending"].map((s) => {
          let q = supabase.from("customers").select("id", { count: "exact", head: true });
          if (s) q = q.eq("match_status", s);
          return q;
        }),
      );
      setStats({
        total: counts[0].count ?? 0,
        matched: counts[1].count ?? 0,
        unmatched: counts[2].count ?? 0,
        pending: counts[3].count ?? 0,
      });
    } catch (e) {
      console.error("fetchStats error:", e);
    }
  }, [user]);

  const hasMore = rows.length < total;

  // Reset to first page whenever filters change, and load the first page.
  const mounted = useRef(false);
  useEffect(() => {
    if (!user) return;
    setPage(0);
    fetchPage(0, true);
    if (!mounted.current) { mounted.current = true; fetchStats(); }
  }, [user, buildQuery, fetchPage, fetchStats]);

  // Load subsequent pages (appended) as the user scrolls.
  useEffect(() => {
    if (page === 0) return;
    fetchPage(page, false);
  }, [page, fetchPage]);

  // Infinite-scroll sentinel.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setPage((p) => p + 1);
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore]);


  const runMatching = useCallback(async () => {
    setRunning(true);
    toast.loading("Starting tenant matching…", { id: "cust-match" });
    try {
      const { data, error } = await supabase.functions.invoke("Customer_exists", {
        method: "POST",
        body: { action: "run" },
      });
      if (error) throw error;
      if (data?.phase === "skipped") {
        toast.success("Matching is already running in the background — it will keep draining automatically.", { id: "cust-match" });
      } else if (data?.phase === "refresh" || data?.phase === "refresh_complete") {
        toast.success("Building competitor index… matching will continue automatically in the background.", { id: "cust-match" });
      } else {
        const remaining = data?.remaining ?? 0;
        toast.success(
          remaining > 0
            ? `Matching in progress · ${data?.processed ?? 0} processed, ${remaining} remaining (continuing automatically in the background)`
            : `Matching complete · ${data?.processed ?? 0} processed`,
          { id: "cust-match" },
        );
      }
      setPage(0);
      await Promise.all([fetchPage(0, true), fetchStats()]);
    } catch (e: any) {
      console.error("runMatching error:", e);
      toast.error(`Matching failed: ${e?.message ?? "unknown error"}`, { id: "cust-match" });
    } finally {
      setRunning(false);
    }
  }, [fetchPage, fetchStats]);

  const applyTextFilter = (key: ColKey, v: string) => {
    if (key === "customer_name") setNameFilter(v);
    else if (key === "customer_external_id") setIdFilter(v);
    else if (key === "customer_url") setUrlFilter(v);
    setPage(0);
  };

  const applyCompetitorFilter = (next: Set<string>) => {
    setCompetitorFilter(next);
    setPage(0);
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
      setVisibleColumns(new Set([ALL_COLUMNS[0].key])); // keep at least one
    } else {
      setVisibleColumns(new Set(ALL_COLUMNS.map((c) => c.key)));
    }
  };

  const clearAllFilters = () => {
    setNameFilter(""); setIdFilter(""); setUrlFilter(""); setCompetitorFilter(new Set()); setPage(0);
  };

  const activeFilterCount =
    (trimmed.name ? 1 : 0) + (trimmed.id ? 1 : 0) + (trimmed.url ? 1 : 0) + (competitorFilter.size ? 1 : 0);

  const renderCompetitorCell = (row: CustomerRow) => {
    if (row.match_status === "pending") {
      return <Badge variant="outline" className="bg-muted text-muted-foreground">Pending</Badge>;
    }
    if (row.match_status === "unmatched" || row.matched_competitors.length === 0) {
      return <Badge variant="outline" className="bg-muted/50 text-muted-foreground">Unmatched</Badge>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {row.matched_competitors.map((c) => (
          <Badge key={c} variant="outline" className="bg-primary/10 text-primary border-primary/30">{c}</Badge>
        ))}
      </div>
    );
  };

  const renderMatchedUrlCell = (row: CustomerRow) => {
    const entries = row.match_status === "matched" && row.match_details
      ? Object.entries(row.match_details)
      : [];
    if (entries.length === 0) {
      return <span className="font-mono text-muted-foreground">null</span>;
    }
    return (
      <div className="flex flex-col gap-1.5">
        {entries.map(([comp, d]) => (
          <div key={comp} className="flex flex-col gap-0.5">
            <a
              href={d.hostname.startsWith("http") ? d.hostname : `https://${d.hostname}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline max-w-[260px] truncate"
              title={`${comp}: ${d.hostname}`}
            >
              <span className="truncate">{d.hostname}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
            {d.liveness === "private" && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Hosted Privately</span>
            )}
          </div>
        ))}
      </div>
    );
  };

  const formatCell = (col: ColKey, row: CustomerRow) => {
    if (col === "customer_name") return <span className="font-medium">{row.customer_name}</span>;
    if (col === "customer_external_id") {
      return <span className="font-mono text-muted-foreground">{row.customer_external_id}</span>;
    }
    if (col === "customer_url") {
      return row.customer_url ? (
        <a
          href={row.customer_url.startsWith("http") ? row.customer_url : `https://${row.customer_url}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline max-w-[260px] truncate"
          title={row.customer_url}
        >
          <span className="truncate">{row.customer_url}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    }
    if (col === "matched_url") return renderMatchedUrlCell(row);
    return renderCompetitorCell(row);
  };

  // Excel-style per-column header filter popover (matches /agent-traces UX).
  const renderHeaderFilter = (col: { key: ColKey; label: string }) => {
    // Text-search columns: name / id / url (server-side ilike).
    const textConfig: Record<string, string> = {
      customer_name: nameFilter,
      customer_external_id: idFilter,
      customer_url: urlFilter,
    };

    if (col.key in textConfig) {
      return (
        <TextColumnFilter
          label={col.label}
          value={textConfig[col.key]}
          onApply={(v) => applyTextFilter(col.key, v)}
        />
      );
    }

    // Matched URL column: no filter (derived display only).
    if (col.key === "matched_url") return <span>{col.label}</span>;

    // Competitor column: fixed-option checkbox list.
    return (
      <CompetitorColumnFilter
        label={col.label}
        options={COMPETITOR_FILTER_OPTIONS}
        value={competitorFilter}
        onApply={applyCompetitorFilter}
      />
    );
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const visibleCols = ALL_COLUMNS.filter((c) => visibleColumns.has(c.key));
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
            <h1 className="text-lg font-bold text-foreground">Customers</h1>
            <p className="text-xs text-muted-foreground">
              {stats ? `${stats.total.toLocaleString()} total · ${stats.matched.toLocaleString()} matched · ${stats.unmatched.toLocaleString()} unmatched · ${stats.pending.toLocaleString()} pending` : "Tenant Radar vetting"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { setPage(0); fetchPage(0, true); fetchStats(); }} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {user?.email?.toLowerCase() === "shirish.boga@workday.com" && (
            <Button size="sm" className="gap-1.5 text-xs" onClick={runMatching} disabled={running}>
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run matching
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        {/* Column visibility */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Columns className="h-3.5 w-3.5" />
              Columns ({visibleColumns.size}/{ALL_COLUMNS.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 max-h-80 overflow-y-auto" align="start">
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Show/Hide Columns</p>
              <label className="flex items-center gap-2 text-xs cursor-pointer font-medium border-b border-border pb-2">
                <Checkbox checked={allColumnsSelected} onCheckedChange={toggleAllColumns} />
                Select All
              </label>
              {ALL_COLUMNS.map((col) => (
                <label key={col.key} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={visibleColumns.has(col.key)} onCheckedChange={() => toggleColumn(col.key)} />
                  {col.label}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Active filters count */}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearAllFilters}>
            <Filter className="h-3 w-3" />
            Clear {activeFilterCount} filter(s)
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
            <p className="text-sm">No customers found.</p>
            <p className="text-xs">Load the customer sheet, then run matching.</p>
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
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {visibleCols.map((col) => (
                    <TableCell key={col.key} className="text-xs max-w-[300px] truncate">
                      {formatCell(col.key, row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Infinite-scroll sentinel + loader */}
        {!loading && rows.length > 0 && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            {loadingMore ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading more…
              </span>
            ) : hasMore ? (
              <span>Scroll to load more</span>
            ) : (
              <span>End of results</span>
            )}
          </div>
        )}
      </div>

      {/* Footer count */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>{total.toLocaleString()} result{total === 1 ? "" : "s"}</span>
        <span>Showing {rows.length.toLocaleString()} of {total.toLocaleString()}</span>
      </div>
    </div>
  );
};


export default Customers;
