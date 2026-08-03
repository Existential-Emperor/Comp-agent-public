# Document parsed from: Adaptive-Planning-Whats-New.pdf

## Page 1

# Release Notes

Product Summary

April 16, 2026

![Workday logo](page_1_image_1_v2.jpg)

## Page 2

<table>
    <tr>
        <th>Contents</th>
        <th>ii</th>
    </tr>
</table>
## Contents

### Releases

- Release Notes 7
- 2026R1 Release Notes 7
    - 2026R1 Service Pack Release Notes 7
    - Configurable Workflows 8
    - Multi-Select Levels and Dimensions on Modeled Sheets 10
    - Access Rules on Data Entry Columns in Modeled Sheets 11
    - Predictive Forecaster Scalability and Usability 14
    - Anomaly Detection for Sheets in Dashboards 15
    - New Workday Adaptive Planning Logos 15
    - Adaptive Planning Notifications 16
    - Planning Agent 17
    - Planning Agent: Data Exploration 18
    - Adaptive Planning Hubs 19
    - Chart Visualization in Dashboards 21
    - Pattern Reports User Experience 22
    - Transaction Reporting Performance 22
    - View Last Updated Date for Web Reports 22
    - Calculation Error Messages 23
    - Accounts with a Level/Dimension Rollup of Text 23
    - Improved Performance for Actuals Updates 24
    - 2026R1 Planning for HCM and Financials 25
- 2025R2 Release Notes 29
    - 2025R2 Service Pack Release Notes 29
    - Multicoordinate Support for Cell Explorer 29
    - Version-Specific Overrides for Linked Accounts 30
    - Translated Currencies for Actuals Versions 32
    - Machine Learning Predictive Forecaster 33
    - Ask Workday for Adaptive Planning 35
    - Planning Agent: Data Exploration 36
    - Tasks and Task Runs in Adaptive Planning Integration 37
    - Cloud Data Connect Pipeline Drill Through 38
    - Pipeline Task Scheduling 39
    - Collaborate within Adaptive Planning 40
    - Workday Adaptive Planning and NetSuite Integration 41
    - Adaptive Planning Notifications 41
    - Cube Governance: Account Property Update and Merge Sheet Limit 42
    - Sheets Performance Evaluator 43
    - customReportValues API 44
    - Adaptive Planning Hubs 44
    - Workday for Google Sheets 46
    - 2025R2 Planning for HCM and Financials Release Notes 47
- 2025R1 Release Notes 56
    - 2025R1 Service Pack Release Notes 56
    - Adaptive Planning Notifications 57
    - Introducing Shared Scenarios 57
    - Forecast Explanations for Predictive Forecaster 60
    - LightGBM Algorithm Supports Lever Sheets for Predictive Forecaster 61
    - Machine Learning Predictive Forecaster 62

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 3

# Modeled Sheet Data Validations

63

# Reset to Default View on Sheets

63

# Report Parameter Behavior

63

# Reporting in Billions

64

# Report Bursting Through Scheduled Attachments

65

# Add Reports on Dashboards

66

# Live Reports as Announcements

67

# Matrix Reports with Version Offset

67

# Chart Improvements in Dashboards

68

# Perspective Folders in Dashboards

68

# User Administration User Experience

68

# Bring Your Own Key (BYOK) for Adaptive Planning

69

# Snowflake Support for Cloud Data Connect and Design Integrations

70

# Incorta Connector to Adaptive Planning

70

# Workday Adaptive Planning Data Agent Upgrade

71

# Integration Tasks JSON Formatted REST API

72

# Rollup Mode for Custom Expansions in customReportValues API

72

# Planning Agent: Contextual Help

73

# Automatic Transition to Replace Mode for Planning Data Loaders

74

# Workday Assistant for Adaptive Planning

75

# 2025R1 Planning for HCM and Financials Release Notes

76

# 2024R2 Release Notes

89

# 2024R2 Service Pack Release Notes

89

# Adaptive Planning Documentation

90

# Changes to User Interface

91

# Version-Specific Overrides for Linked Accounts

91

# Archived Versions for Data Freeze

93

# Machine Learning Predictive Forecaster

95

# Long-Running Processes in the Planning Center

99

# Codes for Calendars and Modeled Sheet Display Columns

100

# Translated Currencies for Actuals Versions

101

# Create Associations with Attributes

102

# Support Attributes in Association Loaders

103

# Model Reports Scheduling

103

# Rename Matrix Report Property

103

# Send Scheduled Reports as Attachments

104

# Write Back from OfficeConnect to Adaptive Planning

104

# Save Perspective Filters

105

# Perspective Favorites in Dashboards

105

# Waterfall Chart Improvements

106

# Integration Planning Data Source Scalability

106

# Manage JDBC Sources in Data Agents

107

# Replace Mode by Level for Model Sheet Import in Planning Data Loaders

107

# Import Splits to Unsplit Data with the importStandardData API

108

# Planning for HCM and Financials

108

# 2024R1 Release Notes

118

# 2024R1 Service Pack Release Notes

118

# Adaptive Planning Translations

119

# Adaptive Planning User Experience

120

# New Planning Center for Insights into Your Model

121

# Personal What-If Scenarios

122

# Scope Calculations on Sheets

126

# Code Fields for Metadata

127

# Headcount Planning Application

129

# Headcount Plan Data Source

131

# Planning Configuration Manager

132

## Page 4

| Contents | iv

Financial Planning Configuration Manager....................................................................................................133
Plan Publishing Performance and User Experience Enhancement...................................................................................134
Object Transporter 2.0..........................................................................................................................................................135
Modeled Sheet Data Validations........................................................................................................................................135
Report Scheduling...............................................................................................................................................................136
Reports Performance...........................................................................................................................................................137
OfficeConnect - Miscellaneous Enhancements....................................................................................................................137
Additional Fields for Show Details......................................................................................................................................139
View By Dimension for OfficeConnect for Financial Management.........................................................................................139
Alternate Ledger Currency Support in OfficeConnect for Financial Management................................................................139
Data Model Enhancements for OfficeConnect.....................................................................................................................140
Multi-Select Settings for Reports and Dashboards..............................................................................................................140
Adaptive Planning Permissions.............................................................................................................................................140
Chart Improvements in Dashboards.....................................................................................................................................141
Fan Chart on Dashboards....................................................................................................................................................141
Adaptive Planning APIs.......................................................................................................................................................142
JSON Formatted REST API Endpoints in Adaptive Planning.................................................................................................142
exportData API Performance...............................................................................................................................................143
Azul Zulu JDK in the Adaptive Planning Data Agent...........................................................................................................144
Adaptive Planning -- Miscellaneous Enhancements............................................................................................................144
Show Details in OfficeConnect for Financial Management..................................................................................................144
Dimension Rollups Include Values for Dimensions Outside the Hierarchy............................................................................145
Exclude from Spend as a Dimension....................................................................................................................................145
2023R2 Release Notes.........................................................................................................................................................145
2023R2 Service Pack Release Notes....................................................................................................................................145
Adaptive Planning User Experience.....................................................................................................................................146
Adaptive Planning Notifications..........................................................................................................................................146
Access Rules Retain Grant All Except Rules.........................................................................................................................147
Version Queuing.................................................................................................................................................................148
Modeled Sheet Data Validations..........................................................................................................................................149
Bottom-Up Workforce Planning...........................................................................................................................................150
Execute New Planned Positions...........................................................................................................................................153
Headcount Forecast Planning..............................................................................................................................................155
Planning Configuration Manager..........................................................................................................................................155
Publish Headcount Plan Cost of Workforce.........................................................................................................................158
Plan Publishing Performance and User Experience Enhancements......................................................................................158
Actuals Import from Workday Financials............................................................................................................................158
exportData API Performance...............................................................................................................................................159
Average Daily Balance Support in OfficeConnect for Financial Management......................................................................160
Time Options for OfficeConnect for Financial Management.................................................................................................161
OfficeConnect - Miscellaneous Enhancements....................................................................................................................162
OfficeConnect API Client Migration.....................................................................................................................................163
Reports Performance...........................................................................................................................................................163
Multi-Select Settings for Reports and Dashboards..............................................................................................................164
Perspective Context Filters in Dashboards..........................................................................................................................164
Sheets on Dashboards.........................................................................................................................................................164
Replace Mode for Standard Data Import in Planning Data Loaders......................................................................................165
Single Column Data Import.................................................................................................................................................165
NetSuite Consumer Key and Secret Management................................................................................................................166
Adaptive Planning - Miscellaneous Enhancements..............................................................................................................166
2023R1 Release Notes.........................................................................................................................................................166
2023R1 Service Pack Release Notes....................................................................................................................................166
Adaptive Planning Instance Usage Survey..........................................................................................................................167
Adaptive Planning User Experience.....................................................................................................................................167
Display Cube Sheet Size.....................................................................................................................................................169
Version Availability for List Dimensions..............................................................................................................................169

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 5

| Contents | v

View Dependencies Enhancements for Custom Dimension Values.................................................... 169
View Dependencies Enhancements for Accounts, Levels, and Attributes........................................... 170
Plan Publishing Performance and User Experience Enhancements.................................................. 171
Publish Financial Plans Time Span Limit................................................................... 172
Workforce Planning Configuration Manager.................................................................. 172
Headcount Planning Application...................................................................... 174
User Preference Row Totals in Cube Sheets................................................................. 176
Web Reports....................................................................................... 176
Reports Performance............................................................................. 177
Effective Date Support in OfficeConnect for Financial Management.............................................. 178
Multiple Hierarchy Support in OfficeConnect for Financial Management.......................................... 178
Dashboard Snapshots........................................................................... 179
Scatter Chart on Dashboards..................................................................... 179
Sheets on Dashboards............................................................................ 179
Text on Dashboards.............................................................................. 180
NetSuite Endpoint Upgrade....................................................................... 180
Specify Integration Task Order.................................................................... 180
Delta Replace Mode for Standard Data Import API......................................................... 181
JSON Formatted REST API Endpoints................................................................... 181
Cube Sheet Data Replace Mode...................................................................... 182
Adaptive Planning Translations.................................................................... 182
Prevent Locked Time Period Import to Modeled Sheets....................................................... 183
Adaptive Planning - Miscellaneous Enhancements............................................................ 183
2022R2 Release Notes............................................................................ 184
2022R2 Service Pack Releases...................................................................... 184
Adaptive Planning User Experience................................................................... 184
Alternate Calendars............................................................................. 186
Contra Accounts............................................................................... 188
Update and Append Attributes.................................................................... 190
Improved Cube Account Settings and Imports.............................................................. 190
Replace Mode for Cube Data Import in Planning Data Loaders.................................................. 191
Sheets on Dashboards............................................................................ 191
Copy Charts and Dashboards...................................................................... 192
Bulk Add Rows on Cube Sheets.................................................................... 193
Streaming Data for the Planning Data Source............................................................. 193
Export Configurable Model Data API.................................................................. 193
Security APIs for Adaptive Planning................................................................. 195
Schedule Publish Plans.......................................................................... 196
Effective Date in Workday Data Sources from Workday Financials................................................ 196
Set Up NetSuite Basic......................................................................... 196
Adaptive Planning Permissions..................................................................... 197
Adaptive Planning Performance and Scalability........................................................... 197
OfficeConnect Ad Hoc Analysis..................................................................... 198
Journal Line Details in OfficeConnect for Financial Management.............................................. 199
Level, Dimension, and Attribute Codes for Display Names................................................... 200
Chinese (Simplified) Language Support................................................................. 200
Adaptive Planning - Miscellaneous Enhancements............................................................ 201
2022R1 Release Notes............................................................................ 202
2022R1 Service Pack Releases...................................................................... 202
Update and Append Structures for Imports.............................................................. 202
Import and Export Availabilities in Sheets............................................................ 203
Adaptive Planning User Experience................................................................... 204
Adaptive Planning - Miscellaneous Enhancements............................................................ 207
OfficeConnect Availability for Financial Management....................................................... 208
OffieConnect and Excel Interface for Planning Installations............................................... 209
Level, Dimension, and Attribute Codes for Display Names................................................... 210

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 6

| Contents | vi

Check Box and Toggle Columns on Modeled Sheets.................................................. 211
Cell Explorer in Cube Sheets.................................................................... 212
Hide and Unhide Columns on Modeled Sheets........................................................... 212
Filter Display Columns on Modeled Sheets................................................................ 214
Workforce Planning Actions for Job Requisitions and Positions....................................... 214
Optimize Dashboard Loading.......................................................................... 215
API to Export Configurable Model Data................................................................... 216
NetSuite Basic Endpoint Upgrade......................................................................... 216
Access NetSuite File Cabinet Data....................................................................... 216
Publish From Metdata Mappings........................................................................... 217
Report Partitioning in Workday Data Sources............................................................. 217
Targeted Publishing................................................................................... 217
Adaptive Data Agent for Virtual Clean Room.............................................................. 217
Adaptive Planning Performance and Scalability......................................................... 218
Security APIs for Adaptive Planning....................................................................... 218
Discovery Classic Retirement............................................................................ 219
2021R2 Release Notes.................................................................................... 219
    2021R2 Service Pack Releases........................................................................ 219
    Workforce Planning Actions for Job Requisitions..................................................... 219
    Adaptive Planning Level Ownership..................................................................... 220
    Workforce Planning Actions for Positions............................................................ 221
    Improved User Interface for Explore Cell............................................................ 221
    Change and Save Standard Sheet View................................................................... 222
    Required Columns on Modeled Sheets.................................................................... 223
    Calculated Accounts for Adaptive Planning........................................................... 223
    Cube Sheet Performance.............................................................................. 224
    Data in Sheets...................................................................................... 224
    Adaptive Planning User Experience..................................................................... 224
    OfficeConnect Ad Hoc Analysis....................................................................... 227
    Perspective Context Filters......................................................................... 228
    Erase Data in Adaptive Planning..................................................................... 228
    Data Agents......................................................................................... 229
    Salesforce Integration............................................................................ 229
    Adaptive Planning - Miscellaneous Enhancements...................................................... 230
    Metadata Loader Column Mapping...................................................................... 232
    Traditional Chinese Language Support................................................................ 232
    Plan Publishing................................................................................. 232
    Import Multiple Account Links..................................................................... 233
    Plan Publishing by Period......................................................................... 233
    Request the Excel Interface for Planning Add-In................................................... 233
    Level, Dimension, and Attribute Codes for Display Names............................................. 234
    Download and Upload Mappings for Metadata Loaders................................................... 237
    Levels on Cube Sheet Data Imports................................................................... 237
    Merged Cube Sheets................................................................................ 238
    Adaptive Planning Support and Feedback.............................................................. 238
Prior Releases........................................................................................ 239
    2021R1 Release Notes.............................................................................. 239
    2020R2 Release Notes.............................................................................. 265
    2020R1 Release Notes.............................................................................. 277

Retired Functionality............................................................................... 286
    2020R2 Retired Functionality...................................................................... 286
    2020R1 Retired Functionality...................................................................... 287
    2019.3 Retired Functionality...................................................................... 288

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 7

| Releases | 7

## Releases

### Release Notes
Learn about the latest features and releases.

### 2026R1 Release Notes

#### 2026R1 Service Pack Release Notes

Release: 2026-04-10
*   **Workday-Enabled Adaptive Planning Customers and Singapore Support**: We update the Planning Agent release note to add information for Workday-enabled Adaptive Planning customers. We also update the feature description to add support for Singapore.
*   **Matrix Reports with Text Rollup**: We deliver this feature to production.
*   **Improved Performance for Actuals Updates** on page 24: We deliver this feature to production.
*   **Accounts with a Level/Dimension Rollup of Text** on page 23: We deliver this feature to production.
*   **Org Design and Scenario Modeling**: We correct this note to clarify the Org Models and Scenarios Dashboard subsection of the Changes section.
*   **Configurable Workflows**: We update the feature description, Business Benefits field, and Changes field to document the new hierarchy submit task type. We update the Changes field to document the ability to send reminders to assignees who haven't completed their tasks. We update the Business Benefits and Changes fields to document the new Workflow Path modal.
*   **Support for Workday-Enabled Adaptive Planning Instances**: We update the Adaptive Planning Notifications release note to add a change log for a feature update.

Release: 2026-03-27
*   **Calculation Error Messages** on page 23: We deliver a new feature. We omitted this release note from the 2026R1 preview and production update.
*   **Prerequisite Step for MS Teams Integration**: We add a missing prerequisite step for integrating Adaptive Planning notifications with Microsoft Teams.
*   **Org Design and Scenario Modeling**: We correct this note to clarify the What Do I Need to Do? section and add a link to Related Information section.

Release: 2026-03-14
*   **Multi-Select Levels and Dimensions on Modeled Sheets**: We update the delivery dates for the Production delivery for this functionality from 2026-03-14 to 2026-03-27.
*   **Configurable Workflows**: We update the delivery dates for the Production delivery for this functionality from 2026-03-14 to 2026-05-08.

Release: 2026-02-27
**Org Design and Scenario Modeling**: We update the Changes field to document new warning toast messages when you exceed Layers and Span of Control guidelines. We update the Changes field to document a new loading indicator for your cursor after you click on a related actions menu.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 8

| Releases | 8

## Configurable Workflows

Preview Date: 2026-02-07. Production Date: 2026-05-08.

With this release, we introduce Configurable Workflows, a new framework that enables you to design, orchestrate, and execute planning cycles. You can now create reusable workflow definitions using a graphical builder, assign tasks dynamically to users, user groups or associations, and manage the entire lifecycle within Hubs. You can use hierarchy submit tasks for seamless bottom-up hierarchical routing, advanced participating level selection, and aggregated monitoring. This feature replaces the legacy Workflow and Process Tracker.

**Watch the video:** 6m 59s

### Business Benefits

This feature enables you to have:

*   Enhanced flexibility. You can now design workflows that match your unique organizational structure, supporting both bottom-up planning motions.
*   Improved governance. You can now enforce strict data locking upon submission to ensure data integrity during planning cycles.
*   Increased process efficiency. You can now automate task handoffs, notifications, submission routing, and hierarchical roll-up submissions, reducing administrative overhead.
*   Streamlined communication. You can now send targeted, consolidated reminders to users with pending tasks to keep your planning cycles on schedule without overwhelming their inboxes.
*   Granular control. You can now utilize sheet scoping to limit tasks to specific data slices, ensuring users only focus on relevant accounts and levels.
*   Improved visibility. You can now gain immediate insight into your planning progress with detailed monitoring, enterprise tree views, and comprehensive historical audit trails that display reviewer notes and status changes, helping you identify and resolve bottlenecks quickly.

### Changes

#### Workflow Administration and Definitions

We add a new **Workflow Definitions** page in a new **Workflows** section in your hubs, where you can now create workflow definitions that you use as reusable templates for your planning cycles. You can create definitions with these task types:

*   To-Do.
*   Hierarchy Submit.

When you create a new workflow definition on the **Workflow Definitions** page, we provide a graphical workflow definition builder that supports drag-and-drop actions, enabling you to:

*   Move to-do and hierarchy submit tasks.
*   Reorder tasks.

When you create to-do tasks on your workflow definition, you can configure task destinations and direct users to specific dashboards or sheets to complete their work.

When you create submit tasks, you can additionally also configure sheet scope to define specific modeled or cube sheets applicable to a task. We now automatically lock only these sheets for specific roles when assignees submit.

When you launch or edit a workflow, you can now use a multiselect enterprise tree to choose participating levels for hierarchy submit tasks. We add an **Auto-select and maintain valid descendants for selected levels** check box that automatically includes child levels as associations change throughout the workflow.

When you publish workflow definitions, we:

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 9

| Releases | 9

• Enable you to use those workflow definitions to launch workflows for specific plan versions and participating levels.
• Automatically lock the workflow definitions for major structure changes while active workflows exist.

## Workflow Management

Workflow Management

We add a new **Workflows** page in the **Workflows** section in your hubs, where you can monitor your workflows using a flat-list view of all workflows, their statuses, and progress. You can use this page to:

• Drill down into specific instances to view task-level details.
• Export workflow task history and participating levels to Excel for audit and detailed review.
• View a hierarchical enterprise tree and grid view of your workflow. This view includes aggregated progress counts (such as *In Progress*, *Submitted*, and *Sent Back*) and allows you to search by level or filter by assignee and status.
• Send a reminder to assignees who have not yet completed their assigned to-do, submit, approve, or hierarchy submit tasks. We only display this option for in progress tasks.
• Pause, resume, and archive workflow instances to manage the planning cycle lifecycle.

## End User Experience

End User Experience

We add a new **My Tasks** section in your hubs which you can use as a central inbox to:

• View and access your assigned to-do and hierarchy submit tasks.
• Take action directly on task destinations, which we surface in the task. Example: You set your Expenses sheet as a to-do task destination, and your assignee can view and take action on the Expenses sheet directly from the task.
• Submit, submit all levels, or send back on your tasks.

We include a Workflow Path modal for standard hierarchy submit tasks, enabling you to audit previous submissions, read reviewer notes, and understand why a task was sent back. The modal displays a chronological table (oldest to newest) of all completed actions for the selected level.

When you send a task back, we automatically:

• Unlock the data for that specific part of the level and organization hierarchy.
• Notify the original submitter.
• Reset the task status back to *In Progress*.

For hierarchy submit tasks, parent-level submitters can choose to send back a specific leaf level only, or a parent level along with all of its descendants, using the *Parent Level Only* or *Parent Level and All Descendants* options.

We automatically send notifications:

• To leaf-level assignees upon workflow launch.
• To parental-level assignees once all their child levels are submitted.

We also consolidate send-back notifications by assignee.

## Security and Setup

Security and Setup

We add a new **Enable Configurable Workflows** check box on the **General Setup** page in **Administration**. When you enable this feature, we disable the legacy Workflow and Process Tracker features.

We add a new *Manage Workflows* permission. This permission is required to create definitions, launch, and monitor workflows.

We now support associations as assignees for tasks, allowing workflows to dynamically route based on level assignment.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 10

| Releases | 10

## What Do I Need to Do?

1. Select the **Enable Configurable Workflows** check box on the **General Setup** page in **Administration** and save. Note: When you enable this feature, we disable the legacy Workflow and Process Tracker features.
2. Assign the *Access Hubs*, *Edit Hubs*, and *Manage Workflows* permissions to the security groups or users who will administer planning cycles.
3. Configure the associations you want to use as assignees for submit and approve tasks. Go to Administration > Associations to define the relationships between users and levels that will drive task routing. Example: Create an association for budget submitters for level Product Development.
4. Create a new hub to house your workflow definitions or use an existing hub. Example: Create a Financial Planning hub.
5. Ensure that all workflow participants have access to this hub and all the artifacts in the hub.

## What Happens if I do Nothing?

If you don’t select the **Enable Configurable Workflows** check box and save, your tenant will continue to use the legacy Workflow and Process Tracker features. However, we recommend planning your migration as this new framework provides enhanced capabilities and will be the standard for future updates.

## Test Scenarios

When you use Ask Workday to ask questions about configurable workflows, the links to configurable workflows topics in the **Source Links** section won't work until we deliver this feature to Production.

## Change Log

### Hierarchy Submit Tasks

We update the feature description, Business Benefits field, and Changes field to document the new hierarchy submit task type.

Preview Date: 2026-04-10. Production Date: 2026-05-08.

### Send Reminders to Task Assignees

We update the Changes field to document the ability to send reminders to assignees who haven't completed their tasks.

Preview Date: 2026-04-10. Production Date: 2026-05-08.

### Workflow Path Modal

We update the Business Benefits and Changes fields to document the new Workflow Path modal.

Preview Date: 2026-04-10. Production Date: 2026-05-08.

### Configurable Workflows

We update the delivery dates for the Production delivery for this functionality from 2026-03-14 to 2026-05-08.

## Multi-Select Levels and Dimensions on Modeled Sheets

Preview Date: 2026-02-07. Production Date: 2026-03-27.

With this release, we enable end users to select multiple levels and dimensions within a dashboard filter to view an aggregation of data on modeled sheets. Previously, users were limited to viewing 1 level at a time or selecting a high-level parent and scrolling through irrelevant data.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 11

| Releases | 11

## Business Benefits

*   Users can quickly slice and dice data across multiple levels and dimensions without manual input, significantly speeding up the discovery of insights.
*   The ability to select multiple specific dimensions provides greater control over the data displayed, allowing users to tailor dashboards to their exact analytical needs rather than relying on pre-defined views.
*   The improved user experience aligns the behavior of modeled sheets with dashboard graphs, which already support multi-select, providing a consistent and intuitive interface.

## Changes

We now enable you to select multiple values in the dashboard filter for:

*   Dimensions.
*   Unlocked levels.

When you select multiple unlocked levels in the filter, we now automatically display:

*   A Level column on the left side of the sheet to indicate which level a row belongs to.
*   A toast to visually indicate that you selected multiple levels.

When you select 1 or more unlocked leaf levels, we now enable you to edit those rows.

When you include a roll-up level in your multi-selection, we respect the Allow editing while viewing rollup levels setting in your modeled sheet properties. When you include a roll-up level and leaf level together in your multi-selection, we automatically unlock your sheet regardless of this setting.

When you add a new row after selecting multiple values in the filter, we now automatically select the first level within the filter as your default level.

## What Do I Need to Do?

To enable your users to edit at roll-up levels, enable the **Allow editing while viewing rollup levels** setting in your modeled sheet properties.

## What Happens if I do Nothing?

If you do nothing, your dashboards will continue to function as they do today. Users can continue to select single levels or dimensions. The multi-select capability will be available whenever they choose to use it.

## Change Log

Multi-Select Levels and Dimensions on Modeled Sheets

We update the delivery dates for the Production delivery for this functionality from 2026-03-14 to 2026-03-27.

## Access Rules on Data Entry Columns in Modeled Sheets

Preview Date: 2026-02-07. Production Date: 2026-03-14.

With this release, we enable you to use access rules to secure data entry columns in modeled sheets. You can now control user access so that planners with access to different information only see their information, all while working on the same modeled sheet.

**Watch the video:** 2m 09s

## Business Benefits

This provides:

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 12

| Releases | 12

- Improved ability to safeguard confidential information by enabling you to secure sensitive data within the same modeled sheet, eliminating the need for separate, duplicate sheets for different user groups. This helps to ensure compliance with data privacy standards.
- Improved data management efficiency by consolidating workforce planning into 1 modeled sheet, reducing complexities associated with integrations and ensuring that data is up-to-date.
- Streamlined workforce planning by enabling planners to collaborate on the same modeled sheet while only seeing data relevant to their roles, improving efficiency and data accuracy.
- Enhanced system performance by reducing reliance on initial balance columns as workarounds for noninitial balance data.

## Changes

### Access Rules Setup

On the **Access Rules** page of the **Administration** area, we add a new **Manage Sheet Columns** button on the toolbar that enables you to search for and make these column types available for use in access rules:

- Check box.
- Date.
- Number.
- Text.

When you secure at least 1 modeled sheet column, we now display an info icon next to the **Account** column header in these areas:

- **Access Rules** overview page.
- Import and export files.

When you hover over this icon, we display a tooltip informing you that the columns are included in the **Account** section of access rules.

We update the access rules export file to include rules for modeled sheet data entry columns under the **Account** column structure.

### Access Rules Impact on End Users

When you secure modeled sheet columns and users don’t have access to those columns, we now hide the columns when they:

- View the sheet.
- Access the **Display Options** menu of the sheet and search for columns to filter or hide.

We now prevent users from editing secured modeled sheet columns when they have either:

- Limited View permission in the access rule.
- Full View without Edits permission in the access rule.

We recommend that you avoid creating critical validation rules that reference secured columns. If users don't have access to a required column, they can add new rows but won't be able to save them since they can't complete the required column.

### XML and JSON APIs

We update these XML and JSON APIs to respect the access rule permissions configured for secured modeled sheet columns:

- importConfigurableModelData
- exportConfigurableModelData

### What Do I Need to Do?

To secure data entry columns in a modeled sheet:

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 13

| Releases | 13

1. Go to **Administration** > **Access Rules**.

2. Select **Manage** on the toolbar.

3. Ensure **Account** is selected. Account must be enabled for use in access rules to secure sheet columns.

4. Select **Manage Sheet Columns** on the toolbar.

5. In the dialog, select the sheet and the specific columns (Number, Date, Text, or Check box) you want to secure, then select **Save**.

6. Update your access rules by importing a rules file. You define access to these columns using the account (Grant) or account (Grant All Except) columns, using the syntax `SheetName.ColumnName` (Example: `Personnel.Bonus`).

## What Happens if I do Nothing?

If you don’t explicitly select columns to secure using the **Manage Sheet Columns** settings, all users with access to the modeled sheet will continue to see all data entry columns, consistent with previous behavior. Your existing access rules won’t be impacted.

## Test Scenarios

If you use this feature with the headcount planning feature, ensure that you align your users’ HCM security access with their Adaptive Planning level access. If a user has higher level access in HCM than Adaptive Planning, they can still create or move positions to levels they don’t have access to in your access rules. Example: Your workforce planner has HCM access to levels 2100 and 2500.1, but in your access rules they can only access 2100.1. They can still use the headcount planning feature to create or move positions to 2100.2.

## Examples

These examples describe some existing access rule setups, actions you take, and behavior to expect. We recommend that you review your existing access rules and identify if your access rules match these examples.

This example describes the most common expected scenario that results in behavior changes:

* Existing Setup: Grant All on specific accounts, where 1 or more account is from Sheet A
* Action: Secure column for Sheet A.
* Behavior: That user will no longer have access to the secured column for Sheet A because access to that secured column wasn’t explicitly specified in their access rules.

These examples describe the most common expected scenarios that don’t result in behavior changes:

Example 1:

* Existing Setup: Grant and Grant All Except is blank for Account, meaning users have access to all accounts.
* Action: Secure column for Sheet A.
* Behavior: Users will continue having access to all accounts, which now includes the secured column.

Example 2:

* Existing Setup: Grant All on Account includes Sheet Name A, meaning users have access to All Accounts for Sheet A.
* Action: Secure column for Sheet A.
* Behavior: Users will continue having access to all accounts in Sheet A, which now includes the secured column.

Example 3:

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 14

| Releases | 14

- Existing Setup: Grant All Except on Account includes Sheet A, meaning users have access to all accounts except for in Sheet A.
- Action: Secure column for Sheet A.
- Behavior: Users will continue to not have access to accounts in Sheet A, which now includes the secured column.

## Predictive Forecaster Scalability and Usability

Preview Date: 2026-02-07. Production Date: 2026-03-14.

With this release, we enhance the scalability and usability of Predictive Forecaster. We increase the system guardrails to support larger datasets, specifically distinguishing between forecast data and lever sheet data, and improve the user experience by providing detailed usage statistics for lever sheets.

### Business Benefits

These enhancements enable you to:

- Scale your planning. Process significantly larger datasets and manage more forecast definitions within a single instance.
- Gain visibility. Understand exactly how your drivers impact your forecast with new lever sheet usage statistics on the history page.

### Changes

#### Scalability and Performance

We increase the cell count guardrail to support larger planning models for:

- Forecast data. You can now process up to 10 million cells of forecast data.
- Lever sheet data. We now support a separate limit of up to 1 million cells specifically for lever sheet data.

We increase the default maximum number of forecasts per instance from 20 to 100. Instances currently set below 100 will be upgraded automatically.

#### User Experience and Error Handling

We add a new **Lever Sheet Summary** section to the **Forecast History** page that displays lever sheet usage statistics. This summary lists information on matching and non-matching regressor rows to help you verify if your lever sheets are being applied as expected.

When a forecast fails due to data issues, we now display the specific intersection information (account, level, and dimension) in the error message, enabling faster troubleshooting.

### What Do I Need to Do?

You don't need to take any action to enable these features. The increase in forecast limits and cell counts will apply automatically.

### What Happens if I do Nothing?

If you do nothing, you will automatically receive the increased limits and performance improvements. Your existing forecasts will continue to run as expected.

### Change Log

Predictive Forecaster Scalability and Usability

We correct this note to clarify the Changes.

Preview Date: 2026-02-07. Production Date: 2026-03-14.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 15

| Releases | 15

Related Information

Create Machine Learning Forecasts

## Anomaly Detection for Sheets in Dashboards

Preview Date: 2026-02-07. Production Date: 2026-03-14.

With this release, we continue to make improvements to intelligent planning by enabling you to use anomaly detection on sheets in dashboards. This enables you to analyze comparisons between machine learning predictions and your plans and budgets.

### Business Benefits

This feature gives you greater visibility on possible outliers and unexpected data by enabling you to detect anomalies on sheets directly in the dashboards that provide more information and context.

You no longer have to navigate away from your dashboard to the Sheets menu to detect anomalies in your sheets, saving you time and effort.

### Changes

We add a new *Show Anomalies* option on the Sheet Menu of sheets in dashboards, enabling you to use the existing anomaly detection functionality on sheets in dashboards.

### What Do I Need to Do?

1. Have at least 24 months of actuals data in an account for anomaly detection to work for that account.
2. Create prediction versions for anomaly detection.
3. Generate anomaly detection predictions.

### What Happens if I do Nothing?

If you do nothing and you already set up and use anomaly detection on the dashboard sheets when you access those sheets from the Sheets menu, we automatically display the new *Show Anomalies* menu option.

### Related Information

Create Prediction Versions for Anomaly Detection

Generate Anomaly Detection Predictions

Detect Anomalies in Sheets

## New Workday Adaptive Planning Logos

Preview Date: 2026-02-07. Production Date: 2026-02-07.

With this release, we update the Workday Adaptive Planning logos that display in your platform.

### Business Benefits

These new logos provide an updated look and feel, and aligns with the design used in other Workday products.

### Changes

On the sign-in page for Workday Adaptive Planning, we:

* 

©2026 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 16

| Releases | 16

- Change the background color of the right-hand side of the page.
- Change the text color of "Workday Adaptive Planning."
- Remove the cloud image.
- Replace the logo.

We also replace the logo and update the colors on:
- Data Agent Service Manager.
- Excel Interface for Planning.
- The footer on the welcome page.
- The header of all pages.
- The header on email notifications.
- The icon for the Workday Adaptive Planning pages on your web browsers.
- The icons for Workday credentials and Workday data sources in Design Integrations.
- The Workday for Google Sheets app page in Google Play.

## What Do I Need to Do?
You don't need to do anything.

## What Happens if I do Nothing?
If you do nothing, we automatically make these changes.

## Change Log
New Workday Adaptive Planning Logos
We correct the note to clarify the Production Date.
Preview Date: 2026-02-07. Production Date: 2026-02-07.

## Adaptive Planning Notifications
Preview Date: 2026-02-07. Production Date: 2026-03-14.
We introduce the ability to integrate Adaptive Planning notifications with Microsoft (MS) Teams for users to receive real-time alerts within Microsoft Teams.
This feature supports:
- Adaptive Planning instances connected to Workday tenants.
- Adaptive Planning Multi-Instances. You must configure each instance individually for notifications.

## Business Benefits
- Consolidates communication by bringing Adaptive Planning alerts into the workspace where users already collaborate.
- Enables immediate visibility into tasks such as workflow approvals or system alerts, facilitating quicker decision-making.
- Drives adoption for non-finance users who may not sign in to Adaptive Planning daily but are active in Microsoft Teams.

## Changes
A new Microsoft Teams app tile displays under **Administration** > **Notification Preferences** > **Notification Setup**.
- A new Microsoft Teams option displays in the **Connections** section of the Manage Notifications page, allowing users to link their individual accounts.

©2026 Workday, Inc. All rights reserved
Workday Proprietary and Confidential

## Page 17

| Releases | 17

## What Do I Need to Do?

Administrators must have the *Admin Access* permission to configure the connection for the instance. End users require access to their own Microsoft Teams account and the ability to add apps within their Microsoft environment.

### Prerequisite

Before integrating MS Teams with Adaptive Planning, you must install the **Microsoft Teams Workday Adaptive Planning** application on your Adaptive Planning instances using either option:

- End Users can search for "Workday Adaptive Planning" within their MS Teams app and click Add.
- The Microsoft 365 administrator can install the **Microsoft Teams Workday Adaptive Planning** application for their organization using the instructions in the MS Preinstall apps documentation.

### Integration Steps

To use the Microsoft Teams integration, complete these steps:

#### For Administrators:

1. From the Adaptive Planning main menu, click **Administration**. The Administration page displays.
2. From the **System** menu, click the **Notifications Preferences** link.
3. Locate the **Microsoft Teams** app tile and click Add.
4. Follow the prompts to sign into Azure AD and grant admin consent to allow the application to access your tenant.
5. Authenticate your Adaptive Planning administrator credentials to finalize the association.

#### For End Users:

1. From the Adaptive Planning home page, click **Notifications** and then click **Manage Notifications**.
2. Locate the **Microsoft Teams** tile in the **Connections** section and click **Connect**.
3. Open the **Workday Adaptive Planning** app in Microsoft Teams and click the link in the welcome message to authenticate your account.

### What Happens If I Do Nothing?

If you don't configure the integration with MS Teams, users will continue to receive notifications only through the standard Adaptive Planning interface and email. No changes will occur to existing notification preferences or delivery methods.

### Change Log

Support for Workday-Enabled Adaptive Planning Instances

Preview Date: 2026-04-10.

This feature now also supports Adaptive Planning instances that are connected to Workday tenants.

Prerequisite Step for MS Teams Integration

We corrected the **What Do I Need to Do?** section to include a missing prerequisite step for the integration.

Feature Description Updated

We updated the feature description for accuracy.

### Planning Agent

Preview Date: 2026-02-07. Production Date: 2026-03-14.

We introduce an enhanced prompting experience for the Planning Agent using agent orchestration. This helps to precisely identify user intent and route to the correct agent skill.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 18

| Releases | 18

Note: Note: This feature is only available to Planning Agent customers in the U.S., Canada, Europe, and Singapore. For more information about the Planning Agent, contact your Account Executive.

## Business Benefits

• Reduces AI errors and "hallucinations" by ensuring the AI is grounded in your actual Metadata Service (MDS) elements rather than general terms.

• Eliminates the need to memorize strict naming conventions or prefixes for complex model structures, allowing for a more natural, conversational workflow.

• Simplifies the process of creating rich, contextual prompts, enabling both new and expert users to derive deeper insights from their data more quickly.

## Changes

Users can now:

• Enter the @ symbol to trigger a pop-up menu of element types, such as accounts, dimensions, or versions.

• Enter partial names, abbreviations, or minor typos and still find the correct dimension such as level or account.

• Stop relying on rigid templates as all prompts now route through a freeform processing path.

## What Do I Need to Do?

The enhanced prompting experience respects existing user security. Users can only view the data they have access to.

Admins can ensure users have the appropriate permissions to view the model elements they're asking about.

Note: Workday-enabled Adaptive Planning customers must set up the Planning Agent in Agent System of Record (ASOR).

## What Happens If I Do Nothing?

Nothing happens. We still support manual queries with additional accuracy and ease of use.

Workday-enabled Adaptive Planning customers can't access the Planning Agent without first setting it up in ASOR.

## Change Log

Workday-Enabled Adaptive Planning Customers and Singapore Support

We updated these sections with a note for the Workday-enabled Adaptive Planning customers:

• What Do I Need to Do?

• What Happens If I do Nothing?

We also updated the feature description to add support for the Singapore region.

Updated Feature Description

We have updated the feature description for additional clarification and accuracy.

Correct Feature Name with Updated Description

We have updated this note to reflect the correct feature name and description.

## Planning Agent: Data Exploration

Preview Date: 2026-02-07. Production Date: 2026-03-14.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 19

| Releases | 19

Note: This feature is only available to Planning Agent customers in the U.S., Canada, Europe, and Singapore. For more information about the Planning Agent, contact your Account Executive.

We expand the Planning Agent: Data Exploration (Data Exploration) skill to support deep data exploration throughout the application. Users can now ask natural language questions to summarize data, detect anomalies, compare versions, and instantly generate visualizations. This feature transforms static data into conversational insights, allowing users to query data both within their current view and across the broader model.

## Business Benefits

This feature:

* Enables financial planners and analysts and other business users to quickly surface insights, understand variances, and get immediate answers to business questions. They can do this directly from their standard, cube, and model sheets.
* Enables users to perform analyses without having to manually build reports or export data for analysis. This streamlines workflows and enhances efficiency.
* Reduces the risk of mis-analysis through manual reviews. Data highlights and anomalies are automatically surfaced.
* Facilitates faster, more strategic decisions by uncovering critical information and suggesting next steps.
* Makes advanced planning tools intuitive, conversational, and accessible to all skill levels. The feature improves overall productivity and user adoption within the organization.
* Enables users to access and analyze data that might not be directly visible on the active sheet, including data from other versions (such as budgets) or time periods. They can do comprehensive comparisons and variance calculations.

## Changes

Data Exploration:

* Is now available anywhere that you can see Ask Workday including standard, model, and cube sheets.
* Supports ranking and grouped aggregations directly within Ask Workday. For example, "What is the average salary by department?"

## What Do I Need to Do?

To use the Data Exploration skill, an administrator must assign the *Ask Workday for Adaptive Planning* permission to users.

## What Happens If I Do Nothing?

If the required permission isn't assigned, users won't be able to use the Data Exploration skill from Ask Workday.

## Change Log

Planning Agent: Data Exploration

We updated the product description and the **Changes** section for accuracy.

## Adaptive Planning Hubs

Preview Date: 2026-02-07. Production Date: 2026-03-14.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 20

| Releases | 20

With this release, we introduce Hubs, a new personalized and central location in Adaptive Planning. Hubs allow administrators to create intuitive, curated workspaces for users to organize, navigate, and interact with a collection of dashboards, sheets, reports, links, and tasks.

## Business Benefits

• Provides a single, unified workspace for planners, analysts, and managers, reducing the time spent navigating to different parts of the application.

• Administrators can create and share different hubs for specific functions (Finance Hub, Sales Hub) or processes, ensuring users only see the content most relevant to them.

• Users have immediate access to key instructions and pending workflow tasks, fostering faster, more informed decision-making.

• Respects all existing Adaptive Planning access rules and permissions, ensuring users can only view the data they are authorized to see.

## Changes

This feature introduces:

• The Hubs option in the main navigation menu.

• The ability to select a shared hub as the default home page from the user profile page.

• The ability to see a maximum of 3 recent hubs on the home page provided users have access to least 1 hub.

• The *Access Hubs* permission that enables users access to:

• The Hubs option in the main navigation menu.

• Hubs content shared with them.

• The *Edit Hubs* permission enables administrators to create, edit, clone, share, and manage all hubs.

## What Do I Need to Do?

1. The administrator must assign these hubs permissions to the appropriate users and groups:

• Assign the *Access Hubs* and *Access Dashboards* permissions to all users and groups who need to view hubs.

• Assign the *Edit Hubs* permission to administrators who are responsible for creating and managing hubs.

2. Administrators must actively build, configure, and share the hubs for end-users to access them.

## What Happens If I Do Nothing?

If you do nothing, your users don't see any changes to the navigation menu, and no new permissions become active. Your existing dashboards, reports, and workflows continue to function as they do today.

## Change Log

Update to Changes List

We updated the **Changes** section to accurately reflect the feature details.

Adaptive Planning Hubs

We update this note to inform you that:

• This feature is now available in preview for everyone.

• We removed the AI-powered performance summaries that were available in the limited availability version.

• We added the ability to see recent hubs from the home page.

• We added the *Access Dashboards* permission as a requirement for users and groups to view hubs.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 21

| Releases | 21

*   We updated these sections to reflect the latest product behavior and capabilities:
    *   Changes
    *   Business Benefits
    *   What Do I Need to Do?
    *   What Happens if I Do Nothing?

## Adaptive Planning Hubs

We correct this note to inform you that this feature is currently released as limited availability. Accordingly, we have updated the **What Do I Need to Do?** section to include information about who has access to the feature.

## Chart Visualization in Dashboards

Preview Date: 2026-02-07. Production Date: 2026-03-14.

We now introduce rounded corners for several chart types, customizable single-color gradients for area and bar-style dials, and improved control over gridlines and data point markers.

### Business Benefits

*   Updated line markers and optional gridlines provide stronger visual contrast, making it easier for users to identify specific data points and comprehend complex datasets.
*   Rounded corners and sophisticated gradient fills create a visually engaging and professional interface that aligns with modern design standards.

### Changes

*   By default, rounded corners are applied to Pie, Doughnut, Pyramid, Funnel, Bar, Column, Waterfall, and Microchart Column dials.
*   Gauge dials are updated with a modern style, including rounded corners and the ability to update font colors, which default to the Pen1 color.
*   Y-Axis styling is refined by removing ticks and axis lines, and updating the remaining axis line color to #787878.
*   Added a new **Show Gradient** option in the Appearance general settings for supported dials.
*   Added linear single-color gradient support for Area, Bar, Column, Waterfall, Gauge, and Pie family dials (including Pyramid and Funnel).
*   Microcharts (Area and Column) and AI Summary KPI Microcharts now support single-color gradients to enhance visual engagement.
*   Added a **Show Marker** option to Standard Dials (per series), Trendlines, and Microcharts (per chart).
*   Default marker states are now enabled for Line and Fan dials, and disabled for Area dials.
*   Introduced Horizontal and Vertical Gridline options in Appearance settings, with defaults based on the specific dial type. Example: vertical gridlines default to On for Bar charts.

### What Do I Need to Do?

The Gradient on Charts and Show Gridlines options are enabled by default. The visual updates such as rounded corners and axis styling are also automatically applied.

Administrators must enable gradients or gridlines for specific charts:

1.  From the main menu, select **Dashboards**.
2.  Click **Dashboard Preferences** and then select **Themes**.
3.  For individual dials, navigate to the **Appearance** section in the chart settings and enable the **Show Gradient** or **Show Gridlines** options as desired.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 22

| Releases | 22

What Happens If I Do Nothing?

Basic UI modernization, such as rounded corners and updated axis styling, apply automatically to all users without an opt-out preference. The **Gradient on Charts** and **Show Gridlines** options are enabled by default.

Pattern Reports User Experience

Preview Date: 2026-02-07. Production Date: 2026-03-14.

We refresh the pattern reports user interface for a consistent user experience across all web report types.

Business Benefits

Provides a faster, more intuitive interface for viewing and interacting with complex data spreads.

Changes

The UI looks different now for pattern reports and matches other web report types.

Transaction Reporting Performance

Preview Date: 2026-02-07. Production Date: 2026-03-14.

We provide an easy way to delete transactions to manage large volumes of transaction data.

Business Benefits

* Prevents performance degradation caused by excessive transaction volume, ensuring a faster experience for all users.
* Provides a user-friendly way to delete old records directly in the UI.

Changes

A new option under **Integration > Manage Transactions** that supports the easy deletion of transactions without requiring a row-by-row file import.

Change Log

Correct UI Element Name

We update the note to correct the UI element name from **Manage Integrations** to **Manage Transactions** in the Changes section.

View Last Updated Date for Web Reports

Preview Date: 2026-02-07. Production Date: 2026-03-14.

With this release, we add the ability for users to see when matrix reports were last modified.

Business Benefits

* Provides visibility into when reports were modified.
* Helps administrators and users identify stale or outdated reports that may need archiving or updating.

Changes

When you navigate to the Reports page from the main menu and open a report folder, the **Last Updated Date** column now displays the date of the most recent modification for each report.

©2026 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 23

| Releases | 23

## What Do I Need to Do?

The **Last Updated Date** column is automatically added to the default view of the Reports overview. No manual configuration is required to begin tracking these dates for new modifications.

## What Happens If I Do Nothing?

The **Last Updated Date** column displays by default for all users with access to the Reports page. If you made no recent modifications to older reports, the field remains blank until the next time you save these reports.

## Calculation Error Messages

Production Date: 2026-03-13.

With this release, we make it clearer when your reports and exports include calculation errors caused by account configuration issues.

### Business Benefits

This enables you to discover and resolve errors more easily and ensures you're always viewing a complete data set.

### Changes

When your report or export contains calculation errors caused by incorrect account configurations, Workday now displays an error message and no longer returns any data. Previously, Workday enabled you to proceed without notifying you of the calculation errors and may have returned partial data.

### What Do I Need to Do?

We recommend you:

*   **Run Formula Validation** to find issues that previously may have produced silent, incomplete results. Workday will now display errors on those reports and exports
*   Review reclassified accounts and their associated rules, as some of their configurations may not be supported.

You can also deselect **Optimize Report Execution** on reports when you encounter errors messages about unsupported operations. Example: Using the optimized report execution.

### What Happens If I Do Nothing?

Your reports and exports may continue to contain calculation errors caused by account configuration issues.

### Change Log

Calculation Error Messages

We omitted this release note from the Production section of the 2026-03-13 service update.

## Accounts with a Level/Dimension Rollup of Text

Preview Date: 2026-04-10. Production Date: 2026-04-10.

With this release, Workday now displays accounts with a rollup type of text more consistently.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 24

| Releases | 24

**Business Benefits**

This ensures data is consistent across your model, providing you with accurate information.

**Changes**

Workday now displays custom accounts and cube accounts with a Level/Dimension rollup of Text more consistently across your models. Previously, data displayed on reports or exports didn’t match data from sheets, depending on your configurations.

**Related Info**

• Concept: Rollup Cells in Sheets

• Reference: Settings for Cube Standard Accounts

• Reference: Settings for Custom Accounts

**Improved Performance for Actuals Updates**

Preview Date: 2026-04-10. Production Date: 2026-04-10.

When you modify actuals, Workday now only recomputes values where necessary.

**Business Benefits**

By removing the need to fully recompute all reports and exports whenever actuals are modified, we improve the performance of your models. This is especially important as it reduces lag and wait times when multiple users are viewing reports at the same time.

**Changes**

With this release, when you import or save actuals on sheets, Workday now identifies the changed values and updates them without impacting other values. Previously, Workday discarded and recomputed all data in the version, regardless of which values were updated.

Workday will continue to complete a full recomputation when you complete these actions:

• Modify metadata, such as modifying model structures. This includes metadata imports that occur in the same scheduled run of actuals imports.

• Import foreign exchange rates.

• Change consolidation percentages.

• Use the **Erase Data** integration option. To prevent recomputation, you can use the Import Data integration option and select **Enable Replace Mode** instead.

• Modify a base version of a report. This recomputes any virtual versions based on that report.

• Select Make New Actuals Visible when you import actuals.

• Access any instance of an actuals version tree configured with allocations or eliminations.

• Open a report with many calculated accounts for the first time after you import it. Workday computes all calculations when the report is first opened, but will only update changed values in subsequent runs.

**What Do I Need to Do?**

Note: Note: To request this feature, contact your Named Support Contact (NSC) to submit a Workday Customer Care request. After confirming that you're eligible, we'll enable the feature.

After the feature is enabled, we recommend you complete these actions to support the improved performance of actuals updates:

• Run foreign rate exchange imports in its own process separate from the regular actuals import schedule. You can reduce the frequency of these imports as needed.

©2026 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 25

| Releases | 25

*   Reduce metadata changes during peak usage hours.
*   Use the Import Data integration option and select Enable Replace Mode to import data instead of the Erase Data integration option.
*   Run metadata imports and actuals imports as 2 separate scheduled jobs and ensure there’s enough of a loading time buffer between the two.

## 2026R1 Planning for HCM and Financials

### Planning for HCM and Financials

These features require you to have additional SKUs related to Human Capital Management or Financials.

### Org Design and Scenario Modeling

Preview Date: 2026-02-07. Production Date: 2026-03-14.

With this release, we introduce Org Design and Scenario Modeling, a new capability within Adaptive Planning for the Workforce. This feature enables workforce planners and HR business partners to model organizational changes in a secure, sandbox environment. You can create multiple "what-if" scenarios to restructure hierarchies, move positions, and modify attributes without affecting your live HCM data until you’re ready to execute.

You can visualize your current organization, drag and drop organizations and positions to model changes, and instantly see the impact on key metrics such as headcount, FTE, and workforce costs. Once you finalize a scenario, you can route it for approval using a new business process designed specifically for org modeling.

**Watch the video:** 5m 40s

### Business Benefits

This feature enables you to:

*   Quickly adapt your organizational structure to meet changing business needs by modeling various scenarios side-by-side.
*   View real-time updates to cost and headcount metrics as you model changes, allowing you to assess the financial and operational impact of restructuring immediately.
*   Share scenarios with key stakeholders and HR leaders for feedback and collaborative planning within a secure environment.

### Changes

#### Org Models and Scenarios Dashboard

We deliver a new **Org Models and Scenarios** dashboard (secured to the *Manage: Org Models* and *Participate: Org Models* domains). This centralized hub enables you to view your models and scenarios shared with you. From here, you can launch the modeling interface, create new scenarios, and track status.

We add the **Create Org Model** task (secured to the *Design Org Models* business process) to initiate a new org modeling project. You can define the model name, effective date, organization hierarchy type, and top-level organization. You can access this task from the new dashboard.

We add the **Launch Org Model** task (secured to the *Manage: Org Models* and *Participate: Org Models* domains) that you can use to open the visual modeling interface. You can access this task from the new dashboard.

On the visual org modeling interface, we enable you to:

*   Click and drag organizations or positions to move them to different parts of the hierarchy.
*   Compare scenarios to view differences in headcount, cost, and structure side-by-side.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 26

| Releases | 26

*   Copy models to create alternative versions of your plan.
*   Select multiple organizations or positions to perform bulk edits or moves.
*   Use related actions on org nodes to create subordinate orgs, edit orgs, inactivate or reactivate orgs, assign roles, create positions, or edit positions.
*   View key metrics like Total Workforce Cost, Headcount, FTE, Span of Control, and Layers. These metrics update dynamically as you make changes.

We display warning toast messages when you exceed the guidelines set by your administrator for:
*   Layers
*   Span of Control

We don't prevent you from continuing after you exceed these guidelines.

We display a loading indicator on your cursor after you click on the related actions menu for items in this modeling interface, and you're waiting for the related actions menu to appear.

## Security and Setup

We deliver these new domains (secured on the Adaptive Planning for the Workforce functional area):
*   *Manage: Org Models* that you can use to configure who can create org models and initiate the collaboration process.
*   *Participate: Org Models* that you can use to configure who can view and edit org models that they are invited to.
*   *Set Up: Org Model* that you can use to configure who can use the configuration tasks and edit the guidelines.

We deliver a new *Design Org Models* business process (secured to the Adaptive Planning for the Workforce functional area) that you can use to configure who can collaboratively design org models and scenarios using shared participation.

## Org Model Reporting

We deliver a new **Direct Parent from Organization** report field on the Organization business object (secured to the *Public Reporting Items* domain) that you can use to return the direct parent for hierarchical organizations or a singular container for content organizations.

We deliver these new report fields on the Headcount Plan Line Details business object (secured to the *Public Reporting Items* domain) to support delta reporting:
*   **Cost of Workforce Amount**
*   **Full Time Equivalent**
*   **Is Manager**
*   **Position Availability Date**
*   **Position Element**

We deliver these new report fields on the new Planning Org Change business object (secured to the *Public Reporting Items* domain) to support delta reporting:
*   **Is Newly Created**
*   **New Parent or Container**
*   **Organization Entity**
*   **Plan Scenario**

We deliver the **Position rolls up to Top Level Organization for Org Model** report field on the Plan Executable business object (secured to the *Manage: Org Models* and *Participate: Org Models* domains) that you can use to evaluate whether positions roll up to the top level organization for your org model.

## What Do I Need to Do?

Enable the new domains:

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 27

| Releases | 27

1. Access the **View Domain** report and locate the new *Manage: Org Models*, *Participate: Org Models*, and *Set Up: Org Model* domains in the Adaptive Planning for the Workforce functional area.
2. Enable these domains and add the appropriate security groups to the View and Modify permissions. Examples: Add the Workforce Planner or HR Administrator security groups.
3. Activate your pending security policy changes.

Configure the new business process:

1. Access the *Design Org Models* business process definition.
2. Add a Shared Participation step. Assign security groups to this step. Example: Assign the Org Model Owner security group.
3. Configure the Approval step to route completed models to the appropriate approvers. Examples: Route to the HR Executive or Manager security groups.

If you want to use custom calculations for workforce costs, ensure you have configured the necessary calculated fields on the Headcount Plan Line Details business object. You can select these fields during the **Create Org Model** task, which you access on the **Org Models and Scenarios** dashboard.

**What Happens if I do Nothing?**

If you don’t enable the new domains or configure the business process, the Org Design  Design & Scenario Modeling features will not be accessible to your users. Existing workforce planning functionality will remain unchanged.

**Related Information**

Workday Community: Video: Setup Org Design  Org Design & Scenario Modeling (2026R1)

**Change Log**

Org Design and Scenario Modeling

We correct this note to clarify the Org Models and Scenarios Dashboard subsection of the Changes section.

Org Design and Scenario Modeling

We correct this note to clarify the What Do I Need to Do? section and add a link to Related Information section.

Warning Toast Messages

We update the Changes field to document new warning toast messages when you exceed Layers and Span of Control guidelines.

Preview Date: 2026-02-27. Production Date: 2026-03-14.

Loading Indicator

We update the Changes field to document a new loading indicator for your cursor after you click on a related actions menu.

Preview Date: 2026-02-27. Production Date: 2026-03-14.

Org Models and Scenarios Report Fields

We update the Changes field to document new report fields on these business objects:

*   Headcount Plan Line Details
*   Organization
*   Plan Executable
*   Planning Org Change

Preview Date: 2026-02-07. Production Date: 2026-03-14.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 28

| Releases | 28

## Headcount Planning Application

Preview Date: 2026-02-07. Production Date: 2026-03-14.

When you perform position-level workforce planning, we enable you to secure access to compensation-related columns when you view headcount or headcount forecast plans.

### Business Benefits

This gives you more control over who can view and edit compensation data on your headcount and headcount forecast plans.

### Changes

On the Roster Sheet page of the Manage Workforce Planning Configuration Manager task, we update the check boxes on the Secure Data column to now secure compensation data on headcount plans and headcount forecast plans.

When you select the Secure Data check box for sheet columns, we now only display the data to users with access on the Compensation Details: Headcount Planning domain.

We secure access to compensation-related columns when you view the headcount or headcount forecast plans using these My Tasks items:

*   Headcount Planning Event
*   Headcount Planning Participant Detail Event

Note: We don't secure access to columns using the Compensation Details: Headcount Planning domain for existing headcount and headcount forecast plans.

### What Do I Need to Do?

If you want users to have access to data that's secured by the Secure Data column, add those users to security groups with access to the Compensation Details: Headcount Planning domain.

### Related Information

Manage Workforce Planning Configurations

### Publish Financial Plans Time Span Limit

Preview Date: 2026-02-07. Production Date: 2026-03-14.

With this release, we now allow you to select plan structures for publishing that span up to 10 years.

#### Business Benefits

This enables you to:

*   Create larger financial plans for more extended time periods.
*   Provide downstream accounting users more financial plan lines to work with.

#### Changes

We now display financial plan structures that span up to 10 years in the Plan prompt when you select plans to publish.

#### What Do I Need to Do?

You don't need to do anything.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 29

| Releases | 29

**What Happens if I do Nothing?**
If you do nothing, we automatically display plan structures with time spans up to 10 years.

**Related Information**
Publish Financial Plans from Adaptive Planning

## 2025R2 Release Notes
### 2025R2 Service Pack Release Notes

**Release: 2026-04-10**
*   **Support for Workday-Enabled Adaptive Planning Instances**: We update the Adaptive Planning Notifications release note to add a change log for a feature update.

**Release: 2025-12-12**
*   **Version-Specific Overrides for Linked Accounts**: We update the delivery dates for the Preview and Production redelivery for this functionality from 2025-11-21 to 2025-12-12.
*   **Sheets Performance Evaluator** on page 43: We deliver a new feature. We omitted this release note from the Production section of the 2025-11-21 service update.

**Release: 2025-11-21**
*   **Version-Specific Overrides for Linked Accounts**: We now redeliver this feature to your Preview and Production tenants.
*   **Adaptive Planning Hubs** on page 19: We deliver a new feature as limited availability.
*   **Planning Agent: Data Exploration** on page 36: We deliver a new feature as limited availability.
*   **Workday for Google Sheets** on page 46: We deliver a new feature as limited availability.
*   **Unified User Provisioning and Authentication (UPA) for Workday Adaptive Planning** on page 53: We deliver this feature to production.

**Release: 2025-10-10**
*   **Version-Specific Overrides for Linked Accounts**: We revert this functionality from Preview and Production tenants. We plan to redeliver this functionality in a future service update.

## Multicoordinate Support for Cell Explorer
Preview Date: 2025-08-16. Production Date: 2025-09-20.

Workday now enhances Cell Explorer functionality within Adaptive Planning dashboards and reports to support multilevel and multidimension coordinate selections in filters. This enables you to drill into contributing account, level, and dimension details from aggregated data when multiselect is enabled in these areas.

### Business Benefits
This provides you with:
*   Rapid root cause analysis and exception reporting. You can now quickly identify the underlying data that contributes to aggregated numbers, which accelerates problem-solving.
*   Improved data exploration flexibility and granularity. Perform more nuanced and precise analysis by easily exploring custom rollups.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 30

| Releases | 30

*   Reduced manual effort and human error. This feature eliminates the need for manual data exports, pivot tables, or running multiple reports to understand aggregated details. Additionally, it provides guided selections that prevent incorrect data filtering.

## Changes

On dashboards and reports, we now enable you to use Cell Explorer when you select multiple values on your dimension and level filters. These values can be any combination of:

*   Dimension values on different dimensions.
*   Dimension values on different hierarchy levels within a dimension.
*   Dimension values on the same hierarchy level within a dimension.
*   Level values on different hierarchy levels.
*   Level values on the same hierarchy level.

When you select multiple level and dimension values on your dimension filters and use Cell Explorer, we now:

*   Display all dimensions, including cube dimensions and other dimensions, in the Dimensions section and all attributes in the Filters section.
*   Display new Rolls up to links in the Account and Time sections if the parent account exists and you have permission to access that data.
*   Display new Show All and Hide All links so you can control whether you see all the values for a level or dimension. We only display these links when you select 5 or more values in a level or dimension.
*   Hide the Suppress rows if all zeros or blank check box on the Cell Explorer because we suppress by default for multiselect. We continue to display this check box if you select 1 level or dimension value and use Cell Explorer.
*   Rename the Level section to Levels.

## Change Log

Multicoordinate Support for Cell Explorer

We now deliver this feature to your Preview tenant and update the Release Note Type from Coming Soon to Feature.

Preview Date: 2025-08-16. Production Date: 2025-09-20.

## Related Information

Concept: Explore Cell and Row Details

## Version-Specific Overrides for Linked Accounts

Preview Date: 2024-10-11. Production Date: 2025-12-12.

With the 2025R2 release, we make version-specific overrides for linked accounts generally available. All customers can now use options in the account settings to enable linked accounts for data entry in specific plan versions.

## Business Benefits

The ability to override links for specific versions provides flexibility in the model. With these options you can leverage the links for certain versions when it suits your business needs. In other versions you can enable the data entry override so that you can:

*   Import data into the account.
*   Populate data into the account with Predictive Forecaster.
*   Enter data into the account on sheets.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 31

| Releases | 31

## Changes

We provide these new options in the Link Filters section of the account settings:

*   Override links for specific version: We enable you to select this check box to display the override fields for the account.
*   Link Version Selector: We enable you to select a plan version for the override.
*   Override Link Setting: We provide these options: *None* to keep the link, and *Data Entry* to enable imports and data input on sheets.

We provide the new options in the account settings of the target accounts that support links:

*   Cube Standard.
*   Cube-Entered.
*   General Ledger.
*   Custom.

After you set up the override, you can enter data:

*   In sheets.
*   With manual imports.

You can load and export the data through:

*   Loaders in Design Integrations for only general ledger and custom accounts.
*   `customReportValues` and `exportData` APIs.

At this time, we show plan data during actuals overlay periods when a linked account has both of these settings:

*   Enable Actuals for Link for the Actuals Overlay setting.
*   *Data Entry* for the Override Link Setting.

You can now import data into data entry linked accounts in the current version for cube and standard accounts.

## What Do I Need to Do?

To enable the feature for a linked account:

1.  Go to Modeling.
2.  Click:
    *   Custom Account.
    *   General ledger.
    *   Edit a cube sheet and click Cube Accounts from the Sheet Summary page.
3.  Select the linked account from the account list.
4.  Click the check box for Override links for specific version.
5.  Complete the other fields that display.
6.  Save.
7.  Load or enter data.

## What Happens If I Do Nothing?

The options remain available to use when you need it.

## Change Log

Version-Specific Overrides for Linked Accounts

We update the delivery dates for the Preview and Production redelivery for this functionality from 2025-11-21 to 2025-12-12.

Preview Date: 2025-12-12. Production Date: 2025-12-12.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 32

| Releases | 32

Version-Specific Overrides for Linked Accounts

We now redeliver this feature to your Preview and Production tenants.

Preview Date: 2025-11-21. Production Date: 2025-11-21.

Version-Specific Overrides for Linked Accounts

We revert this functionality from Preview and Production tenants.

We plan to redeliver this functionality in a future service update.

Data Imports Into Data Entry Linked Accounts

We update the note to document the ability to import data into data entry linked accounts in the current version for cube and standard accounts.

Preview Date: 2025-09-20. Production Date: 2025-09-20.

**Related Information**

2024R2 Feature Release Note: Version-Specific Overrides for Linked Accounts

## Translated Currencies for Actuals Versions

Preview Date: 2025-08-16. Production Date: 2025-09-20.

With the 2025R2 release, we make translated currencies generally available. All customers can now use translated currencies to load actuals data in a specific currency for all levels. You can load your data in the local currency of each leaf level as usual. In addition, you can load the same set of data in a single currency for all levels.

### Business Benefits

When your source systems store granular, transaction-specific exchange rates, you can get variances between the actuals in your source and the actuals in Adaptive Planning because of how we convert the data between currencies. Loading translated actuals eliminates the conversion of the actuals data.

With translated currency, you load your actuals already translated from your source. As a result, the actuals in Adaptive Planning exactly matches the actuals in the source for the currency.

In addition, reports pull from the actuals loaded in the currency, removing the need to calculate conversion with exchange rates.

### Changes

In the Version area of Modeling, we provide a new Enable Translated Currency check box in the settings within sub-versions of actuals. When you enable this check box, the Selected Currencies drop-down prompt enables you to select 1 currency as a translated currency.

In Design Integrations, we update your ability to import actuals data into the version that you enabled for translated currencies. You have the option to select:

*   The nested currency within the sub-version to load the full data set in a single currency for all levels.
*   The sub-version itself to load data as usual in the local currency of each level.

We also update these APIs:

*   v40 of the exportVersions: We add the `currencyVersions` attribute in the Include element to indicate if the nested currency of the sub-version is included in the response.

*   v40 of the importStandardData: The API supports imports to the sub-version for the currency.

We also enable you to set up translated currency from the financial planning configuration manager task in Workday. We provide these new fields:

*   Translated Currency on the Currency page enabling you to select up to 1 translated currency.

©2026 Workday, Inc. All rights reserved  reserved   reserved     reserved      reserved       reserved        reserved         reserved          reserved           reserved            reserved             reserved              reserved               reserved                reserved                 reserved                  reserved                   reserved                    reserved                     reserved                      reserved                       reserved                        reserved                         reserved                          reserved                           reserved                            reserved                             reserved                              reserved                               reserved                                reserved                                 reserved                                  reserved                                   reserved                                   ...... Workday Proprietary and Confidential

## Page 33

| Releases | 33

• Account Translation Rule Set on the Actuals page enabling you to select the rule set for mapping translation rate types to ledger accounts.

When you enable translated currencies on versions, we continue to display values using local currencies for each level on sheet data and Explore Cell on sheets.

When you enable translated currencies on versions and explore cells in these areas, we now display values using the reporting currency of those cells:

• Dashboards.
• OfficeConnect.
• Web Reports.

**What Do I Need to Do?**

To see if your instance is eligible for this feature, a Named Support Contact must contact us. See Reference: Contact Us.

**Examples**

Your instance uses both USD and EUR. For the sub-version, Ledger Import, you enable translated currencies and select USD as the translated currency. Now, you can load your entire actuals data set in USD from your source system.

In Integration, when you select Ledger Import version for importing your actuals data, you have the option to select the USD currency, which displays nested under the Ledger Import version.

Later, you build a report in USD and pull the appropriate data in the currency of the report, without the conversion of data with exchange rates.

**Related Information**
2024R2 Feature Release Note: Translated Currencies for Actuals Versions
Concept: Currencies and Exchange Rates
Concept: Translated Currencies
Reference: Settings for Actuals Versions

## Machine Learning Predictive Forecaster

Preview Date: 2025-08-16. Production Date: 2025-09-20.

With this release, we continue to enhance predictive forecasters by automatically filling out fields by default when you create and edit forecasts. We also now enable you to use the ARIMA algorithm and provide improved forecast explanations through the feature impact chart.

**Business Benefits**

This makes it easier to create forecasts by automatically populating key fields, reducing manual entry and simplifying the setup process for less experienced users.

This enhances forecasting accuracy by enabling you to use the ARIMA algorithm to generate more precise forecasts by accounting for various data patterns and unusual events.

This improves forecast explainability by providing a new feature impact chart that helps you better understand factors and how the levers (regressors) you attach impact your forecast.

**Changes**

When you create or edit forecasts on the Predictive Forecaster page of Model Management, we now automatically populate some fields when you either:

• First create this forecast.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 34

| Releases | 34

• Enter a value on the Sheet field.
• Reset all fields on this page because you selected a different sheet or forecast version.

When you first create the forecast, we automatically populate these fields:
• Forecast Version
• Accuracy Metric
• Actuals Version
• Plan Version
• Autodetect Seasonality

When you enter a value on the Sheet field for the first time, we automatically populate these fields:
• Forecast Start Period
• Forecast End Period
• Levels
• Dimensions
• Actuals Start Period
• Actuals End Period

When you reset all fields on this page because you selected a different sheet or forecast version, we automatically populate these fields:
• Forecast Start Period
• Forecast End Period
• Levels
• Dimensions
• Actuals Start Period
• Actuals End Period

We update the tooltip on the **Dimensions** field.
We add *ARIMA* as an option on the Algorithm field.

We now display new confirmation dialogs when you change the values on these fields to warn you that the action resets all related fields to their default values:
• Sheet
• Forecast Version

On the **Confidence Metrics** tab of the **Forecast History** page, we display a new Feature Impacts chart.

## Change Log

### Feature Impacts Chart

We update the note to document the new Feature Impacts chart on the Confidence Metrics tab of the Forecast History page.
Preview Date: 2025-08-16. Production Date: 2025-09-20.

### ARIMA Algorithm

We update the note to document the new *ARIMA* option on the Algorithm field when you create or edit forecasts on the Predictive Forecaster page of Model Management.
Preview Date: 2025-08-16. Production Date: 2025-09-20.

## Related Information

Setup Considerations: Predictive Forecaster
Create Machine Learning Forecasts

©2026 Workday, Inc. All rights reserved  rights reserved   rights reserved     rights reserved      rights reserved       rights reserved        rights reserved         rights reserved          rights reserved           rights reserved            rights reserved             rights reserved              rights reserved               rights reserved                rights reserved                 rights reserved                  rights reserved                   rights reserved                    rights reserved                     rights reserved                      rights reserved                       rights reserved                        rights reserved                         rights reserved                          rights reserved                           rights reserved                            rights reserved                             rights reserved                              rights reserved                               rights reserved                                rights reserved                                 rights reserved                                  rights reserved                                   rights reserved                                    rights reserved                                    ......                                         &

## Page 35

| Releases | 35

## Ask Workday for Adaptive Planning

Preview Date: 2025-08-29. Production Date: 2025-09-20.

With this release, we introduce Ask Workday for Adaptive Planning (Ask Workday). Ask Workday:
* Is an artificial intelligence (AI) interface that enables users to interact with Adaptive Planning using natural language.
* Includes Contextual Help which provides which provides a conversational interface to enable you to quickly access information from Adaptive Planning documentation.

### Changes

With Ask Workday, you can now:
* Ask questions in natural language and access relevant help exactly when needed.
* Receive concise, context-aware answers without disrupting your workflows.
* Use a "Help me find an answer" prompt on the welcome screen to discover relevant questions.

In addition, Ask Workday provides:
* Type-ahead recommendations
* Smart prompt suggestions
* Response feedback
* Full screen mode

### Business Benefits

Ask Workday:
* Enables faster, more strategic decisions by uncovering insights and suggesting next steps in context.
* Boosts productivity and user adoption by making advanced planning tools intuitive, conversational, and accessible to all skill levels.
* Streamlines access to Adaptive Planning information by combining comprehensive search with contextual analysis.
* Provides contextual how-to information for critical tasks such as:
    * Setting up alternate calendars
    * Creating Machine Learning (ML) forecasts
    * Reviewing scenario changes
    * Changing default currencies
* Boosts productivity and reduces dependency on support teams by making learning intuitive and seamless.

### What Do I Need to Do?

Assign the <u>Access Ask Workday for Adaptive Planning</u> permission to:
* Administrators so they can enable Ask Workday for an Adaptive Planning instance. After it is enabled, the **Ask Workday** icon displays on the global toolbar across the application.
* End users so they can view the **Ask Workday** icon on the global toolbar for accessing Ask Workday.

### What Happens If I Do Nothing?

Without the <u>Access Ask Workday for Adaptive Planning</u> permission assigned:
* Administrators can't enable Ask Workday for an Adaptive Planning instance.
* End-users can't view the **Ask Workday** icon for accessing Ask Workday for Adaptive Planning.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 36

| Releases | 36

## Change Log

Permission Name and Icon Change

We rename the *Access Workday Assistant for Planning* permission to now *Access Ask Workday for Adaptive Planning*.

We also replace the sparkle icon with the **Ask Workday** icon.

We've updated these sections to reflect these latest changes:

*   What Do I Need to Do?
*   What Happens If I Do Nothing?

We update this note to inform you that:

*   This feature is now available in Preview.
*   We've updated the feature name.

## Planning Agent: Data Exploration

Preview Date: 2025-11-21.

With this release, we introduce the Planning Agent, a new AI-powered assistant that transforms how you interact with your data in Workday Adaptive Planning. The first available agent skill, Data Exploration, uses Generative and Conversational AI to provide contextual analysis and insights on open matrix reports. You can now use natural language prompts or guided questions to instantly summarize data, identify trends, detect anomalies, and perform deep variance analysis.

### Business Benefits

This feature helps you:

*   Drastically reduce the time spent manually searching for and calculating the drivers of variances, allowing you to focus on strategic interpretation and action.
*   Enable business users, budget owners, and other stakeholders to conduct their own sophisticated analyses without relying on FP&A or system administrators, fostering broader data literacy.
*   Gain immediate, contextual insights to quickly identify root causes, surface trends, and drive more informed decisions across your organization.
*   Streamline the creation of presentations by instantly generating narrative summaries and visualizations that explain key business drivers.

### Changes

When viewing a matrix report, you'll find a new **Ask Workday** icon in the toolbar, which opens the **Data Exploration** sidebar. From here, you can:

*   Use pre-defined prompts like **Summarize this report** and **Detect anomalies** or type open-ended questions to analyze your data.
*   Receive AI-generated responses that include narrative summaries, charts, and tables.
*   Change the chart type for visualizations and hover over data points for more detail.
*   Download summaries and visualizations directly to a PowerPoint presentation.

The Data Exploration skill includes a powerful variance analysis capability that allows you to:

*   Automatically identify the top five variances in a report or set custom thresholds to highlight significant variances.
*   Analyze a variance to instantly determine the primary dimensions (like Cost Center or Product) driving the result.
*   Break down a variance by other contributing dimensions to explore it from every angle.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 37

| Releases | 37

## What Do I Need to Do?

Note: To request this feature, contact your Named Support Contact (NSC) to submit a Workday Customer Care request. After confirming that you're eligible, we'll enable the feature.

To use the Planning Agent, an administrator must assign you the *Access Ask Workday for Adaptive Planning* permission.

## What Happens If I Do Nothing?

If you do nothing, you won't have the required permission. The **Ask Workday** icon won't be visible on matrix reports, and you won't be able to use the Data Exploration feature.

## Change Log

Planning Agent: Data Exploration

We update this note to inform you:

*   The feature is now available to everyone in preview. See Planning Agent: Data Exploration on page 18 2026R1 release notes.
*   We removed the auto-completed suggestions that display when you place your cursor in the Ask Workday for Adaptive Planning prompt. You can no longer select the pre-defined prompts. This capability was available in the limited availability version.

Planning Agent: Data Exploration

We correct this note to inform you that this feature is currently released as limited availability. Accordingly, we have updated the **What Do I Need to Do?** section to include information about how to request the feature.

## Related Information

../../../model-administration/managing-the-model/Intelligent-Planning/Planning-Agent/concept--planning-agent.dita

## Tasks and Task Runs in Adaptive Planning Integration

Preview Date: 2025-08-16. Production Date: 2025-09-20.

With this release, we improve the task and task run management user experience in Adaptive Planning Integration by consolidating both functionalities into 1 page, adding a switch so that you can view either tasks or task runs, adding filters, and adding a button that you can use to create tasks.

### Business Benefits

This makes it easier and faster to view and manage your tasks and task runs, saving you time and effort.

### Changes

We rename the **All Tasks** page in **Manage Integrations** of the **Integration** area to **Tasks**.

We add a new switch on the **Tasks** page in **Manage Integrations** that enables you to toggle between viewing:

*   The list of tasks.
*   Historical task runs.

When you view task runs on the page, we display:

*   Name
*   Type
*   Status

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 38

| Releases | 38

* Next Scheduled Run
* Last Run
* Duration
* Frequency

On the Tasks page for both views, we add the Status filter.

**What Happens If I Do Nothing?**

If you do nothing, you retain your existing tasks, task runs, and their histories.

**Related Information**
View and Run Tasks

## Cloud Data Connect Pipeline Drill Through

Preview Date: 2025-08-16. Production Date: 2025-09-20.

With this release, we enable you to drill through Cloud Data Connect (CDC) pipelines and see granular contextual or transactional data.

**Business Benefits**
You can now access transactional details within your cloud data warehouse to make informed planning decisions without needing to:
* Navigate to your cloud data warehouse.
* Load and store the data in Adaptive Planning.

This helps optimize your integrations and data movement by:
* Only needing to load the aggregate data you need for planning into Adaptive.
* Still retaining access to contextual and granular details of those aggregates through live-queries to your cloud data warehouse.

**Changes**
On the **Setup Pipeline** pages, we add a new:
* Warning message on the **Pipeline Details** page that the version and the sheet need to be unique per pipeline. This ensures there is a single source for Drill Through to query but allows you to create a draft.
* **Drill Through Table** field so you can select the table that contains the data you want to drill through for the loaded aggregate data.
* Error message on the **Review** page when a pipeline already exists to prevent a connection of pipelines with the same destination.

When you download a cube or standard sheet, you can now select **Drill Through to Data** at the leaf node level on a drillable sheet cell or from an explore cell then a **Transactions** pop-up window displays. The Drill Through query leverages live queries to the Drill Through table you configured for the pipeline to return the data displayed in the pop-up window. You can also optionally export drill-through data relating to the cell that you are drilled into.

We add a new *Drill Into Cloud Imported Numbers* permission.

Note: Drill Through to Data is only supported for CDC managed pipelines, not CDC connections managed through Design Integrations.

**What Do I Need to Do?**
Add the permission *Drill Into Cloud Imported Numbers* to your permission set.

©2026 Workday, Inc. All rights reserved
Workday Proprietary and Confidential

## Page 39

| Releases | 39

To use Cloud Data Connect Pipeline Drill Through on a new pipeline:

1. Select **Integration** from the main menu.
2. Select **Setup Pipeline**.
3. Set up Cloud Data Connect. See **Set Up Cloud Data Connect** in the **Related Links** for more information.
4. Select **Drill Through Table** on the **Configure Connection** page.

To use Cloud Data Connect Pipeline Drill Through on an existing pipeline:

1. Select **Integration** from the main menu.
2. Select **Manage Pipelines**.
3. **Duplicate** the pipeline.
4. Select **Drill Through Table** on the **Configure Connection** page.
5. Select **Save and Exit** to save the pipeline as a draft.
6. **Delete** the original pipeline.
7. Navigate to the **Setup Pipeline** page.
8. Select the pipeline you saved as a draft.
9. On the **Review** page select **Complete** to connect the pipeline.

## What Happens if I do Nothing?
With Workday 2025R2 and beyond, all managed pipelines must have unique destinations (version and sheet), when creating, editing a draft, or duplicating a pipeline.

### Related Information
Set Up Cloud Data Connect

## Pipeline Task Scheduling

Preview Date: 2025-08-16. Production Date: 2025-09-20.

Workday now enables you to create and manage schedules to automatically run Cloud Data Connect pipeline integration tasks. From a pipeline task page, you can create multiple schedules, view run histories, and initiate tasks manually.

### Business Benefits
This enhancement enables you to automate your pipeline tasks, reducing the need for manual intervention. Scheduling tasks ensures timely data integration and improves operational efficiency.

### Changes
When you select a pipeline task, the task page now includes two new tabs: **Info : **Info & Schedules** and **Recent Runs**.

On the **Info & Schedules** tab, you can:
* View the pipeline name, data source, and planning destination.
* Create up to 5 schedules for the task. You can define a name, frequency (Daily, Weekly, or Monthly), time, and time zone, and set the schedule status to Active or Inactive.
* Manage existing schedules to **Edit**, **Pause**, or **Delete** a schedule.
* Initiate a run manually.

On the **Recent Runs** tab, you can:
* View the history of previous task runs, including parameters like period range and version.
* Initiate a run manually.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 40

| Releases | 40

**What Do I Need to Do?**
Pipeline task scheduling feature is automatically available. No action is required.
To use pipeline task scheduling feature:
1. Navigate to an existing pipeline task. The page opens to the **Info & Schedules** tab by default.
2. Click **Add Schedule**.
3. Define the name, frequency, time, and status for the schedule to run automatically.

**What Happens if I do Nothing?**
If you do nothing, the new tabs: **Info & Schedules** and **Recent Runs** will appear on the pipeline task page, but Workday won't create any schedules. You must continue to run your pipeline tasks manually and won't gain the benefit of automation.

**Collaborate within Adaptive Planning**
Preview Date: 2025-08-16. Production Date: 2025-09-20.
With this release, we introduce in-application chat capabilities on dashboards, user tagging, and expanded notifications.

**Changes**
End users can:
• Initiate and participate in conversations directly on dashboard widgets.
• Tag specific users in comments to direct questions or attention, triggering notifications for the tagged individuals.
• Receive notifications for tagged comments within Adaptive Planning notifications and through integrated workplace chat applications such as Slack.
• Navigate directly from notifications to relevant comments and data context within Adaptive Planning.
• Use a filter icon associated with comments to automatically adjust their dashboard filters to match the exact data view present when the comment was originally made.
• Edit their own comments, sort comments, and delete comment threads.
Admin users can use all the chat capabilities that end-users can. In addition, they can delete any comments from end-users.

**Business Benefits**
• Eliminates the need for multiple external communication methods such as emails, separate chat applications, or spreadsheets by enabling direct, in-context discussions within Adaptive Planning.
• Enhances data alignment and accuracy by tying conversations directly to dashboard widgets. The ability to automatically align filter settings to the context of a comment helps prevent misinterpretations and ensures all collaborators are viewing the same data.
• Strengthens data security and compliance as discussions about sensitive planning data are conducted securely within the Adaptive Planning established user access framework.
• Fosters faster decision-making by enabling immediate, targeted communication and quick resolution of questions or discrepancies directly where the data resides.

**What Do I Need to Do?**
You need these permission assigned to view, create, and delete comments on dashboards:
• *Access Dashboard*: Allows users to view, create, and delete their own comments.
• *Edit Dashboard*: Allows users to delete comments from other users.
Users with *View Dashboard* permission and access to the widget on a perspective can view all conversations related to the widget.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 41

| Releases | 41

**What Happens If I Do Nothing?**

If you don't have the required dashboard permissions, you can't use the Comments feature.

**Change Log**

We update this note to add more information for the user permissions documented in the **What Do I Need to Do?** section.

**Workday Adaptive Planning and NetSuite Integration**

Preview Date: 2025-08-16. Production Date: 2025-09-20.

If you currently have NetSuite Data Source configured, we inform you about critical changes to the NetSuite policy regarding the release and support of their SOAP Web Services endpoints. These changes can impact existing Workday Adaptive Planning integrations. We advise you on necessary actions to ensure continued NetSuite support.

**Changes**

Oracle NetSuite has updated its SOAP Web Services endpoint release and support policy, effective with the NetSuite 2026.1 release. The key changes include:

* Endpoint Release Policy: New SOAP endpoints will no longer be released with every NetSuite update, but only when deemed necessary for business, technical, or other critical reasons.

* Endpoint Support Policy: All SOAP web services endpoints will be supported for three years from their release date. With each new NetSuite release, the oldest endpoint will be automatically retired.

**Business Benefits**

By proactively upgrading NetSuite, you can help:

* Ensure the uninterrupted operation and stability of your Workday Adaptive Planning integrations, preventing potential service disruptions.

* Avoid situations where integrations cease to work as intended due to the discontinuation of older NetSuite SOAP web services endpoints.

**What Do I Need to Do?**

If you have configured NetSuite Data Source, we recommend that you review your current NetSuite version and plan for an upgrade to the latest supported NetSuite 2025.1 version.

If you have NetSuite basic integrations, then there's no impact to you.

**What Happens If I Do Nothing?**

If you have configured NetSuite Data Source and you don't upgrade to the latest supported NetSuite 2025.1 version, your integrations can stop working as intended due to the discontinuation of older SOAP web services endpoints.

**Adaptive Planning Notifications**

Preview Date: 2025-08-16. Production Date: 2025-09-20.

We now integrate Adaptive Planning Notifications with Slack to enable users to access and manage their notifications in Slack.

Note: This feature supports:

* Adaptive Planning instances connected to Workday tenants.

* Adaptive Planning Multi-Instances. You must configure each instance individually for notifications.

©2026 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 42

| Releases | 42

## Changes

- A new **Notifications Preferences** link on the **Administration** page. Administrators can use this link to setup the integration of Adaptive Planning Notifications with Slack.
- A new **Connections** section on the **Manage Notifications** page. After their Adaptive Planning instances are integrated with Slack, end users can connect to Slack from here and receive their Adaptive Planning notifications in Slack.

## Business Benefits

This feature:

- Significantly enhances communication, collaboration, and efficiency.
- Creates a more connected and productive work environment.

## What Do I Need to Do?

To integrate Adaptive Planning instances with Slack, administrators need to complete these steps:

1. From the Adaptive Planning main menu, click **Administration**. The Administration page displays
2. From the **System** menu, click the **Notifications Preferences** link. The Slack app displays on the Notifications Setup page.
3. Click **Add**. For only the first 10 Adaptive instances that are integrated with Slack, a Slack approval page displays.
4. If a Slack approval page displays, click **Allow**.
5. Sign in again to Adaptive Planning to authenticate as the admin user requesting the integration. After a successful integration, a notification informing that the Adaptive Planning instance was integrated with Slack display on these pages:
    - **Notifications Setup**
    - **Manage Notifications**

End users need to complete these steps:

1. In Adaptive Planning, from the **Manage Notifications** page, click **Connect** for Slack. You're prompted to check your Slack messages to complete the connection.
2. In Slack, under **Apps**, click **Workday Adaptive Planning**. A "Welcome to Workday Adaptive Planning for Slack" message displays.
3. Click the **Connect your Adaptive Planning account to Slack** link. The Adaptive Planning sign-in page displays.
4. Sign in to Adaptive Planning for authentication purposes. The **Manage Notifications** page displays either a success message indicating that you're connected to Slack or an error message if the integration was unsuccessful.

## What Happens If I Do Nothing?

If the administrators and end users don't complete their respective integration steps to connect Adaptive Planning with Slack, users are unable to access and manage their notifications in Slack.

## Change Log

Support for Workday-Enabled Adaptive Planning Instances

Preview Date: 2026-04-10.

This feature now also supports Adaptive Planning instances that are connected to Workday tenants.

## Cube Governance: Account Property Update and Merge Sheet Limit

Preview Date: 2025-08-16. Production Date: 2025-09-20.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 43

| Releases | 43

We now enable you to update the **Read only on sheet** property for Cube Standard and Cube Assumption accounts in bulk.

We also introduce a new guardrail for merged cube sheets.

Changes

• You can update the **Read only in sheet** property in bulk using the Import or Export options available for making bulk changes to your account structure. Previously, we supported updating this property using only the Adaptive Planning user interface.

• If you already have 5 or more merged cube sheets, you will receive an error message when creating another one.

Business Benefits

These updates:

• Enable you to save time by updating the same property for multiple accounts at once.

• Avoid system performance issues.

What Do I Need to Do?

• The option to update the account property in bulk is available by default.

• The default guardrail value for merged cube sheets is five. To change this default value, you must contact Workday Custom Care.

Sheets Performance Evaluator

Preview Date: 2025-11-21. Production Date: 2025-11-21.

With this release, we enable you to evaluate account performance on your sheets for the selected versions and level.

Business Benefits

This enables you to quickly identify which accounts to optimize for faster sheet loads without the need to:

• Manually test your accounts.

• Submit a Support request.

• Rely on Workday Support to troubleshoot the accounts for you.

This saves you time and effort as you optimize your model.

Changes

We deliver a new **Performance Portal** page in the **Other Links** section of the **Planning Center**. You can use this page to select which versions, level, and sheet to evaluate. When you evaluate a sheet, we provide you with a downloadable spreadsheet with this information:

• Account code for each child account.

• Evaluation time in seconds.

What Happens If I Do Nothing?

If you do nothing, any user with access to the Planning Center can use the Performance Portal to evaluate sheet performance.

What Do I Need to Do?

Give the *Planning Center* permission to users who need access to evaluate sheet performance.

©2026 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 44

| Releases | 44

## Change Log

Sheets Performance Evaluator

We omitted this release note from the Production section of the 2025-11-21 service update.

Preview Date: 2025-11-21. Production Date: 2025-11-21.

## Related Information

The Next Level: Adaptive Planning: Performance Implications of Cold and Warm Cache

Concept: Model Design Best Practices

Reference: Performance and Usability of Modeled Sheets

Reference: Performance and Usability of Cube Sheets

## customReportValues API

Preview Date: 2025-08-16. Production Date: 2025-09-20.

We now enable you to apply time offsets to versions data directly using the `customReportValues` API for comparative analysis.

### Changes

To shift the timeline of reported values, you can now specify these optional parameters for the Version element in the `customReportValues` API:

*   Offset: The value by which you want to shift the time in the version.
*   Offset-strata: The granularity (year, quarter, month) for the time shift.

### Business Benefits

This feature provides flexibility and enhances your reporting and integration experiences.

### Examples

```xml
<tier type="ver">
<el id="2" />
<el id="3" offset="1" offset-strata="2" /> 
</tier>
```

### What Do I Need to Do?

To shift the timeline for your versions in reports, you must specify the Offset and Offset-strata parameters in the Version element of the `customReportValues` API.

### What Happens If I Do Nothing?

The API works as is. Specifying the new version parameters is optional, required only for comparative analysis purposes.

## Adaptive Planning Hubs

Preview Date: 2026-02-07. Production Date: 2026-03-14.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 45

| Releases | 45

With this release, we introduce Hubs, a new personalized and central location in Adaptive Planning. Hubs allow administrators to create intuitive, curated workspaces for users to organize, navigate, and interact with a collection of dashboards, sheets, reports, links, and tasks.

## Business Benefits

* Provides a single, unified workspace for planners, analysts, and managers, reducing the time spent navigating to different parts of the application.
* Administrators can create and share different hubs for specific functions (Finance Hub, Sales Hub) or processes, ensuring users only see the content most relevant to them.
* Users have immediate access to key instructions and pending workflow tasks, fostering faster, more informed decision-making.
* Respects all existing Adaptive Planning access rules and permissions, ensuring users can only view the data they are authorized to see.

## Changes

This feature introduces:
* The Hubs option in the main navigation menu.
* The ability to select a shared hub as the default home page from the user profile page.
* The ability to see a maximum of 3 recent hubs on the home page provided users have access to least 1 hub.
* The *Access Hubs* permission that enables users access to:
    * The Hubs option in the main navigation menu.
    * Hubs content shared with them.
* The *Edit Hubs* permission enables administrators to create, edit, clone, share, and manage all hubs.

## What Do I Need to Do?

1. The administrator must assign these hubs permissions to the appropriate users and groups:
    * Assign the *Access Hubs* and *Access Dashboards* permissions to all users and groups who need to view hubs.
    * Assign the *Edit Hubs* permission to administrators who are responsible for creating and managing hubs.
2. Administrators must actively build, configure, and share the hubs for end-users to access them.

## What Happens If I Do Nothing?

If you do nothing, your users don't see any changes to the navigation menu, and no new permissions become active. Your existing dashboards, reports, and workflows continue to function as they do today.

## Change Log

Update to Changes List

We updated the **Changes** section to accurately reflect the feature details.

Adaptive Planning Hubs

We update this note to inform you that:
* This feature is now available in preview for everyone.
* We removed the AI-powered performance summaries that were available in the limited availability version.
* We added the ability to see recent hubs from the home page.
* We added the *Access Dashboards* permission as a requirement for users and groups to view hubs.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 46

| Releases | 46

*   We updated these sections to reflect the latest product behavior and capabilities:
    *   Changes
    *   Business Benefits
    *   What Do I Need to Do?
    *   What Happens if I Do Nothing?

## Adaptive Planning Hubs

We correct this note to inform you that this feature is currently released as limited availability. Accordingly, we have updated the **What Do I Need to Do?** section to include information about who has access to the feature.

## Workday for Google Sheets

Preview Date: 2025-11-21.

With this release, we introduce Workday for Google Sheets™, a new add-on available in the Google Workspace Marketplace that enables you to connect directly to your Workday Adaptive Planning data within Google Sheets. This integration also includes Ask Workday for Adaptive Planning (Ask Workday), an AI-powered feature that lets you ask questions about your data in natural language.

### Business Benefits

This feature streamlines your planning and reporting processes by enabling you to:

*   Work with live Adaptive Planning data in the familiar, collaborative environment of Google Sheets, reducing the need to switch between applications and manually export data.
*   Use Ask Workday to quickly analyze your data, uncover key trends, and spot anomalies without needing deep technical expertise.
*   Easily create and share reports within Google Workspace and export AI-generated summaries and charts directly to Google Slides or PowerPoint to build presentations faster.
*   Use the Writeback capability to make planning updates directly from Google Sheets. You can modify the data using familiar functions like formulas and copy-paste before submitting it back to Adaptive Planning.

### Changes

You can now:

*   Use a new sidebar in Google Sheets to build reports by adding accounts and other dimensions to rows, columns, and filters. You can rearrange elements using drag-and-drop and refresh to pull the latest data from Adaptive Planning.
*   Explore data hierarchies directly on the report without changing the report definition. You can expand parent elements to see immediate children, all descendants, or only leaf-level members.
*   Apply hierarchy rules to parent elements in the report builder to consistently see the custom hierarchy across the entire report.
*   After expanding an element, select specific members to keep or remove from the report, creating a custom view.
*   Write back data changes directly from supported cell intersections to your Adaptive Planning instance. Audit trails tracks these updates.
*   Analyze your reporting data using Ask Workday. You can use freeform questions or suggested prompts
*   Use these permissions to control access:
    *   Access Workday for Google Sheets
    *   Access Ask Workday for Adaptive Planning

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 47

| Releases | 47

## What Do I Need to Do?

Note: To request this feature, contact your Named Support Contact (NSC) to submit a Workday Customer Care request. After confirming that you're eligible, we'll enable the feature.

After the feature is enabled, administrators and users must complete these steps:

For Google Workspace and Adaptive Planning administrators:

1. Install the Add-On: A Google Workspace administrator must first add Workday for Google Sheets to the allowlist in the <mark>Google Workspace Marketplace</mark> and then install it for the appropriate users or organizational units.
2. Assign Permissions: In Adaptive Planning, go to **Administration > Permission Sets**. Edit the relevant permission set and select the checkboxes for *Access Workday for Google Sheets* and *Access Ask Workday for Adaptive Planning* to grant users access.

For end users:

1. Open the add-on: In a Google sheet, go to **Extensions > Workday for Google Sheets > Workday**.
2. Add your tenant:
   a. Click **Add Tenant** and select either **Adaptive Planning** (for standalone instances) or **Adaptive Planning via Workday**.
   b. Enter the required details, such as the tenant name, API endpoint URL, and Authorization URL provided by your administrator.
3. Sign in: After saving the tenant, select it from the list and click **Sign In** to connect to your Adaptive Planning data.

## What Happens If I Do Nothing?

If you do nothing, the Workday for Google Sheets add-on will not be available to users in your organization. Users will not be able to build reports in Google Sheets, use the writeback functionality, or access Ask Workday for Adaptive Planning.

## Change Log

Workday for Google Sheets

We correct this note to inform you that this feature is currently released as limited availability. Accordingly, we have updated the **What Do I Need to Do?** section to include information about how to request the feature.

## Related Information

<mark>Concept: Workday for Google Sheets</mark>

## 2025R2 Planning for HCM and Financials Release Notes

### Planning for HCM and Financials

These features require you to have additional SKUs related to Human Capital Management or Financials.

### Headcount Planning Application: Top-Down Routing and Aggregate View

Preview Date: 2025-09-20. Production Date: 2025-09-20.

With this release, we enable you to configure your headcount planning process with a top-down routing of approvals. You can now use summarized views for preliminary headcount planning and initiate new planning cycles from existing headcount plans.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 48

| Releases | 48

## Business Benefits

This improves the efficiency, flexibility, and accuracy of headcount planning by providing a centralized and collaborative platform for managing planning cycles. It enables business leaders and broader business users to participate in the headcount planning process through connected data and business process.

By offering a summarized view of headcount, we streamline the preliminary planning process, saving time and reducing complexity for workforce planners and line of business leaders.

The ability to create new headcount plan events from existing plans provides greater agility, allowing organizations to adapt to changing business needs and initiate new planning cycles more efficiently.

## Changes

On the Shared Participation step of the *Headcount Planning* business process, we:

*   Rename the existing Manage Headcount Planning allowed action to Plan Headcount from Bottom Up.
*   We add a new Plan Headcount from Top Down allowed action.

On the initial prompt page for the **Configure Headcount Plan** task, we:

*   Add a new *New Headcount Plan Event* option that enables you to add a new plan event to an existing headcount plan.
*   Remove the *Edit Existing Headcount Plan* option.

On the **Configure Headcount Plan** and **Create Headcount Forecast** tasks, we:

*   Add a new **Select Views** section, enabling you to select which planning views to include on your headcount or headcount forecast plans.
*   Add a new **Create an event for this headcount plan** check box.
*   Add a new **Planning Organizations for This Event** section that we display after you select the new check box. This section includes a new **Routing** prompt, enabling you to select whether to plan from bottom up or top down.
*   Reorder some of the existing fields.

When you view headcount or headcount forecast plans, we now display a new Aggregate View switch that enables you to view and edit the plan using grids with summarized numbers.

On the existing Organization View, we move the direct reports count from the graph node to the details pane.

We display the existing view, and new switch and view, when you view headcount or headcount forecast plans using these My Tasks items:

*   Headcount Planning Event
*   Headcount Planning Participant Detail Event

On the **View Headcount Planning Configuration** report, we:

*   Add a new **Events** tab where you can add events, view events, and identify whether the events plan from bottom up or top down.
*   Add a new **Headcount Plan Status** field on the **Headcount Plan** tab.
*   Rename the existing **Headcount Plan Status** field on the **Headcount Plan** tab to **Background Job Status**.

We also add a new **Complete Headcount Plan** button on the report, enabling you to:

*   Close all headcount planning events on this headcount plan.
*   Make the headcount plan read-only.

We deliver a new **Participant for Subordinate Event** report field on the Headcount Planning Top Down Participant Detail Event business object (secured to the *Public Reporting Items* domain) that you can use in custom notifications. We also rename the existing **Manager for Superior Event** report field to **Participant for Superior Event**.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 49

| Releases | 49

## What Do I Need to Do?

On the Shared Participation step of the *Headcount Planning* business process, select *Plan Headcount* from *Top Down*.

Configure the workforce planning configuration manager feature with the *Use Plan and Execute Tasks* option selected.

To route My Tasks items to all planners and managers involved in the headcount planning process, assign them to security groups with access to these domains:

*   **Participate:** *Headcount Planning* domain in the Adaptive Planning for the Workforce functional area. Gives view and modify access on headcount and headcount forecast plans to the plan participant security groups.
*   **(Optional) Compensation Details:** *Headcount Planning* in the Adaptive Planning for the Workforce functional area. Gives view and modify access to users that need to view and modify compensation data on headcount plans and headcount forecast plans, and view data on reports. To enable users to change a position's supervisory organization, give those users modify access on both the current and new supervisory organization.

Ensure that you include all plan participant security groups on the Shared Participation Step of the *Headcount Planning* business process.

In Adaptive Planning, create these custom accounts with default formulas for the modeled sheet:

*   Attrition. Use this case-sensitive code: REPORT_TERMINATION
*   Ending Headcount. Use this case-sensitive code: REPORT_HEADCOUNT
*   Filled. Use this case-sensitive code: REPORT_HEADCOUNT_FILLED
*   Open. Use this case-sensitive code: REPORT_HEADCOUNT_OPEN
*   Planned. Use this case-sensitive code: REPORT_NEW_HIRE
*   Starting Headcount. Use this case-sensitive code: REPORT_STARTING_HEADCOUNT
*   Target Cost of Workforce. Use this case-sensitive code: TARGET_COST_OF_WORKFORCE
*   Target FTE. Use this case-sensitive code: TARGET_FTE
*   Target Headcount. Use this case-sensitive code: TARGET_HEADCOUNT

## What Happens if I do Nothing?

If you do nothing, you can continue to plan from the bottom up for your existing headcount plans.

If in progress headcount plans exist from before this feature delivers, you must now manually lock those plans versions in Adaptive Planning. Only headcount plans created after this feature delivers can use the new **Complete Headcount Plan** button.

## Change Log

### Participant Report Fields

We deliver a new report field and rename an existing report field. We omitted this change from the Wednesday publication of the 2025-09-20 service update.

Preview Date: 2025-09-20. Production Date: 2025-09-20.

### Aggregate View

We update the note to document aggregate view updates to the Configure Headcount Plan task, Create Headcount Forecast task, the headcount and headcount forecast plans, and the View Headcount Planning Configuration report.

Preview Date: 2025-09-20. Production Date: 2025-09-20.

Headcount Planning Application: Top Down Routing and Aggregate View

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 50

| Releases | 50

We update this release note to change the feature title from "Top-Down Headcount Planning" to "Headcount Planning Application: Top Down Routing and Aggregate View." We now deliver this feature to your Preview tenant and update the Release Note Type from Coming Soon to Feature.

Preview Date: 2025-09-20. Production Date: 2025-09-20.

**Related Information**

Steps: Set Up Headcount Planning

**Workforce Planning Configuration Manager**

Preview Date: 2025-08-16. Production Date: 2026-09-11.

With this release, we continue to enhance your workforce planning configuration managers by addressing inconsistencies in the output values for multi-instance fields on the roster sheet.

**Business Benefits**

This addresses inconsistences across integration runs.

**Changes**

Multi-instance report fields on rosters sheets now dynamically return the value with the lowest alphanumeric reference ID.

When you use the Manage Workforce Planning Configuration task to change a multi-instance report field on the roster sheet of an active workforce planning configuration manager, we now use an Extract Single Instance calculated field to return the value with the lowest alphanumeric reference ID.

**What Do I Need to Do?**

Make a change on your multi-instance report fields on your workforce planning configuration manager and activate the change.

**What Happens If I Do Nothing?**

If you do nothing, your existing and active workforce planning configuration managers with multi-instance report fields on roster sheets continue to return the values that they currently return. We only start returning the value with the lowest alphanumeric reference ID after the next time you change this report field on the workforce planning configuration manager and activate your changes.

**OfficeConnect Labels**

Preview Date: 2025-08-16. Production Date: 2025-09-20. Reversal Date: 2026-03-14.

We improve OfficeConnect for Financial Management.

**Changes**

We now introduce a new **Reference ID** label type value for most label types.

**Business Benefits**

Enables financial analysts or auditors to see audit related data points regarding the results of their financial reports.

**What Do I Need to Do?**

You must install the latest available version of OfficeConnect for the 2025R2 Release.

©2026 Workday, Inc. All rights reserved Workday Proprietary and Confidential


### Extracted images (54):
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/img_p1_1.png`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/img_p1_2.png`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_1.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_10.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_11.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_12.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_13.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_14.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_15.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_16.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_17.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_18.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_19.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_1_image_1_v2.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_2.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_20.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_21.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_22.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_23.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_24.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_25.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_26.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_27.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_28.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_29.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_3.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_30.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_31.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_32.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_33.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_34.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_35.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_36.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_37.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_38.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_39.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_4.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_40.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_41.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_42.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_43.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_44.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_45.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_46.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_47.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_48.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_49.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_5.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_50.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_51.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_6.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_7.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_8.jpg`
- `parsed-documents://20260430-073523-338130/Adaptive-Planning-Whats-New.pdf/images/page_9.jpg`