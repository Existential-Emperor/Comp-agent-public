import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { getCategoryNames, getSubCategories, getSeedCompetitors } from "@/lib/seed-data";

interface FilterBarProps {
  category: string;
  subCategory: string;
  competitor: string;
  onCategoryChange: (v: string) => void;
  onSubCategoryChange: (v: string) => void;
  onCompetitorChange: (v: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

const FilterBar = ({
  category,
  subCategory,
  competitor,
  onCategoryChange,
  onSubCategoryChange,
  onCompetitorChange,
  onRefresh,
  refreshing,
}: FilterBarProps) => {
  const categoryNames = getCategoryNames();
  const subCategoryNames = category ? getSubCategories(category) : [];
  const competitors = category && subCategory ? getSeedCompetitors(category, subCategory) : [];

  return (
    <div className="flex items-center gap-3 border-b border-border bg-card/60 backdrop-blur px-4 py-3">
      <Select value={category} onValueChange={onCategoryChange}>
        <SelectTrigger className="w-[220px] bg-background/50">
          <SelectValue placeholder="Select Category" />
        </SelectTrigger>
        <SelectContent>
          {categoryNames.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={subCategory} onValueChange={onSubCategoryChange} disabled={!category}>
        <SelectTrigger className="w-[240px] bg-background/50">
          <SelectValue placeholder="Select Sub-Category" />
        </SelectTrigger>
        <SelectContent>
          {subCategoryNames.map((sc) => (
            <SelectItem key={sc} value={sc}>{sc}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={competitor} onValueChange={onCompetitorChange} disabled={!subCategory}>
        <SelectTrigger className="w-[200px] bg-background/50">
          <SelectValue placeholder="Select Competitor" />
        </SelectTrigger>
        <SelectContent>
          {competitors.map((comp) => (
            <SelectItem key={comp.name} value={comp.name}>{comp.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={!subCategory || refreshing}
        className="ml-auto gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        Refresh Competition
      </Button>
    </div>
  );
};

export default FilterBar;
