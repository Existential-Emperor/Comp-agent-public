/**
 * Tagged knowledge chunks for Workday Adaptive Planning.
 * Each chunk is labeled with topics/tags so retrieval can select
 * only the relevant pieces for a given analysis context.
 */

export interface KnowledgeChunk {
  id: string;
  /** Human-readable title */
  title: string;
  /** Content of the chunk */
  content: string;
  /** Tags for matching: category names, subcategory names, and topic keywords */
  tags: string[];
}

export const KNOWLEDGE_CHUNKS: KnowledgeChunk[] = [
  // ── Accounts & Data Structure ──
  {
    id: "accounts",
    title: "Account Types & Data Structure",
    content: `Workday Adaptive Planning supports multiple account types:
- **GL Accounts**: Profit & Loss and Balance Sheet accounts following standard accounting practices.
- **Custom Accounts**: Hold any numerical data (e.g., square footage for Facilities allocation) or formulas gathering data from other accounts.
- **Metric Accounts**: Calculate financial ratios and non-financial metrics (e.g., Gross Margin %). Must contain formulas pulling from other accounts.
- **Modeled Accounts**: Exist within modeled sheets; data entered in modeled sheet rows drives automated calculations stored in these accounts.
- **Cube Accounts**: Exist within cube sheets for multi-dimensional data.
- **Assumption Accounts**: Global drivers — a single value entered at the top level propagates to all other levels.`,
    tags: ["modeling", "architecture", "accounts", "standard sheets", "cube sheets", "modeled sheets", "dimensions", "full product"],
  },

  // ── Levels & Org Hierarchy ──
  {
    id: "levels",
    title: "Organizational Levels & Hierarchy",
    content: `Levels represent key organizational units (departments, cost centers, profit centers, regions). The organization structure models business operations and determines how data rolls up for planning and analysis. Access rules can be assigned based on owned levels from user profiles, providing both efficiency and reduced maintenance.`,
    tags: ["modeling", "architecture", "levels", "workflow", "collaboration", "access rules", "full product"],
  },

  // ── Sheet Types ──
  {
    id: "standard-sheets",
    title: "Standard Sheets",
    content: `Standard sheets provide a basic grid interface with time periods across columns and accounts/organizational levels down rows. Primarily used for standard data input — balance sheets, cash flow, operating expense, and P&L planning. Users can create Splits (detail rows) within accounts for granular breakdowns (e.g., Travel broken into trade shows, seminars, training). Splits add up to the total for the related department.`,
    tags: ["modeling", "architecture", "standard sheets", "data entry", "full product"],
  },
  {
    id: "cube-sheets",
    title: "Cube Sheets",
    content: `Cube sheets are complex, multidimensional grids designed for modeling data input across nested dimensions (products, locations, customers). Users can pivot the sheet to view data in multiple ways, apply dimension filters for detailed data entry, and perform granular forecasting. Cube accounts exist within cube sheets.`,
    tags: ["modeling", "architecture", "cube sheets", "dimensions", "multidimensional", "full product"],
  },
  {
    id: "modeled-sheets",
    title: "Modeled Sheets",
    content: `Modeled sheets are record-based sheets with customized column fields where users enter lists of details or records (personnel, capital assets, contracts). The details entered in each row drive automated calculations in modeled accounts. Personnel sheets support planning by individual employee with start dates, annual salary/hourly rates — calculations automatically populate appropriate time periods. Separate personnel sheets can accommodate future new hires by job position.`,
    tags: ["modeling", "architecture", "modeled sheets", "workforce planning", "personnel", "full product"],
  },

  // ── Dimensions & Attributes ──
  {
    id: "dimensions-attributes",
    title: "Dimensions & Attributes",
    content: `Dimensions are logical categories with lists of values (e.g., Region: North/South/East/West) used on sheets to tag and view data in different groupings (headcount by job status, sales by product, expenses by project). Tagged data can drive other calculations. Attributes tag accounts, dimensions, and levels to build alternate rollup hierarchies (e.g., geography vs. function) without manual tagging. Both are available in formulas, cube sheets, reports, and charts.`,
    tags: ["modeling", "architecture", "dimensions", "attributes", "reporting", "cube sheets", "full product"],
  },

  // ── Formula Engine ──
  {
    id: "formula-basics",
    title: "Formula Engine Basics",
    content: `Formulas automate calculations, build values from drivers, and create complex interrelations among accounts. Formula types include:
- **Ad-hoc cell formulas**: Entered directly in sheet cells, similar to Excel.
- **Calculated accounts**: Formulas on accounts that calculate across levels, with different formulas per version.
- **Shared formulas**: Calculated suggestions for accounts with different formulas per version and level.
- **Report formulas**: Calculate report values (e.g., totals from accounts not in the same hierarchy).
Formula Assistant is available everywhere formulas can be entered to prevent syntax errors.`,
    tags: ["modeling", "architecture", "formulas", "standard sheets", "cube sheets", "full product"],
  },
  {
    id: "formula-references",
    title: "Formula References & Modifiers",
    content: `Formula references pull values from elsewhere in the model:
- Account references: ACCT.<code> for GL/custom/metric; ACCT.<SheetCode.AccountCode> for cube/modeled.
- Assumption references: ASSUM.<code>
- Row references: ROW.<column_code> for modeled sheet columns.
Modifiers add precision in square brackets: time [time=2023], level [level=sales], dimension [product=shirts], attribute [productgroup=tops]. Multiple modifiers can be combined: [time=2023, level=Sales, product=Shirts]. Only one value per modifier type per reference.`,
    tags: ["modeling", "architecture", "formulas", "references", "modifiers", "full product"],
  },
  {
    id: "formula-functions",
    title: "Key Formula Functions",
    content: `Key functions: Div/Divf (safe division avoiding #DIV/0), Iff (conditional logic), dot notation for advanced logic (this.Month.NumberOfDays, this.Year.PositionOf for fiscal year position). ISACTUAL/ISPLAN for version-aware formulas. Linking is an alternative to formulas for moving/combining data between accounts across sheets.`,
    tags: ["modeling", "architecture", "formulas", "functions", "full product"],
  },

  // ── Reporting & Analytics ──
  {
    id: "matrix-reporting",
    title: "Web-Based Matrix Reporting",
    content: `The most commonly used report type allows drag-and-drop of data elements (accounts, levels, time, versions) into rows and columns. Supports complex custom calculations (variances, subtotals, difference calculations) and interactive parameters/filters for dynamic focus narrowing. Report formulas can calculate totals from accounts not in the same hierarchy.`,
    tags: ["reporting", "analytics", "web-based matrix reporting", "dashboards", "ad-hoc analysis", "full product"],
  },
  {
    id: "officeconnect",
    title: "OfficeConnect",
    content: `An add-in combining Adaptive Planning data with Microsoft Excel, Word, and PowerPoint for presentation-quality financial reports, narrative board books, and executive presentations. Single-click refresh updates all financial data across documents without copy-paste. Supports write-back capabilities — users can update planning data directly within Excel.`,
    tags: ["reporting", "analytics", "officeconnect", "excel", "integration", "full product"],
  },
  {
    id: "google-sheets",
    title: "Workday for Google Sheets",
    content: `Add-on enabling ad-hoc reports in Google Sheets using Planning model data. Users dynamically expand/collapse, keep/remove, or rearrange dimensions. Integrates with Ask Workday (LA) for natural language questions generating charts or text summaries directly in the spreadsheet.`,
    tags: ["reporting", "analytics", "workday for google sheets", "google sheets", "integration", "full product"],
  },
  {
    id: "dashboards",
    title: "Interactive Dashboards & Visualization",
    content: `Self-service interactive visualizations for monitoring business performance. Users visualize numbers and charts side-by-side, drill into specific data points for root-cause analysis, and enter data directly into sheets on the dashboard to dynamically update all related charts. Supports data-driven decision-making and organizational accountability.`,
    tags: ["reporting", "analytics", "dashboards", "visualization", "interactive", "full product"],
  },
  {
    id: "adhoc-analysis",
    title: "Ad-Hoc Analysis Capabilities",
    content: `Cell Explorer and row/column expansion let analysts quickly identify underlying data contributing to aggregated numbers. Users drill down by dimensions and attributes, uncover root causes of variances, and dynamically view contributing details without running multiple separate reports.`,
    tags: ["reporting", "analytics", "ad-hoc analysis", "cell explorer", "drill-down", "full product"],
  },

  // ── Intelligent Planning ──
  {
    id: "predictive-forecaster",
    title: "Predictive Forecaster",
    content: `Machine learning capability that seeds plan versions with ML-generated data as an unbiased baseline for budget managers. Evaluates historical and regressor data within the platform. Users choose from built-in AI algorithms (AutoFit, ARIMA) and can schedule rolling forecasts.`,
    tags: ["intelligent planning", "predictive forecaster", "ai", "ml", "forecasting", "full product"],
  },
  {
    id: "anomaly-detection",
    title: "Anomaly Detection",
    content: `Uses ML algorithms to study historical patterns in actuals data and automatically detect unexpected, out-of-range data points in plans. Anomalies are visually flagged with purple borders on standard sheets, alerting planners to potential risks, hidden trends, or data entry errors.`,
    tags: ["intelligent planning", "anomaly detection", "ai", "ml", "data quality", "full product"],
  },
  {
    id: "planning-agent",
    title: "Planning Agent",
    content: `An intelligent, on-demand conversational teammate within Adaptive Planning. Currently functions as an Analyst with skills: Contextual Help, Data Exploration, and AI-powered Variance Analysis. Synthesizes complex financial information, generates interactive visualizations, and pinpoints root drivers behind material deviations. Roadmap: expand to Modeler, Planner, and Admin roles for building model architectures, running target-back scenario optimizations, and automating data integrations.`,
    tags: ["intelligent planning", "planning agent", "ai", "conversational", "variance analysis", "full product"],
  },

  // ── Integration ──
  {
    id: "data-integration",
    title: "Data Integration Framework",
    content: `Secure framework using data sources, loaders, and agents to automate extraction/importing from external systems: spreadsheets, databases, and cloud sources (Workday HCM/FINS, NetSuite, Salesforce). Users build automated import pipelines and schedule integration tasks for continuous data synchronization.`,
    tags: ["integration", "data integration", "connectors", "import", "etl", "full product"],
  },
  {
    id: "drill-through",
    title: "Drill-Through Capabilities",
    content: `Click on aggregated cell values in sheets or reports to query granular transactional details from source systems (Workday HCM/FINS, NetSuite, Adaptive transaction tables, Cloud Data Warehouses). Avoids storing massive transaction volumes in the planning model, optimizing performance.`,
    tags: ["integration", "drill-through", "reporting", "source systems", "full product"],
  },

  // ── Collaboration & Workflow ──
  {
    id: "process-tracker",
    title: "Process Tracker",
    content: `Collaboration tool where process administrators create, manage, and monitor planning task progress toward due dates. Tasks can be assigned to individuals or groups and link directly to relevant sheets, reports, or dashboards.`,
    tags: ["collaboration", "workflow", "process tracker", "task management", "full product"],
  },
  {
    id: "workflow-approvals",
    title: "Workflow & Approvals",
    content: `Formal approval process for completed sheets and organizational levels within plan versions and actuals. Teams submit data up the hierarchy for manager review; approved levels become read-only (locked) to prevent further edits.`,
    tags: ["collaboration", "workflow", "approvals", "locking", "full product"],
  },
  {
    id: "cell-notes-audit",
    title: "Cell Notes & Audit Trail",
    content: `Cell Notes: explanatory text (up to 4000 characters) at specific data intersections for variances, assumptions, or business context. Audit Trail: comprehensive history of user-entered data changes in sheets, data imports, and shared formula modifications for compliance and traceability.`,
    tags: ["collaboration", "workflow", "cell notes", "audit trail", "compliance", "full product"],
  },

  // ── Specialized Planning Modules ──
  {
    id: "workforce-planning",
    title: "Workforce Planning Module",
    content: `Specialized solution tightly integrated with Workday HCM. Models headcount, skills, transfers, planned hires, and attrition. Provides foundational model with pre-built data loaders and modeled sheets. Supports both bottom-up and top-down planning, and publishing workforce actions (creating job requisitions) directly back to HCM.`,
    tags: ["specialized", "workforce planning", "hcm", "headcount", "personnel", "full product"],
  },
  {
    id: "sales-planning",
    title: "Sales Planning Module",
    content: `Capacity, quota, and territory planning to optimize sales goals and team deployments. Manages account segmentation, applies dimension mapping rules for automatic territory assignment, and provides dashboards with geo-maps for visual target analysis.`,
    tags: ["specialized", "sales planning", "territory", "quota", "full product"],
  },
  {
    id: "consolidation",
    title: "Financial Consolidation",
    content: `Designed for multi-entity organizations to manage complex financial close, GAAP/statutory reporting. Provides automated intercompany eliminations between trading partners, currency translations, and adjusting journal entries.`,
    tags: ["specialized", "consolidation", "financial close", "intercompany", "currency", "full product"],
  },

  // ── Platform Architecture ──
  {
    id: "elastic-hypercube",
    title: "Elastic Hypercube Technology",
    content: `The underlying calculation engine that dynamically allocates computing resources to ensure optimized performance and scalability. Enables large-scale multi-dimensional modeling without manual resource management.`,
    tags: ["modeling", "architecture", "elastic hypercube", "performance", "scalability", "calculation engine", "full product"],
  },

  // ── Security & Access ──
  {
    id: "access-security",
    title: "Access Rules & Security",
    content: `Access Rules determine data visibility/editability per user across intersections of levels, accounts, and dimensions. Multiple access rules can be assigned per user (Edit, Full View, Limited View). Permission Sets control functional access within the instance. Owned levels in permission sets enable special privileges: approving workflow levels, assigning level ownership, viewing/creating journal entries, reviewing intercompany eliminations.`,
    tags: ["security", "access rules", "permissions", "workflow", "collaboration", "full product"],
  },

  // ── Time & Versioning ──
  {
    id: "time-versioning",
    title: "Time Strata & Versions",
    content: `Time defines version start/end, sheet columns, report elements, import ranges, and integration parameters. Default calendar: Month > Quarter > Year, configurable with up to 8 strata (layers). Calendar labels can be customized by locale/country. Versions represent plan scenarios (budget, forecast, actuals) with independent formulas and data.`,
    tags: ["modeling", "architecture", "time", "versions", "calendar", "planning", "full product"],
  },
];
