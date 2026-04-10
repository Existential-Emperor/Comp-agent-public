
-- Delete all viewport-tagged images for Anaplan
DELETE FROM media_assets WHERE competitor_name = 'Anaplan' AND source_type = 'viewport';

-- Delete stock images from Web-Based Matrix Reporting (keep only the 2 help.anaplan.com product UI screenshots)
DELETE FROM media_assets WHERE competitor_name = 'Anaplan' 
  AND product_sub_area = 'Web-Based Matrix Reporting'
  AND storage_url NOT LIKE '%help-anaplan-com%';
