export interface CategoryData {
  name: string;
  subCategories: {
    name: string;
    competitors: { name: string; website: string; description: string }[];
  }[];
}

export const categories: CategoryData[] = [
  {
    name: "Reporting & Analytics",
    subCategories: [
      {
        name: "Web-Based Matrix Reporting",
        competitors: [
          { name: "Anaplan", website: "https://www.anaplan.com", description: "Connected planning platform with grid-based reporting" },
          { name: "Pigment", website: "https://www.gopigment.com", description: "Business planning platform with real-time reporting" },
          { name: "Board International", website: "https://www.board.com", description: "Decision-making platform with interactive dashboards" },
        ],
      },
      {
        name: "OfficeConnect",
        competitors: [
          { name: "Vena Solutions", website: "https://www.venasolutions.com", description: "Excel-native complete planning platform" },
          { name: "Jedox", website: "https://www.jedox.com", description: "Enterprise performance management with Excel integration" },
          { name: "Planful", website: "https://planful.com", description: "Financial planning with Office integration" },
        ],
      },
      {
        name: "Workday for Google Sheets",
        competitors: [
          { name: "Coefficient", website: "https://coefficient.io", description: "Live data connector for Google Sheets" },
          { name: "Supermetrics", website: "https://supermetrics.com", description: "Data integration for spreadsheets and BI tools" },
        ],
      },
      {
        name: "Dashboards & Visualization",
        competitors: [
          { name: "Tableau", website: "https://www.tableau.com", description: "Visual analytics and BI platform" },
          { name: "Power BI", website: "https://powerbi.microsoft.com", description: "Microsoft business intelligence suite" },
          { name: "Looker", website: "https://looker.com", description: "Google Cloud BI and analytics platform" },
        ],
      },
      {
        name: "Ad-Hoc Analysis",
        competitors: [
          { name: "ThoughtSpot", website: "https://www.thoughtspot.com", description: "AI-powered search and analytics" },
          { name: "Sigma Computing", website: "https://www.sigmacomputing.com", description: "Cloud-native analytics with spreadsheet interface" },
        ],
      },
    ],
  },
  {
    name: "Modeling & Architecture",
    subCategories: [
      {
        name: "Elastic Hypercube Technology",
        competitors: [
          { name: "Anaplan", website: "https://www.anaplan.com", description: "Hyperblock modeling engine" },
          { name: "Oracle PBCS", website: "https://www.oracle.com", description: "Oracle Planning and Budgeting Cloud with Essbase" },
          { name: "IBM Planning Analytics", website: "https://www.ibm.com", description: "TM1-powered planning with OLAP cubes" },
        ],
      },
      {
        name: "Standard Sheets",
        competitors: [
          { name: "Vena Solutions", website: "https://www.venasolutions.com", description: "Excel-native planning with structured templates" },
          { name: "Planful", website: "https://planful.com", description: "Structured planning templates" },
        ],
      },
      {
        name: "Cube Sheets",
        competitors: [
          { name: "Anaplan", website: "https://www.anaplan.com", description: "Multi-dimensional module views" },
          { name: "Pigment", website: "https://www.gopigment.com", description: "Multi-dimensional data blocks" },
        ],
      },
      {
        name: "Modeled Sheets",
        competitors: [
          { name: "Anaplan", website: "https://www.anaplan.com", description: "Connected model-driven planning" },
          { name: "Causal", website: "https://www.causal.app", description: "Visual formula-based modeling" },
        ],
      },
      {
        name: "Dimensions & Attributes",
        competitors: [
          { name: "Anaplan", website: "https://www.anaplan.com", description: "List-based dimensional modeling" },
          { name: "OneStream", website: "https://www.onestream.com", description: "Extensible dimensionality" },
          { name: "Oracle PBCS", website: "https://www.oracle.com", description: "Essbase dimension management" },
        ],
      },
    ],
  },
  {
    name: "Intelligent Planning",
    subCategories: [
      {
        name: "Predictive Forecaster",
        competitors: [
          { name: "Anaplan PlanIQ", website: "https://www.anaplan.com", description: "AI-powered forecasting" },
          { name: "Pigment", website: "https://www.gopigment.com", description: "AI-assisted scenario planning" },
          { name: "DataRobot", website: "https://www.datarobot.com", description: "Enterprise AI platform for forecasting" },
        ],
      },
      {
        name: "Anomaly Detection",
        competitors: [
          { name: "Anodot", website: "https://www.anodot.com", description: "Autonomous business monitoring and anomaly detection" },
          { name: "ThoughtSpot", website: "https://www.thoughtspot.com", description: "AI-powered analytics with anomaly insights" },
        ],
      },
      {
        name: "Planning Agent",
        competitors: [
          { name: "Anaplan", website: "https://www.anaplan.com", description: "AI-powered conversational planning assistant within Anaplan platform" },
          { name: "Microsoft Copilot for Finance", website: "https://www.microsoft.com", description: "AI assistant for financial workflows in Microsoft 365" },
          { name: "Oracle AI Agent", website: "https://www.oracle.com", description: "AI-driven planning agent within Oracle Fusion Cloud EPM" },
        ],
      },
    ],
  },
  {
    name: "Integration",
    subCategories: [
      {
        name: "Data Integration",
        competitors: [
          { name: "Boomi", website: "https://boomi.com", description: "Integration platform as a service" },
          { name: "MuleSoft", website: "https://www.mulesoft.com", description: "API-led connectivity platform" },
          { name: "Fivetran", website: "https://www.fivetran.com", description: "Automated data integration" },
        ],
      },
      {
        name: "Drill-Through",
        competitors: [
          { name: "Anaplan", website: "https://www.anaplan.com", description: "Cross-model drill-through navigation" },
          { name: "OneStream", website: "https://www.onestream.com", description: "Drill-through to transactional detail" },
          { name: "Oracle PBCS", website: "https://www.oracle.com", description: "Smart View drill-through capabilities" },
        ],
      },
    ],
  },
  {
    name: "Collaboration & Workflow",
    subCategories: [
      {
        name: "Process Tracker",
        competitors: [
          { name: "Anaplan", website: "https://www.anaplan.com", description: "Planning process management" },
          { name: "Planful", website: "https://planful.com", description: "Close and planning task management" },
          { name: "BlackLine", website: "https://www.blackline.com", description: "Financial close task management" },
        ],
      },
      {
        name: "Workflow",
        competitors: [
          { name: "OneStream", website: "https://www.onestream.com", description: "Built-in workflow and approvals" },
          { name: "Workiva", website: "https://www.workiva.com", description: "Connected workflow and reporting" },
        ],
      },
      {
        name: "Cell Notes & Audit Trail",
        competitors: [
          { name: "Anaplan", website: "https://www.anaplan.com", description: "Cell-level commenting and audit history" },
          { name: "Vena Solutions", website: "https://www.venasolutions.com", description: "Excel-based audit trail and annotations" },
        ],
      },
    ],
  },
  {
    name: "Specialized Planning Modules",
    subCategories: [
      {
        name: "Workforce Planning",
        competitors: [
          { name: "Visier", website: "https://www.visier.com", description: "People analytics and workforce planning" },
          { name: "Orgvue", website: "https://www.orgvue.com", description: "Organizational design and planning" },
          { name: "Anaplan", website: "https://www.anaplan.com", description: "Connected workforce planning" },
        ],
      },
      {
        name: "Sales Planning",
        competitors: [
          { name: "Anaplan", website: "https://www.anaplan.com", description: "Sales performance and territory planning" },
          { name: "Xactly", website: "https://www.xactly.com", description: "Sales planning and incentive compensation" },
          { name: "Varicent", website: "https://www.varicent.com", description: "Sales performance management" },
        ],
      },
      {
        name: "Consolidation",
        competitors: [
          { name: "OneStream", website: "https://www.onestream.com", description: "Unified financial consolidation" },
          { name: "Oracle FCCS", website: "https://www.oracle.com", description: "Oracle Financial Consolidation and Close" },
          { name: "SAP BPC", website: "https://www.sap.com", description: "SAP Business Planning and Consolidation" },
        ],
      },
    ],
  },
  {
    name: "Full Product",
    subCategories: [
      {
        name: "Full Product",
        competitors: [
          { name: "Anaplan", website: "https://www.anaplan.com", description: "Connected planning platform for finance, supply chain, and workforce" },
          { name: "Oracle EPM Cloud", website: "https://www.oracle.com", description: "Enterprise performance management suite" },
          { name: "SAP Analytics Cloud", website: "https://www.sap.com", description: "Integrated planning, BI, and predictive analytics" },
          { name: "OneStream", website: "https://www.onestream.com", description: "Unified CPM platform for planning, consolidation, and reporting" },
          { name: "Planful", website: "https://planful.com", description: "Financial planning and analysis platform" },
        ],
      },
    ],
  },
];

export const getCategoryNames = () => {
  const names = categories.map((c) => c.name);
  // Ensure "Full Product" is always first
  const fpIndex = names.indexOf("Full Product");
  if (fpIndex > 0) {
    names.splice(fpIndex, 1);
    names.unshift("Full Product");
  }
  return names;
};

export const getSubCategories = (categoryName: string) => {
  const cat = categories.find((c) => c.name === categoryName);
  return cat?.subCategories.map((sc) => sc.name) ?? [];
};

export const getSeedCompetitors = (categoryName: string, subCategoryName: string) => {
  const cat = categories.find((c) => c.name === categoryName);
  const sub = cat?.subCategories.find((sc) => sc.name === subCategoryName);
  return sub?.competitors ?? [];
};
