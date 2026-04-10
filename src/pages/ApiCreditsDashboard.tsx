import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem, headerVariants, fadeInUp } from "@/lib/animations";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldQuestion,
  Key,
  Activity,
  AlertTriangle,
  Zap,
  TrendingDown,
  Gauge,
  Filter,
  
} from "lucide-react";

interface CreditInfo {
  totalCredits: number | null;
  usedCredits: number | null;
  remainingCredits: number | null;
  planName?: string | null;
  resetDate?: string | null;
  overageCredits?: number | null;
}

interface KeyStatus {
  envName: string;
  service: string;
  configured: boolean;
  hint: string | null;
  liveStatus: "healthy" | "exhausted" | "error" | "unknown" | "unconfigured";
  liveMessage?: string;
  credits: CreditInfo;
}

interface ApiKeyEvent {
  id: string;
  key_name: string;
  service: string;
  event_type: string;
  http_status: number | null;
  error_message: string | null;
  edge_function: string | null;
  notified: boolean;
  created_at: string;
}

interface TrendEvent {
  created_at: string;
  event_type: string;
  service: string;
  key_name: string;
}

const STATUS_CONFIG = {
  healthy: { icon: ShieldCheck, color: "text-emerald-400", bg: "border-emerald-500/30 bg-emerald-500/5", label: "Healthy", barColor: "bg-emerald-500" },
  exhausted: { icon: ShieldAlert, color: "text-amber-400", bg: "border-amber-500/30 bg-amber-500/5", label: "Exhausted", barColor: "bg-amber-500" },
  error: { icon: ShieldX, color: "text-red-400", bg: "border-red-500/30 bg-red-500/5", label: "Error", barColor: "bg-red-500" },
  unknown: { icon: ShieldQuestion, color: "text-muted-foreground", bg: "border-border bg-muted/30", label: "Unknown", barColor: "bg-muted-foreground" },
  unconfigured: { icon: ShieldQuestion, color: "text-muted-foreground", bg: "border-border bg-muted/30", label: "Not Set", barColor: "bg-muted-foreground" },
};

const SERVICE_COLORS: Record<string, string> = {
  firecrawl: "hsl(215, 90%, 58%)",
  anthropic: "hsl(280, 70%, 55%)",
  tavily: "hsl(142, 70%, 45%)",
};

const SERVICE_ICONS: Record<string, string> = {
  firecrawl: "🔥",
  anthropic: "🤖",
  tavily: "🔍",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  credits_exhausted: "hsl(38, 92%, 50%)",
  rate_limited: "hsl(0, 72%, 51%)",
  auth_error: "hsl(280, 70%, 55%)",
  unknown_error: "hsl(215, 12%, 55%)",
};

function CreditBar({ used, total, status }: { used: number | null; total: number | null; status: string }) {
  if (total == null || used == null || total <= 0) return null;
  const safeUsed = Math.max(0, used);
  const pct = Math.min(100, Math.round((safeUsed / total) * 100));
  const isHigh = pct >= 80;
  const isMid = pct >= 50 && pct < 80;

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex justify-between items-baseline text-xs">
      <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">{safeUsed.toLocaleString()}</span> / {total.toLocaleString()} used
        </span>
        <span className={`font-mono font-bold ${isHigh ? "text-red-400" : isMid ? "text-amber-400" : "text-emerald-400"}`}>
          {pct}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isHigh ? "bg-red-500" : isMid ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{(total - used).toLocaleString()} remaining</span>
        {status === "exhausted" && <span className="text-red-400 font-medium">⚠ No credits left</span>}
      </div>
    </div>
  );
}

function KeyCard({ keyStatus }: { keyStatus: KeyStatus }) {
  const cfg = STATUS_CONFIG[keyStatus.liveStatus];
  const Icon = cfg.icon;
  const { credits } = keyStatus;
  const hasCredits = credits.totalCredits != null || credits.remainingCredits != null;

  return (
    <motion.div
      className={`rounded-xl border-2 p-5 ${cfg.bg} transition-all hover:shadow-lg hover:shadow-primary/5`}
      variants={staggerItem}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl">{SERVICE_ICONS[keyStatus.service] || "🔑"}</span>
          <div className="min-w-0">
            <p className="text-sm font-mono font-semibold text-foreground truncate">
              {keyStatus.envName}
            </p>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">
              {keyStatus.service}
              {keyStatus.hint && <span className="font-mono ml-1">({keyStatus.hint})</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-xs ${cfg.color} border-current/30`}>
            <Icon className="h-3 w-3 mr-1" />
            {cfg.label}
          </Badge>
        </div>
      </div>

      {/* Credit Info */}
      {hasCredits ? (
        <CreditBar used={credits.usedCredits} total={credits.totalCredits} status={keyStatus.liveStatus} />
      ) : credits.usedCredits != null ? (
        /* Unlimited plan — show usage without a bar */
        <div className="mt-3 space-y-1.5">
          <div className="flex justify-between items-baseline text-xs">
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground text-lg">{credits.usedCredits.toLocaleString()}</span> credits used
            </span>
            <Badge variant="outline" className="text-xs text-primary border-primary/30">
              Unlimited
            </Badge>
          </div>
          <div className="h-2 w-full rounded-full bg-primary/10 overflow-hidden">
            <div className="h-full rounded-full bg-primary/40 w-full animate-pulse" />
          </div>
          {credits.planName && (
            <p className="text-xs text-muted-foreground">Plan: <span className="text-foreground font-medium capitalize">{credits.planName}</span></p>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-lg bg-muted/30 p-3 text-center">
          <p className="text-xs text-muted-foreground">
            {keyStatus.liveStatus === "unconfigured"
              ? "Key not configured"
              : keyStatus.service === "anthropic"
              ? "Credit balance not available via Anthropic API"
              : keyStatus.liveMessage || "Credit info unavailable"}
          </p>
        </div>
      )}

      {/* Bottom meta */}
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        {credits.planName && (
          <span className="text-xs text-muted-foreground">
            Plan: <span className="text-foreground font-medium capitalize">{credits.planName}</span>
          </span>
        )}
        {credits.resetDate && (
          <span className="text-xs text-muted-foreground">
            Resets: <span className="text-foreground font-medium">{new Date(credits.resetDate).toLocaleDateString()}</span>
          </span>
        )}
        {credits.overageCredits != null && credits.overageCredits > 0 && (
          <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30">
            +{credits.overageCredits.toLocaleString()} overage
          </Badge>
        )}
      </div>
    </motion.div>
  );
}

export default function ApiCreditsDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [keyStatuses, setKeyStatuses] = useState<KeyStatus[]>([]);
  const [recentEvents, setRecentEvents] = useState<ApiKeyEvent[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; credits_exhausted: number; rate_limited: number; auth_error: number; unknown_error: number }[]>([]);
  const [serviceBreakdown, setServiceBreakdown] = useState<{ name: string; value: number; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string>("all");



  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("api-credit-status");
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      setKeyStatuses(data.keyStatuses || []);
      setRecentEvents(data.recentEvents || []);
      setIsAdmin(true);




      const trendEvents: TrendEvent[] = data.trendEvents || [];
      const byDate = new Map<string, { credits_exhausted: number; rate_limited: number; auth_error: number; unknown_error: number }>();

      trendEvents.forEach((evt) => {
        const date = evt.created_at.slice(0, 10);
        if (!byDate.has(date)) {
          byDate.set(date, { credits_exhausted: 0, rate_limited: 0, auth_error: 0, unknown_error: 0 });
        }
        const day = byDate.get(date)!;
        const type = evt.event_type as keyof typeof day;
        if (type in day) day[type]++;
      });

      const sortedDates = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({ date, ...counts }));
      setTrendData(sortedDates);

      const serviceCounts = new Map<string, number>();
      trendEvents.forEach((evt) => {
        serviceCounts.set(evt.service, (serviceCounts.get(evt.service) || 0) + 1);
      });
      setServiceBreakdown(
        Array.from(serviceCounts.entries()).map(([name, value]) => ({
          name,
          value,
          color: SERVICE_COLORS[name] || "hsl(215, 12%, 55%)",
        }))
      );
    } catch (err: any) {
      if (err.message?.includes("Admin access required") || err.message?.includes("403")) {
        setIsAdmin(false);
      } else {
        setError(err.message || "Failed to load data");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) fetchData();
  }, [authLoading, user]);

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    navigate("/auth");
    return null;
  }

  if (isAdmin === false) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <ShieldX className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground">Admin privileges required to view this dashboard.</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
        </Button>
      </div>
    );
  }

  // Get unique services for the service filter
  const uniqueServices = Array.from(new Set(keyStatuses.map((k) => k.service))).sort();

  // Apply service filter
  const filteredKeys = serviceFilter === "all"
    ? keyStatuses
    : keyStatuses.filter((k) => k.service === serviceFilter);

  const configuredKeys = filteredKeys.filter((k) => k.configured);
  const healthySummary = filteredKeys.filter((k) => k.liveStatus === "healthy").length;
  const exhaustedSummary = filteredKeys.filter((k) => k.liveStatus === "exhausted").length;
  const errorSummary = filteredKeys.filter((k) => k.liveStatus === "error").length;

  // Aggregate credit totals from filtered keys
  const keysWithCredits = configuredKeys.filter((k) => k.credits.totalCredits != null && k.credits.totalCredits > 0);
  const totalCreditsAll = keysWithCredits.reduce((sum, k) => sum + (k.credits.totalCredits ?? 0), 0);
  const usedCreditsAll = keysWithCredits.reduce((sum, k) => sum + (k.credits.usedCredits ?? 0), 0);
  const remainingCreditsAll = keysWithCredits.reduce((sum, k) => sum + (k.credits.remainingCredits ?? 0), 0);
  const hasAnyCredits = keysWithCredits.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10" variants={headerVariants} initial="initial" animate="animate">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Key className="h-5 w-5 text-primary" />
                API Credits Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">Monitor key health, credit usage & trends</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </motion.div>

      <motion.div className="mx-auto max-w-7xl px-4 py-6 space-y-6" variants={fadeInUp} initial="initial" animate="animate">
        {error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="py-3 flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> {error}
            </CardContent>
          </Card>
        )}

        {/* Top Summary Row */}
        <motion.div className="grid grid-cols-2 md:grid-cols-5 gap-4" variants={staggerContainer} initial="initial" animate="animate">
          <motion.div variants={staggerItem}>
            <Card className="border-border">
              <CardContent className="py-4 text-center">
                <Gauge className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-3xl font-bold text-foreground">{configuredKeys.length}</p>
                <p className="text-xs text-muted-foreground">Keys Configured</p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={staggerItem}>
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="py-4 text-center">
                <ShieldCheck className="h-5 w-5 mx-auto mb-1 text-emerald-400" />
                <p className="text-3xl font-bold text-emerald-400">{healthySummary}</p>
                <p className="text-xs text-muted-foreground">Healthy</p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={staggerItem}>
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="py-4 text-center">
                <ShieldAlert className="h-5 w-5 mx-auto mb-1 text-amber-400" />
                <p className="text-3xl font-bold text-amber-400">{exhaustedSummary}</p>
                <p className="text-xs text-muted-foreground">Exhausted</p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={staggerItem}>
            <Card className="border-red-500/20 bg-red-500/5">
              <CardContent className="py-4 text-center">
                <ShieldX className="h-5 w-5 mx-auto mb-1 text-red-400" />
                <p className="text-3xl font-bold text-red-400">{errorSummary}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </CardContent>
            </Card>
          </motion.div>
          {hasAnyCredits && (
            <motion.div variants={staggerItem}>
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="py-4 text-center">
                  <Zap className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <p className="text-3xl font-bold text-primary">{remainingCreditsAll.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Remaining</p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>

        {/* Combined Credit Consumption & Key Breakdown Section */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Credit Consumption & Key Breakdown
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <Select value={serviceFilter} onValueChange={setServiceFilter}>
                    <SelectTrigger className="w-[160px] h-8 text-xs bg-background/50">
                      <SelectValue placeholder="All Services" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Services</SelectItem>
                      {uniqueServices.map((s) => (
                        <SelectItem key={s} value={s}>
                          <span className="flex items-center gap-1.5">
                            <span>{SERVICE_ICONS[s] || "🔑"}</span>
                            <span className="capitalize">{s}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Overall Credit Consumption Bar */}
            {hasAnyCredits && totalCreditsAll > 0 && (
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4" />
                  Overall Credit Consumption
                  {serviceFilter !== "all" && (
                    <Badge variant="outline" className="text-xs capitalize ml-1">
                      {serviceFilter} only
                    </Badge>
                  )}
                </p>
                <CreditBar used={usedCreditsAll} total={totalCreditsAll} status={remainingCreditsAll <= 0 ? "exhausted" : "healthy"} />
              </div>
            )}




            {/* Key Cards Grid */}
            <motion.div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" variants={staggerContainer} initial="initial" animate="animate">
              {filteredKeys.map((key) => (
                <KeyCard key={key.envName} keyStatus={key} />
              ))}
              {filteredKeys.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full text-center py-8">
                  No keys match the selected filters
                </p>
              )}
            </motion.div>
          </CardContent>
        </Card>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-foreground">Event Trends (30 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {trendData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No events recorded in the last 30 days</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="credits_exhausted" name="Credits Exhausted" fill="hsl(38, 92%, 50%)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="rate_limited" name="Rate Limited" fill="hsl(0, 72%, 51%)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="auth_error" name="Auth Error" fill="hsl(280, 70%, 55%)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="unknown_error" name="Unknown" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">By Service</CardTitle>
            </CardHeader>
            <CardContent>
              {serviceBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={serviceBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={{ stroke: "hsl(var(--muted-foreground))" }}
                    >
                      {serviceBreakdown.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--foreground))",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Events Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Recent Events (last 100)</CardTitle>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No events logged yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>HTTP</TableHead>
                      <TableHead>Function</TableHead>
                      <TableHead>Notified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentEvents.map((evt) => (
                      <TableRow key={evt.id}>
                        <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                          {new Date(evt.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">
                            {evt.service}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{evt.key_name}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-xs"
                            style={{
                              color: EVENT_TYPE_COLORS[evt.event_type] || undefined,
                              borderColor: EVENT_TYPE_COLORS[evt.event_type] || undefined,
                            }}
                          >
                            {evt.event_type.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{evt.http_status || "—"}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{evt.edge_function || "—"}</TableCell>
                        <TableCell>
                          {evt.notified ? (
                            <span className="text-emerald-400 text-xs">✓</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
