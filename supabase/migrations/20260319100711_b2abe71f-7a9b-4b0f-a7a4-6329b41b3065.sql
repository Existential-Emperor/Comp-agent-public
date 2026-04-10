INSERT INTO media_assets (competitor_name, product_area, product_sub_area, page_url, storage_url, cdn_url, media_type, source_type, is_active, metadata)
VALUES
-- Ad-Hoc Analysis (Data Analyzer)
('SAP Analytics Cloud', 'Reporting & Analytics', 'Ad-Hoc Analysis',
 'https://community.sap.com/t5/technology-blog-posts-by-sap/new-data-exploration-experience-in-sap-analytics-cloud/ba-p/13509768',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/09/Image1.jpg',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/09/Image1.jpg',
 'image', 'inline', true, '{"crawl_source": "targeted-crawl", "source_blog": "SAP Community - Data Analyzer Home"}'::jsonb),

('SAP Analytics Cloud', 'Reporting & Analytics', 'Ad-Hoc Analysis',
 'https://community.sap.com/t5/technology-blog-posts-by-sap/new-data-exploration-experience-in-sap-analytics-cloud/ba-p/13509768',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/09/Image3.jpg',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/09/Image3.jpg',
 'image', 'inline', true, '{"crawl_source": "targeted-crawl", "source_blog": "SAP Community - Data Analyzer Insights Table"}'::jsonb),

('SAP Analytics Cloud', 'Reporting & Analytics', 'Ad-Hoc Analysis',
 'https://community.sap.com/t5/technology-blog-posts-by-sap/new-data-exploration-experience-in-sap-analytics-cloud/ba-p/13509768',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/09/Image4.jpg',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/09/Image4.jpg',
 'image', 'inline', true, '{"crawl_source": "targeted-crawl", "source_blog": "SAP Community - Data Analyzer from Story"}'::jsonb),

-- Consolidation (Intercompany Elimination)
('SAP Analytics Cloud', 'Specialized Planning Modules', 'Consolidation',
 'https://community.sap.com/t5/technology-blog-posts-by-sap/intercompany-elimination-with-sap-analytics-cloud/ba-p/13532861',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/12/StoryReport01BeforeEliminiation.png',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/12/StoryReport01BeforeEliminiation.png',
 'image', 'inline', true, '{"crawl_source": "targeted-crawl", "source_blog": "SAP Community - IC Elimination Before"}'::jsonb),

('SAP Analytics Cloud', 'Specialized Planning Modules', 'Consolidation',
 'https://community.sap.com/t5/technology-blog-posts-by-sap/intercompany-elimination-with-sap-analytics-cloud/ba-p/13532861',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/12/StoryReport04AfterEliminiation.png',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/12/StoryReport04AfterEliminiation.png',
 'image', 'inline', true, '{"crawl_source": "targeted-crawl", "source_blog": "SAP Community - IC Elimination After"}'::jsonb),

('SAP Analytics Cloud', 'Specialized Planning Modules', 'Consolidation',
 'https://community.sap.com/t5/technology-blog-posts-by-sap/intercompany-elimination-with-sap-analytics-cloud/ba-p/13532861',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/12/DataModel.png',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/12/DataModel.png',
 'image', 'inline', true, '{"crawl_source": "targeted-crawl", "source_blog": "SAP Community - Consolidation Data Model"}'::jsonb),

('SAP Analytics Cloud', 'Specialized Planning Modules', 'Consolidation',
 'https://community.sap.com/t5/technology-blog-posts-by-sap/intercompany-elimination-with-sap-analytics-cloud/ba-p/13532861',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/12/ELIMMEMBER.png',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/12/ELIMMEMBER.png',
 'image', 'inline', true, '{"crawl_source": "targeted-crawl", "source_blog": "SAP Community - ELIMMEMBER Hierarchy"}'::jsonb),

('SAP Analytics Cloud', 'Specialized Planning Modules', 'Consolidation',
 'https://community.sap.com/t5/technology-blog-posts-by-sap/intercompany-elimination-with-sap-analytics-cloud/ba-p/13532861',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/12/DataAction_Visual01.png',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/12/DataAction_Visual01.png',
 'image', 'inline', true, '{"crawl_source": "targeted-crawl", "source_blog": "SAP Community - DataAction Visual"}'::jsonb),

-- Drill-Through (reuse Data Analyzer open-from-story image)
('SAP Analytics Cloud', 'Integration', 'Drill-Through',
 'https://community.sap.com/t5/technology-blog-posts-by-sap/new-data-exploration-experience-in-sap-analytics-cloud/ba-p/13509768',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/09/Open-Data-Analyzer-From-Explorer-View-1.jpg',
 'https://community.sap.com/legacyfs/online/storage/blog_attachments/2021/09/Open-Data-Analyzer-From-Explorer-View-1.jpg',
 'image', 'inline', true, '{"crawl_source": "targeted-crawl", "source_blog": "SAP Community - Open Analyzer from Explorer"}'::jsonb)

ON CONFLICT DO NOTHING;