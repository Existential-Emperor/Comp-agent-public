import { supabase } from '@/integrations/supabase/client';

type FirecrawlResponse<T = any> = {
  success: boolean;
  error?: string;
  data?: T;
};

type ScrapeOptions = {
  formats?: ('markdown' | 'html' | 'links' | 'screenshot')[];
  onlyMainContent?: boolean;
  waitFor?: number;
};

export const firecrawlApi = {
  async scrape(url: string, options?: ScrapeOptions): Promise<FirecrawlResponse> {
    const { data, error } = await supabase.functions.invoke('firecrawl-scrape', {
      body: { url, options },
    });
    if (error) return { success: false, error: error.message };
    return data;
  },
};

type WebSearchOptions = {
  maxResults?: number;
  includeDomains?: string[];
};

export const tavilyApi = {
  async search(query: string, options?: WebSearchOptions): Promise<FirecrawlResponse> {
    const { data, error } = await supabase.functions.invoke('tavily-search', {
      body: { query, ...options },
    });
    if (error) return { success: false, error: error.message };
    return data;
  },
};
