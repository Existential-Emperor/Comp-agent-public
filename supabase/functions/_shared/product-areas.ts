/**
 * Canonical product area definitions for Workday Adaptive Planning.
 * Used by discover-competitors and chat-analysis to ensure competitors
 * are validated against the correct capability description.
 */

export const PRODUCT_AREA_DEFINITIONS: Record<string, Record<string, string>> = {
  "Reporting & Analytics": {
    "Web-Based Matrix Reporting":
      "The most commonly used report type that allows users to drag and drop data elements—such as accounts, levels, time, and versions—into rows and columns to build standardized views. These reports support complex custom calculations, such as variances, subtotals, and difference calculations, and allow viewers to narrow the report's focus dynamically using interactive parameters and filters.",
    "OfficeConnect":
      "An add-in that combines Adaptive Planning data with Microsoft Excel, Word, and PowerPoint to build presentation-quality financial reports, narrative board books, and executive presentations. Users can refresh reports with a single click to instantly update financial data across documents without needing to copy and paste. It also supports write-back capabilities, enabling users to update planning data directly within Excel.",
    "Workday for Google Sheets":
      "An add-on that enables users to use data from their Planning model to create and edit ad-hoc reports directly within Google Sheets. Users can dynamically expand/collapse, keep/remove, or rearrange dimensions to analyze specific slices of data. It also integrates with Ask Workday (LA), allowing users to ask natural language questions and instantly generate charts or text summaries directly in the spreadsheet.",
    "Dashboards & Visualization":
      "Self-service, interactive visualizations that provide visibility into business performance, enable data-driven decision-making, and increase organizational accountability. Dashboards allow users to visualize numbers and charts side-by-side, drill into specific data points for root-cause analysis, and enter data directly into sheets on the dashboard to dynamically update all related charts.",
    "Ad-Hoc Analysis":
      "Analytical capabilities that allow financial analysts to quickly identify the underlying data contributing to aggregated numbers. Through features like Cell Explorer and row/column expansion, users can drill down by dimensions and attributes, uncover the root causes of variances, and dynamically view contributing details without needing to run multiple separate reports.",
  },
  "Modeling & Architecture": {
    "Elastic Hypercube Technology":
      "The underlying calculation engine platform that dynamically allocates computing resources to ensure optimized performance and scalability for your instance.",
    "Standard Sheets":
      "A basic grid interface with time periods across the columns and accounts or organizational levels down the rows. They are primarily used for standard data input and are typically utilized for balance sheets, cash flow sheets, operating expense sheets, and profit-and-loss planning.",
    "Cube Sheets":
      "Complex, multidimensional grids designed for modeling data input across a large set of nested dimensions, such as products, locations, and customers. Users can pivot the sheet to view data in multiple ways, apply dimension filters for detailed data entry, and perform granular forecasting.",
    "Modeled Sheets":
      "Record-based sheets featuring customized column fields where users enter lists of details or records—such as individual personnel, capital assets, or contracts. The details entered into each row drive automated calculations in other modeled accounts behind the scenes.",
    "Dimensions & Attributes":
      "Categorizations used to slice, filter, and add context to accounting data (like time periods, organizational levels, products, and regions) to pinpoint strong or weak business patterns. Attributes are groupings with lists of values used to tag metadata, allowing users to create alternate hierarchies and groupings for reporting purposes without needing to tag individual data entries manually.",
  },
  "Intelligent Planning": {
    "Predictive Forecaster":
      "A machine learning capability that seeds plan versions with ML-generated data to serve as a reliable, unbiased baseline for budget managers. It evaluates historical and regressor data within the platform and allows users to choose from built-in AI algorithms (such as AutoFit or ARIMA) and schedule rolling forecasts.",
    "Anomaly Detection":
      "An intelligent feature that uses machine learning algorithms to study historical patterns in actuals data and automatically detect unexpected, out-of-range data points in plans. Anomalies are visually flagged with purple borders on standard sheets, alerting planners to potential risks, hidden trends, or data entry errors.",
    "Planning Agent":
      "An intelligent, on-demand teammate within Adaptive Planning that uses a conversational interface to help users seamlessly navigate, analyze, and refine their data. Currently functioning primarily as an Analyst, the agent leverages specialized skills like Contextual Help, Data Exploration, and AI-powered Variance Analysis to quickly synthesize complex financial information, generate interactive visualizations, and pinpoint the root drivers behind material deviations. The agent's capabilities will expand to encompass Modeler, Planner, and Admin roles, empowering it to dynamically build model architectures, run target-back scenario optimizations, and automatically streamline data integrations—ultimately freeing up finance teams to focus on strategic decision-making rather than manual data gathering.",
  },
  "Integration": {
    "Data Integration":
      "A secure framework that uses data sources, loaders, and agents to automate the extraction and importing of data and metadata from various external systems, including spreadsheets, databases, and cloud sources like Workday, NetSuite, and Salesforce. Users can build automated import pipelines and schedule integration tasks to continuously synchronize data.",
    "Drill-Through":
      "A capability that allows users to click on an aggregated cell value in an Adaptive Planning sheet or report and query granular, transactional details directly from the source system. This includes drilling into Workday HCM/FINS, NetSuite, Adaptive transaction tables, or Cloud Data Warehouses, optimizing performance by not requiring those massive transaction volumes to be stored in the planning model.",
  },
  "Collaboration & Workflow": {
    "Process Tracker":
      "A collaboration tool where process administrators can create, manage, and monitor the progress of assigned planning tasks as teams work toward configured due dates. Tasks can be assigned to individuals or groups, and can link directly to the relevant sheets, reports, or dashboards assignees need to complete their work.",
    "Workflow":
      "A feature that provides a formal approval process for completed sheets and organizational levels within plan versions and actuals. It allows teams to submit their data up the hierarchy to a manager for review; once a level is approved and locked, the data becomes read-only to prevent further edits.",
    "Cell Notes & Audit Trail":
      "Collaboration and compliance features where Cell Notes allow users to add explanatory text (up to 4000 characters) to specific data intersections to explain variances, assumptions, or business context. The Audit Trail tracks and maintains a comprehensive history of user-entered data changes in sheets, data imports, and shared formula modifications.",
  },
  "Specialized Planning Modules": {
    "Workforce Planning":
      "A specialized solution that integrates tightly with Workday HCM to help organizations model headcount, skills, transfers, planned hires, and attrition. It provides a foundational model with pre-built data loaders and modeled sheets, enabling both bottom-up and top-down planning, and the ability to publish workforce actions (like creating job requisitions) directly back to HCM.",
    "Sales Planning":
      "A solution comprising capacity, quota, and territory planning to help optimize sales goals and sales team deployments. It allows sales operations to manage account segmentation, apply dimension mapping rules to automatically assign accounts to territories, and visually analyze targets using dashboards and geo-maps.",
    "Consolidation":
      "A capability designed for businesses with multiple organizations to manage complex financial close activities and GAAP or statutory reporting. It provides tools for automated intercompany eliminations between trading partners, currency translations, and adjusting journal entries.",
  },
  "Full Product": {
    "Full Product":
      "Workday Adaptive Planning is a comprehensive cloud-based enterprise planning platform for FP&A teams. It encompasses: (1) Reporting & Analytics — web-based matrix reporting, OfficeConnect for Excel/Word/PowerPoint integration, Google Sheets add-on, interactive dashboards, and ad-hoc analysis with Cell Explorer; (2) Modeling & Architecture — Elastic Hypercube Technology engine, standard/cube/modeled sheets, and multi-dimensional modeling with dimensions & attributes; (3) Intelligent Planning — ML-powered Predictive Forecaster, Anomaly Detection with visual flagging, and a conversational Planning Agent for data exploration and variance analysis; (4) Integration — automated data integration with loaders/agents for Workday HCM/FINS/NetSuite/Salesforce, and drill-through to source system transactions; (5) Collaboration & Workflow — Process Tracker for task management, formal approval workflows, and cell notes with comprehensive audit trail; (6) Specialized Planning Modules — Workforce Planning integrated with Workday HCM, Sales Planning with territory/quota/capacity planning, and Financial Consolidation with intercompany eliminations and currency translation. The platform uses a formula engine supporting calculated accounts, shared formulas, ad-hoc cell formulas, and report formulas with modifiers for time, level, dimension, and attribute slicing. Key terminology includes Accounts (GL, custom, metric, modeled, cube, assumption), Levels (organizational hierarchy), Sheets (standard, modeled, cube), Dimensions & Attributes for data categorization, Splits for detailed breakdowns, Versions for plan scenarios, and Access Rules for granular security.",
  },
};

export function getProductAreaDescription(category: string, subCategory: string): string {
  return PRODUCT_AREA_DEFINITIONS[category]?.[subCategory] || "";
}

