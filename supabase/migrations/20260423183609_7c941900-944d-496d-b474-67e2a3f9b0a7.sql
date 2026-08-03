DELETE FROM public.saved_items
WHERE news_item_id IN (
  SELECT id FROM public.news_items
  WHERE item_type = 'news'
    AND (
      title ILIKE '%alternative%'
      OR title ILIKE '%comparison%'
      OR title ILIKE '%implementation guide%'
      OR title ILIKE '%best practices%'
      OR title ILIKE '%[PDF]%'
      OR title ILIKE '%best fp&a%'
      OR title ILIKE '%best epm%'
    )
);

DELETE FROM public.news_items
WHERE item_type = 'news'
  AND (
    title ILIKE '%alternative%'
    OR title ILIKE '%comparison%'
    OR title ILIKE '%implementation guide%'
    OR title ILIKE '%best practices%'
    OR title ILIKE '%[PDF]%'
    OR title ILIKE '%best fp&a%'
    OR title ILIKE '%best epm%'
  );