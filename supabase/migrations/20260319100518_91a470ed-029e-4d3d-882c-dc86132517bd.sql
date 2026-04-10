UPDATE media_assets SET is_active = false, metadata = metadata || '{"deactivation_reason": "blank image - persistence failure"}'::jsonb
WHERE competitor_name = 'SAP Analytics Cloud' AND product_sub_area = 'Web-Based Matrix Reporting' AND is_active = true
AND id IN ('e8124ed3-cbd6-49ed-983b-d9b4ea2bb493', '3f54e2fc-e11c-42f8-b717-8fa5277b6c6f');