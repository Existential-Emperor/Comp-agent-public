## Glossary - Adaptive Planning

### Access Rules
Determines the data that each user can edit or view. You can enable access rules across intersections of levels, accounts, and dimensions. You can assign multiple access rules to each user and each rule can have Edit, Full View, or Limited View access. By default, you can automatically assign all users access rules that match their owned levels selected from the users' profile.

There are two advantages to creating an access rule based on owned levels:
1. Efficiency and speed: assign access rules based on already created user profiles with selected-owned levels as opposed to creating separate access rules for every user.
2. Less maintenance.

### Accounts
Containers that group actuals or planning information, such as income, expense, or any business metric. They may contain raw numbers or formulas.

Workday Adaptive Planning supports the following account types:
- General ledger (GL) accounts are all Profit & Loss and Balance Sheet accounts. The hierarchy usually matches your actual general ledger accounts. GL accounts have restricted settings to follow standard accounting practices and principles.
- Custom accounts hold any kind of numerical data, such as square footage data for a Facilities allocation, or formulas that gather data from other accounts, such as total Research & Development expenses.
- Metric accounts calculate financial ratios and nonfinancial metrics, such as Gross Margin %. They must contain formulas that pull data from other accounts.
- Modeled accounts exist within modeled sheets. The data entered in a modeled sheet calculates related values that are stored in the modeled accounts.
- Cube accounts exist within cube sheets.
- Assumption accounts are global drivers. A single value is entered in the account on the top (only) level and all other levels hold this same value. Various account types are defined within an implementation.

### Attributes
Used to tag accounts, dimensions, and levels to build alternate hierarchies. You can define attributes (and individual values) to create different rollup hierarchies for your organization, such as geography versus function. Attributes are available for use in formulas, cube sheets, reports, and charts.

### Dimensions
Logical categories with a list of values, for example, Region with the values North, South, East, and West. Dimensions are used on sheets to tag and view data in different groupings, such as headcount by job status, sales by product, or expenses by project. The tagged data can also be used to drive other data.

Example: Headcount might be tagged with a dimension called Status with the values Full Time, Part Time, or Contractor. Salaries by Status could then be used to drive different benefit calculations. Dimensions can also be used to sort and filter data on reports and charts.

### Instance
Unique cloud-based training environment or live model.

### Interactive Dashboards
Provide a visual interface for you to monitor and drive business performance for data-driven decision-making, increased buy-in, and accountability throughout your organization. Enter data, add text, and visualize numbers and charts side by side while you plan and analyze real-time financial and operational data over time.

### Levels
Key organizational units of a company. For most companies, the levels represent departments, cost centers, profit centers, or geographical regions. An organization structure models the operations of your business, and the way data rolls up for planning and analysis purposes.

### Permission Set
Security permission set that determines your access to functionality within the instance. Each permission set has enabled permissions that determine the type of tasks you can perform within the model. Owned levels in a user's permission set do not control access to the data that a user can edit or view since this is based on their assigned access rules. However, there are special privileges afforded based on owned levels regardless of access rules. These include approving levels in workflow, assigning level ownership to other users, viewing, and creating journal entries on owned levels, reviewing intercompany eliminations, debits, and credits for owned levels, and receiving shared-by-level reports in the Shared Reports folder. Each of these has required permissions.

### Sheets
Interface for managers and planners to view, enter, and update data, such as actuals and budgets or forecasts. The three sheet types are standard, modeled, and cube sheets.

### Splits
Rows created in a standard sheet that provide a useful way for users to enter additional detail or supporting calculations within an account.

Example: Many factors may affect the Travel Expense account, such as trade shows, seminars, speaking engagements, or training. Departmental budget contributors may create splits within the Travel Expense account to detail each of these travel-related categories. These splits then add up to the total travel budget for the related department.

### Time
Define the start and end of a version, set the columns visible in standard sheets, create elements in reports, restrict import ranges, establish parameters for use in integration framework, and much more. The default calendar is Month > Quarter > Year, however, you can configure your organization's calendar to accommodate your business processes. Up to eight strata, or layers, of time can be defined, and calendar labels can be customized by locale/country.

### Value
Not to be confused with numeric values; dimensions and attributes have individual values.

Example: A Product dimension may include the dimension values Dish Suds, Face Wash, Hand Soap, and Laundry Detergent.

### Version
Collection of accounts, levels, and other data that represent a particular financial scenario.

Example: A version can include current-year actuals, a budget for next year, a three-year plan, and a what-if plan for evaluating the effects of a business transaction. There are two types of versions: Actuals and Plan. Actuals versions contain your actual financial results for a given period of time while Plan versions may be annual budgets, forecasts, or what-if scenarios.
