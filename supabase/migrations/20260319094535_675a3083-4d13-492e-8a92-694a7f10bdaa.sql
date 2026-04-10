-- Deactivate misclassified Planful media
-- Dashboards & Visualization: images are actually Signals/Projections/AI Help, not dashboards
UPDATE media_assets SET is_active = false, metadata = metadata || '{"deactivation_reason": "misclassified - image shows different product area"}'::jsonb
WHERE competitor_name = 'Planful' AND product_sub_area IN ('Dashboards & Visualization', 'Ad-Hoc Analysis') AND is_active = true
AND id IN ('973eaab4-4265-4cfe-9e68-3d6ae4c2dd06', '77adb879-e974-4b63-9a18-c3e04f408350', '9779c031-9f36-48a0-a6a5-cdbfc58b9a01', '0f6c9d64-7364-4c87-9b4c-6f9b0c08974a');