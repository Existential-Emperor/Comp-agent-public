
-- Fix future-dated Reddit posts: set them to 5 days before today
UPDATE news_items
SET published_at = (now() - interval '5 days')
WHERE published_at::timestamp > now() + interval '1 day'
  AND source_url ILIKE '%reddit.com%';

-- Delete items older than 365 rolling days
DELETE FROM news_items
WHERE published_at IS NOT NULL
  AND published_at::timestamp < (now() - interval '365 days');
