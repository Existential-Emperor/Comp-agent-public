import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, ShieldX, UploadCloud, FileText, Trash2, Loader2, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const ACCEPTED = ".pdf,.ppt,.pptx,.xlsx,.xls,.csv,.md,.doc,.docx";
// In-isolate parsing (incl. OCR rasterization) is bounded by the edge runtime's
// 256MB memory limit, so the parser caps at 40MB — match it here.
const MAX_BYTES = 40 * 1024 * 1024; // 40 MB

interface RoadmapRow {
  id: string;
  uploaded_by: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  storage_path: string;
  chunk_count: number;
  created_at: string;
}

type UploadPhase = "idle" | "uploading" | "parsing" | "complete" | "failed";

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Upload() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<RoadmapRow[]>([]);
  const [uploaders, setUploaders] = useState<Record<string, string>>({});
  const [listLoading, setListLoading] = useState(true);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [phaseMsg, setPhaseMsg] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    const { data, error } = await supabase
      .from("roadmap_kb")
      .select("id, uploaded_by, original_filename, mime_type, file_size_bytes, storage_path, chunk_count, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load roadmap documents", { description: error.message });
      setListLoading(false);
      return;
    }
    const list = (data ?? []) as RoadmapRow[];
    setRows(list);

    const ids = [...new Set(list.map((r) => r.uploaded_by))];
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, email").in("user_id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.user_id] = p.email; });
      setUploaders(map);
    }
    setListLoading(false);
  }, []);

  useEffect(() => {
    const check = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "admin").maybeSingle();
      const admin = !!data;
      setIsAdmin(admin);
      if (admin) loadList();
    };
    if (!authLoading && user) check();
  }, [authLoading, user, loadList]);

  const handleFile = async (file: File) => {
    if (!user) return;
    if (file.size > MAX_BYTES) {
      toast.error("File too large", { description: `Maximum size is 40 MB. This file is ${formatBytes(file.size)}.` });
      return;
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${user.id}/${Date.now()}-${safeName}`;

    // 1) Upload original to private storage.
    setPhase("uploading");
    setPhaseMsg("Uploading…");
    const { error: upErr } = await supabase.storage
      .from("roadmap-uploads")
      .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upErr) {
      setPhase("failed");
      setPhaseMsg(`Failed: ${upErr.message}`);
      toast.error("Upload failed", { description: upErr.message });
      return;
    }

    // 2) Parse via edge function.
    setPhase("parsing");
    setPhaseMsg("Parsing…");
    const { data: parsed, error: fnErr } = await supabase.functions.invoke("parse-roadmap-document", {
      body: { storage_path: storagePath, mime_type: file.type, original_filename: file.name },
    });

    const parseError = fnErr?.message || parsed?.error;
    if (parseError || !parsed?.parsed_content) {
      // Clean up the orphaned storage object so the user can retry cleanly.
      await supabase.storage.from("roadmap-uploads").remove([storagePath]);
      const detail = parsed?.details || fnErr?.message || "Could not parse file.";
      setPhase("failed");
      setPhaseMsg(`Failed: ${detail}`);
      toast.error("Parsing failed", { description: detail });
      return;
    }

    // 3) Insert row with parsed content.
    const { error: insErr } = await supabase.from("roadmap_kb").insert({
      uploaded_by: user.id,
      original_filename: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size_bytes: file.size,
      storage_path: storagePath,
      parsed_content: parsed.parsed_content,
      parsed_content_format: parsed.parsed_content_format || "markdown",
      chunk_count: parsed.chunk_count ?? 0,
      metadata: parsed.metadata ?? {},
    });
    if (insErr) {
      await supabase.storage.from("roadmap-uploads").remove([storagePath]);
      setPhase("failed");
      setPhaseMsg(`Failed: ${insErr.message}`);
      toast.error("Save failed", { description: insErr.message });
      return;
    }

    setPhase("complete");
    setPhaseMsg("Complete");
    toast.success("Roadmap document added", { description: file.name });
    if (fileInputRef.current) fileInputRef.current.value = "";
    loadList();
    setTimeout(() => { setPhase("idle"); setPhaseMsg(""); }, 2500);
  };

  const handleDelete = async (row: RoadmapRow) => {
    if (!window.confirm(`Delete "${row.original_filename}"? This removes it from the roadmap knowledge base for everyone.`)) return;
    setDeletingId(row.id);
    // Storage first: if this fails we abort before touching the row, so no orphan.
    const { error: stErr } = await supabase.storage.from("roadmap-uploads").remove([row.storage_path]);
    if (stErr) {
      setDeletingId(null);
      toast.error("Delete failed (storage)", { description: `${stErr.message}. Nothing was removed.` });
      return;
    }
    const { error: rowErr } = await supabase.from("roadmap_kb").delete().eq("id", row.id);
    if (rowErr) {
      setDeletingId(null);
      toast.error("Delete partially failed", { description: `File removed but record delete failed: ${rowErr.message}` });
      return;
    }
    setDeletingId(null);
    toast.success("Document deleted");
    loadList();
  };

  if (authLoading || isAdmin === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) { navigate("/auth"); return null; }

  if (isAdmin === false) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <ShieldX className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground">Admin privileges required to manage the roadmap knowledge base.</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
        </Button>
      </div>
    );
  }

  const busy = phase === "uploading" || phase === "parsing";

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <motion.div
        className="mx-auto max-w-4xl space-y-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Roadmap Knowledge Base</h1>
            <p className="text-sm text-muted-foreground">Shared library of future / unreleased product documents. The agent tags any roadmap-derived answer with “(roadmap)”.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Home
          </Button>
        </div>

        <Card className="border-border/60 bg-card/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UploadCloud className="h-5 w-5 text-primary" /> Upload a document
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              Accepted: PDF, PPT/PPTX, XLS/XLSX, CSV, MD, DOC/DOCX · max 40 MB. Scanned/image-only PDFs are OCR'd in-boundary via Lovable AI.
            </p>
            {phase !== "idle" && (
              <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                phase === "failed" ? "border-destructive/40 bg-destructive/10 text-destructive"
                : phase === "complete" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-primary/40 bg-primary/10 text-primary"}`}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {phase === "complete" && <CheckCircle2 className="h-4 w-4" />}
                {phase === "failed" && <AlertTriangle className="h-4 w-4" />}
                <span>{phaseMsg}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" /> Roadmap documents
              <Badge variant="outline" className="ml-1">{rows.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {listLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No roadmap documents yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Uploaded by</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[240px] truncate font-medium">{r.original_filename}</TableCell>
                      <TableCell className="text-muted-foreground">{uploaders[r.uploaded_by] ?? `${r.uploaded_by.slice(0, 8)}…`}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatBytes(r.file_size_bytes)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="icon"
                          disabled={deletingId === r.id}
                          onClick={() => handleDelete(r)}
                          aria-label={`Delete ${r.original_filename}`}
                        >
                          {deletingId === r.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Trash2 className="h-4 w-4 text-destructive" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
