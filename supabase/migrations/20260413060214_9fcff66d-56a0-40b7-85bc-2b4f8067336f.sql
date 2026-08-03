DELETE FROM public.news_items 
WHERE item_type = 'community' 
AND source_url NOT ILIKE '%reddit.com%' 
AND source_url NOT ILIKE '%linkedin.com%' 
AND source_url NOT ILIKE '%twitter.com%' 
AND source_url NOT ILIKE '%x.com%' 
AND source_url NOT ILIKE '%youtube.com%' 
AND source_url NOT ILIKE '%facebook.com%' 
AND source_url NOT ILIKE '%quora.com%';