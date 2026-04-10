import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Image, RefreshCw, ExternalLink, Calendar, Globe } from "lucide-react";
import MediaLightbox from "@/components/MediaLightbox";
import { getCategoryNames, getSubCategories } from "@/lib/seed-data";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem, headerVariants, fadeInUp } from "@/lib/animations";

const COMPETITORS = ["Pigment", "Planful", "OneStream", "Anaplan", "Oracle EPM Cloud", "SAP Analytics Cloud"];

interface MediaAsset {
  id: string;
  competitor_name: string;
  product_area: string;
  product_sub_area: string;
  page_url: string;
  cdn_url: string | null;
  storage_url: string;
  media_type: string;
  source_type: string;
  captured_at: string;
  last_refreshed_at: string;
  is_active: boolean;
  metadata: unknown;
}

const MediaGallery = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCompetitor, setFilterCompetitor] = useState<string>("all");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [lightboxItems, setLightboxItems] = useState<Array<{ type: "image"; src: string; alt?: string; pageUrl?: string }>>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [filterSubArea, setFilterSubArea] = useState<string>("all");

  const charterNames = getCategoryNames();
  const productAreaNames = filterArea !== "all" ? getSubCategories(filterArea) : [];

  useEffect(() => {
    fetchAssets();
  }, [filterCompetitor, filterArea, filterSubArea]);

  const fetchAssets = async () => {
    setLoading(true);
    let query = supabase
      .from("media_assets")
      .select("*")
      .eq("is_active", true)
      .order("captured_at", { ascending: false })
      .limit(200);

    if (filterCompetitor !== "all") query = query.eq("competitor_name", filterCompetitor);
    if (filterArea !== "all") query = query.eq("product_area", filterArea);
    if (filterSubArea !== "all") query = query.eq("product_sub_area", filterSubArea);

    const { data, error } = await query;
    if (error) console.error("Error fetching media assets:", error);
    else setAssets((data || []) as MediaAsset[]);
    setLoading(false);
  };

  const grouped = assets.reduce<Record<string, MediaAsset[]>>((acc, asset) => {
    const key = `${asset.competitor_name} — ${asset.product_sub_area}`;
    (acc[key] = acc[key] || []).push(asset);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <motion.div
        className="border-b border-border px-6 py-4 flex items-center justify-between"
        variants={headerVariants}
        initial="initial"
        animate="animate"
      >
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/agent")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Image className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Media Gallery</h1>
          <Badge variant="secondary" className="ml-2">{assets.length} assets</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAssets}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </motion.div>

      {/* Filters */}
      <motion.div
        className="px-6 py-4 flex gap-3 flex-wrap border-b border-border"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <Select value={filterCompetitor} onValueChange={v => { setFilterCompetitor(v); setFilterSubArea("all"); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Competitors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Competitors</SelectItem>
            {COMPETITORS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterArea} onValueChange={v => { setFilterArea(v); setFilterSubArea("all"); }}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="All Charters" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Charters</SelectItem>
            {charterNames.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterSubArea} onValueChange={setFilterSubArea} disabled={filterArea === "all"}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder={filterArea === "all" ? "Select Charter first" : "All Product Areas"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Product Areas</SelectItem>
            {productAreaNames.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Gallery */}
      <div className="px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <motion.div
            className="text-center py-20 text-muted-foreground"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <Image className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium">No media assets found</p>
            <p className="text-sm mt-1">Run a bulk media crawl to populate this gallery.</p>
          </motion.div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([groupKey, groupAssets], groupIdx) => (
              <motion.div
                key={groupKey}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: groupIdx * 0.08, duration: 0.35 }}
              >
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {groupKey}
                  <Badge variant="outline" className="ml-2 text-xs">{groupAssets.length}</Badge>
                </h2>
                <motion.div
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                >
                  {groupAssets.map((asset, assetIdx) => {
                    const openLightbox = () => {
                      const items = groupAssets.map(a => ({
                        type: "image" as const,
                        src: a.cdn_url || a.storage_url,
                        alt: `${a.competitor_name} — ${a.product_sub_area}`,
                        pageUrl: a.page_url,
                      }));
                      setLightboxItems(items);
                      setLightboxIndex(assetIdx);
                      setLightboxOpen(true);
                    };
                    return (
                      <motion.div key={asset.id} variants={staggerItem}>
                        <Card
                          className="group overflow-hidden cursor-pointer border-border hover:border-primary/50 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5"
                          onClick={openLightbox}
                        >
                          <div className="aspect-video bg-muted relative overflow-hidden">
                            <img
                              src={asset.cdn_url || asset.storage_url}
                              alt={`${asset.competitor_name} - ${asset.product_sub_area}`}
                              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (target.src !== asset.storage_url && asset.storage_url) {
                                  target.src = asset.storage_url;
                                } else {
                                  target.style.display = 'none';
                                  target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                                  const span = document.createElement('span');
                                  span.textContent = 'Image unavailable';
                                  span.className = 'text-xs text-muted-foreground';
                                  target.parentElement?.appendChild(span);
                                }
                              }}
                            />
                            <Badge
                              className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5"
                              variant={asset.source_type === "inline" ? "default" : "secondary"}
                            >
                              {asset.source_type}
                            </Badge>
                          </div>
                          <div className="p-2 space-y-1">
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                              <Globe className="h-3 w-3 shrink-0" />
                              {new URL(asset.page_url).hostname}
                            </p>
                            <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                              <Calendar className="h-3 w-3 shrink-0" />
                              {new Date(asset.captured_at).toLocaleDateString()}
                            </p>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <MediaLightbox
          isOpen={true}
          items={lightboxItems}
          currentIndex={lightboxIndex}
          onNavigate={setLightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
};

export default MediaGallery;
