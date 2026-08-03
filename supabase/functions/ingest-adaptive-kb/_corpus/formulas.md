# Document parsed from: Adaptive_Planning_Formula_Documentation_2-3.pdf

## Page 1

| Modeling | 1041

1. From the nav menu, select **Formulas**.

2. Select the GL salaries account that should display the results of the Personnel sheet calculations.

3. Select **Set Formula > Formula Assistant**.

4. Use the `Formula Assistant` to create a formula linking the GL salaries account to the appropriate modeled account.

5. Select **OK**.

**Enter Headcount by Job Position**

The personnel sheet created from the template does not have a timespan element. Users are not required to enter values in all the plan months that headcount will be present. The user specifies plans by individual employee, and specifies each employee's start date, annual salary or hourly rate. The personnel sheet then calculates all of the resulting values in the appropriate time periods.

Sometimes budget managers want to plan groups of employees hired in certain time periods. For example, a user may want to plan for four new sales representatives to be hired in January, three more to be hired in March, and so on.

A solution to this is to have separate personnel sheets for different kinds of headcount planning. You can plan existing headcount on a personnel sheet, by person, as described above. Then, you can create a separate personnel sheet to accommodate future new hires by job position

**Formulas**

**Get Started with Formula Basics**
**Concept: Using Adaptive Planning Formulas**

Formulas enable you to:

* Save time by automating calculations in your model.

* Build values from drivers.

* Create complex interrelations among accounts.

Formula Assistant is available in all the places that you can enter formulas. We recommend that use Formula Assistant to avoid syntax errors.

**Different Places to Use Formulas**

We offer different ways to use formulas in your model:

* Ad hoc in sheets: Enter formulas in the cells of sheets to create ad hoc calculations similar to Excel. See Concept: Typing Basic Formulas in Sheet Cells on page 1047.

* Calculated accounts: Add formulas to accounts to calculate across levels. As an option, you can create different formulas per version. See Concept: Calculated Accounts on page 802.

* Shared formulas: Shared formulas work as calculated suggestions for accounts. You can create a different formula for each version and level. See Create Shared Formulas on page 1094.

* Report formulas: You can add formulas to reports to calculate the report values. Example: You can calculate totals from accounts that aren't in the same hierarchy. See Concept: Matrix Report Calculations on page 122.

You might prefer to use links instead of formulas as a way of moving and combining data. To compare and contrast calculated accounts, shared formulas, and links, see Reference: Linked Accounts Compared to Shared Formulas and Calculated Accounts on page 835.

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 2

| Modeling | 1042

## Common Usage Examples

<table>
  <thead>
    <tr>
      <th>Goal</th>
      <th>Formula Example</th>
      <th>Formula Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Calculate inventory turnover.</td>
      <td>Div (ACCT.5500, ACCT.1150)<br>5500: Account code for Cost of Goods Sold.<br>1150: Account code for Inventory.</td>
      <td>Divides the cost of goods sold by inventory.</td>
    </tr>
<tr>
      <td>Calculate raises on the first month of the fiscal year for each employee on the Personnel sheet.</td>
      <td>Iff<br>(this.Year.PositionOf(this.Month) = 1, ROW.ExpectedRaise, 0)</td>
      <td>If it's the 1st month of the year, apply the value of the Expected Raise account to this row. Otherwise, return a 0.</td>
    </tr>
<tr>
      <td>Calculate the percent of sales of service contracts to sales vehicles.</td>
      <td>Divf (ACCT.Sales[ProductType = ServiceContract],<br>ACCT.Sales[ProductType = Vehicle]) * 100<br><br>Product Type is a custom dimension.</td>
      <td>Divide the data tagged with Service Contract by the data tagged with Vehicle. Then, multiply by 100.</td>
    </tr>
  </tbody>
</table>

## Concept: Formula Building Blocks

### Terms to Describe Formulas

A formula has:

* Operands: The elements to be calculated. You separate operands with operators. Operands at Adaptive Planning include:
  * References: Accounts with modifiers, assumptions, rows (columns from modeled sheets).
  * Constants: Numbers or text values that are entered directly into a formula.
* Modifiers: Additional instruction that specifies the reference to specific time, level, dimension value, or attribute value.
* Operators: Specify the type of calculation to perform. You can use:
  * Symbols. Example: The asterisk (*) operator multiplies numbers. You can find most symbols in Formula Assistant or you can type them with your keyboard.
  * Functions: Templates with precise syntax that combine operands and operators. You must replace the variables with your own references, modifiers, and expressions. Example: For the rounding function, Round (N), replace the N with a complex calculation and the function rounds it to the nearest whole number.

In addition, these terms describe parts of a formula:

* Expression: Describes a specific part of a formula. Example: In this logical formula Iff ((ACCT.001 > ACCT.002, 1, 0), "ACCT > ACCT.002" is an expression.
* Term: The reference, combined with any modifiers. Example: ACCT.001 [time = this - 1] is a term.
* Syntax: The way that you must reference data in your model to create a valid formula. Example: To reference an account, the syntax is ACCT.<account_code>.
* Dot Notation: An advanced set of syntax rules that point to elements of your model and allow for additional functionality. The primary use case for dot notation is for Iff statements. Example: You can add this.Month.NumberOfDays < 30 to an Iff statement to apply a different calculation for the month of February.

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 3

| Modeling | 1043

## Understanding Syntax in the Documentation

A few notes on syntax in documentation:

- We use capital letters in parenthesis, like (N) or text inside chevrons, like <account_code> to indicate variables. You must replace the variables with valid constants, account references, or formula expressions.

- We use commas to separate terms, according to the standard of many countries. If your browser uses commas as decimal points, you must separate the terms with semicolons.

- We add spaces to make the formulas readable, although they're not necessary. You can also add spaces or leave them out of your formulas.

- We capitalize functions, such as Divf, and use all caps for elements, like ACCT, but formulas aren't case sensitive.

Example: The syntax for adding a level modifier to an account is ACCT.<code> [level = <level_code>]. You must:

- Use ACCT. to reference an account.

- Replace <code> with an actual account code. Make sure you remove the chevrons too.

- Use square brackets to define modifiers.

- Use level = to modify by level.

- Replace <level_name> with the actual code of a level and remove the chevrons.

## Operands: References and Constants

References are a type of operand. In Adaptive Planning, the reference pulls a value from somewhere else in the model into the formula. Example: You can reference an account. The account reference pulls in the value for that account for a specific version, level, and time. You can add these basic references to formulas:

<table>
  <tr>
    <th>Reference</th>
    <th>Syntax</th>
    <th>Example</th>
  </tr>
<tr>
    <td>General ledger, custom, or metric accounts.</td>
    <td>ACCT.>ACCT.&lt;AccountCode&gt;</td>
    <td>ACCT.6113<br>Where 6113 is the account code.</td>
  </tr>
<tr>
    <td>Cube and modeled accounts.</td>
    <td>ACCT.ACCT.&lt;SheetCode.AccountCode&gt;</td>
    <td>ACCT.RevenueCube.003<br>Where RevenueCube is the sheet code and 003 is the account code.</td>
  </tr>
<tr>
    <td>Assumption accounts</td>
    <td>ASSUM.ASSUM.&lt;AccountCode&gt;</td>
    <td>ASSUM.123<br>Where 123 is the account code.</td>
  </tr>
<tr>
    <td>Columns on a modeled sheet<br>Only available for modeled calculated accounts.</td>
    <td>ROW.ROW.&lt;column_code&gt;</td>
    <td>ROW.StartDate<br>Where StartDate is the column code for the Start Date field on the modeled sheet.</td>
  </tr>
<tr>
    <td>Spread and value lookups in modeled sheets<br>Only available for modeled calculated accounts.</td>
    <td>ROW.ROW.&lt;lookup_name&gt;</td>
    <td>Row.BenefitLookup<br>Where BenefitLookup is the name of the value lookup table.</td>
  </tr>
<tr>
    <td>Constants</td>
    <td>Any number</td>
    <td>500</td>
  </tr>
</table>

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 4

| Modeling | 1044

You can also refer to cells on a sheet using the capture method, which populates the formula with the account and any present modifiers, such as time and levels. See Concept: Typing Basic Formulas in Sheet Cells on page 1047.

**Modifiers**

You can add precision with modifiers when you reference an account or row. Modifiers find a specific slice of the account's data. Example: You want the value of an account for a specific level or time period.

You add modifiers:

* Next to the account reference without spaces.
* Inside square brackets.
* Separated with commas or semicolons if you use commas for decimal points.
* Using the exact codes and names that exist in your model.

<table>
  <thead>
    <tr>
      <th>Modifier</th>
      <th>Syntax</th>
      <th>Example</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Time</td>
      <td>[time =  = &lt;strata_code&gt;]</td>
      <td>ACCT.001 [time = 2023]<br/>Where 2023 is the year rollup strata. Pulls the 2023 rollup value of the account.</td>
    </tr>
<tr>
      <td>Levels</td>
      <td>[level = &lt;level_code&gt;]</td>
      <td>ACCT.001 [level = sales]<br/>Where sales is the level code. Pulls the value of the account at the Sales level only.</td>
    </tr>
<tr>
      <td>Custom Dimension</td>
      <td>[&lt;dimension_code&gt; = ; = &lt;dimension_value_code&gt;]</td>
      <td>ACCT.001 [product = shirts]<br/>Where product is the dimension code and shirts is the dimension value code. Pulls the account data tagged with shirts.</td>
    </tr>
<tr>
      <td>Attributes</td>
      <td>[td>[&lt;attribute_code&gt; =_code&gt; =&lt;attribute_value_code&gt;]</td>
      <td>ACCT.001 [productgroup = tops]<br/>Where productgroup is the attribute of the Product dimension and tops is the attribute value.<br/>Pulls the account data tagged with any dimension values that corresponds to the tops attribute value.</td>
    </tr>
<tr>
      <td>Multiple Modifiers</td>
      <td>[td>[&lt;modifier1&gt; = &lt;code&gt;, &gt;, &lt;modifier2&gt; = &lt;code&gt;, &lt;modifier3&gt; = &lt;code&gt;]</td>
      <td>ACCT.001 [time = 2023, level = Sales, product = Shirts]<br/>Pulls the time rollup of 2023 for the Sales level for Shirts.</td>
    </tr>
  </tbody>
</table>

You can have multiple modifiers per reference, but you can only have 1 value per modifier. So, when you want to pull the value for more than 1 level:

* Wrong: ACCT.001 [level = Sales, Marketing]
* Wrong: ACCT.001 [level = Sales, level = Marketing]

©2025 Workday, Inc. All rights reserved
Workday Proprietary and Confidential

## Page 5

| Modeling | 1045

* Correct: ACCT.001 [level = Sales] + ACCT.001 [level = Marketing]

Adding a modifier might be all you need to do for an entire formula.

**Operators: Common Math Symbols**

Operators are math symbols that provide calculations. You can use basic mathematical formulas with the keys on your keyboard. In Formula Assistant, the first set of buttons in the toolbar provide simple math operators that you can insert into the formula in between terms.

The simplest operands of math formulas are numbers. The simplest operators are those that you can find on your keyboard. You don't need spaces between operands and operators, but you can add them to make the formula easier to read. You can also build simple math into more complex formulas that reference accounts and modifiers.

Here are some examples of simple math formulas that you can use:

<table>
  <tr>
    <th>Math Operator</th>
    <th>Example Formula</th>
  </tr>
<tr>
    <td>Addition (+)</td>
    <td>ACCT.001 + ACCT.002</td>
  </tr>
<tr>
    <td>Subtraction (-)</td>
    <td>ACCT.001 - ACCT.002</td>
  </tr>
<tr>
    <td>Multiplication (*)</td>
    <td>ACCT.001 * ACCT.002</td>
  </tr>
<tr>
    <td>Division (Divf)</td>
    <td>Divf (ACCT.001, ACCT.002)<br/>Divides ACCT.001 (the dividend) by ACCT.002 (the divisor)</td>
  </tr>
<tr>
    <td>Modulo (%)</td>
    <td>10 % 3<br/>Calculates the remainder of the quotient. Returns 1 because 10 divided 3 = 3 remainder 1.</td>
  </tr>
<tr>
    <td>Parenthesis ()</td>
    <td>(ACCT.001 + ACCT.002) * 12<br/>Dictates the order of operation: Add the accounts before multiplying by 12.</td>
  </tr>
<tr>
    <td>Round(N)</td>
    <td>Round (ACCT.001)<br/>Rounds to the nearest whole number. In the example if the value of ACCT.001 is 5.75, the formula returns 6.</td>
  </tr>
</table>

**Formula Functions**

A formula function is a template that uses different operators and variables. When you use a function, you replace the variables with references, constants, or full formula expressions. Functions rarely work alone; instead, you string functions together to build your formula.

Example: For the Expense account you want to use the value of last year and apply an inflation rate that you typically store in an assumption account. To avoid referencing blank cells, you can create an IF statement using a logical statement. The template looks like this: Iff (EXPR, T, F).

Here's how you can use the function to build formula:

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 6

| Modeling | 1046

<table>
    <tr>
        <th>Replace the Variable</th>
        <th>Example</th>
        <th>Description</th>
    </tr>
    <tr>
        <td>Replace *EXPR* with the IsBlank logical function creating a function within a function.</td>
        <td>Iff (isBlank (**N**), T, F)</td>
        <td>The either-or constant on which the True and False calculations rely.</td>
    </tr>
    <tr>
        <td>Replace *N* with the Inflation Rate assumption, which has the account code: infl.</td>
        <td>Iff (isBlank (**ASSUM.Infl**), T, F)</td>
        <td>If the Inflation Rate assumption is blank...</td>
    </tr>
    <tr>
        <td>Replace *T* with a calculation that triggers if EXPR is true.</td>
        <td>Iff (isBlank (ASSUM.Infl), **ACCT.this [time = this - 12] * (1.05)**, F)</td>
        <td>If the Inflation Rate assumption is blank, take the value of this account from 12 months ago and multiply by 1.05.</td>
    </tr>
    <tr>
        <td>Replace *F* with a calculation that triggers if EXPR is false.</td>
        <td>Iff (isBlank (ASSUM.Infl), ACCT.this [time = this - 12] * (1.05), **ACCT.this [time = this - 12] * ASSUM.Infl**)</td>
        <td>If the Inflation Rate assumption isn't blank, take the value of this account from 12 months ago and multiply it by the Inflation Rate assumption.</td>
    </tr>
</table>
In Formula Assistant, we categorize formula function into these groups:

- Mathematical

- Logical

- Date

- String

You can select a category and then prefill the formula field with the available templates. See Reference: Formula Functions on page 1082.

## Placement in the Grid

A formula exists in the grid of Adaptive Planning. A typical spreadsheet has 2 axes: Accounts and time. Accounts are down the rows and time is across the column. Each cell represents a specific intersection between the account and the time period.

In Adaptive Planning, the grid is multidimensional, meaning there are more than 2 axes beyond the 2 dimensional sheet you see on the screen. Example: The data for Revenue exists at the intersection of the Sales level, the Budget 2025 version, the Revenue account in the general ledger hierarchy, the Product custom dimension value Shirts, the time period for January 2025 and so on. When you refer to a data point in a formula, you are referring to each of the axes, or dimensions. Unless you specify the dimension, certain defaults apply, based on the location of of the formula. These dimensions contribute to each intersection of data:

<table>
    <tr>
        <th>Dimension</th>
        <th>Default in Reference</th>
    </tr>
    <tr>
        <td>Time and Level</td>
        <td>The same as the current location unless you modify your reference with time or level.<br><br>Example: A formula for ACCT.001 is ACCT.002 * 10.<br><br>For Jan 2024 the formula takes the value of ACCT.002 for Jan 2024. For Feb 2024, it takes the value from Feb 24, and so on, unless you specify something different for time in the formula.</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 7

| Modeling | 1047

<table>
  <tr>
    <th>Dimension</th>
    <th>Default in Reference</th>
  </tr>
<tr>
    <td></td>
    <td>For levels, the same is true. Calculations pull the values at the same level that is currently being calculated.</td>
  </tr>
<tr>
    <td>Currency</td>
    <td>The defined currency of the current level.</td>
  </tr>
<tr>
    <td>Account</td>
    <td>The current account unless you reference another account.</td>
  </tr>
<tr>
    <td>Each custom dimension</td>
    <td>The dimension value at the current location. If no dimension value exists at the current location, the default is the Uncategorized value.</td>
  </tr>
</table>

**Related Information**
**Reference**
FAQ: Level Modifiers for Formulas on page 1059
Reference: Level Modifiers for Formulas on page 1061

**Concept: Typing Basic Formulas in Sheet Cells**

You can enter formulas directly into the cells of sheets. We recommend that you always use Formula Assistant to avoid syntax error. Valid formulas have at least 1 operand. Operands pull data. The most basic formula calculation must have at least 1 operand and 1 operator. The most basic operand is a number. The most basic operator is a math symbol, such as plus or minus. Example: 1+1.

In most cases, you can add a formula to any editable, numeric cell. To type the formula in the cell, you must first click the cell. Then, you can:
* Type the equation directly in the cell.
* Type the equation into the formula bar at the top of the sheet.
* Click Formula Assistant button from the toolbar to build an error-free formula. See Use the Formula Assistant on page 1053 .

**Creating Basic Mathematical Equations**

You can use basic mathematical formulas with the keys on your keyboard. The simplest operands of simple math formulas are numbers. The simplest operators are those that you can find on your keyboard. You can also build simple math into more complex formulas that reference accounts and modifiers. In Formula Assistant, the first set of buttons provide simple math operators that you can insert into the formula.

When you enter formulas into cells:
* Always start with the equal sign.
* Keep it simple for best results.

For simple math, it's easier to enter the formula directly into the cell. However, when using Formula Assistant, you don't need to enter the equal sign.

<table>
  <tr>
    <th>Math Operators</th>
    <th>Example Formula</th>
  </tr>
<tr>
    <td>Addition</td>
    <td>Formula: =760+500<br>Result: 1260</td>
  </tr>
<tr>
    <td>Subtraction</td>
    <td>Formula: =760-500<br>Result: 140</td>
  </tr>
</table>

©2025 Workday, Inc. All rights reserved
Workday Proprietary and Confidential

## Page 8

| Modeling | 1048

<table>
  <thead>
    <tr>
      <th>Math Operators</th>
      <th>Example Formula</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Multiplication</td>
      <td>Formula: =760*10<br/>Result: 7,600</td>
    </tr>
<tr>
      <td>Division</td>
      <td>Formula: =divf(760,10) Result: 76</td>
    </tr>
<tr>
      <td>Percentage</td>
      <td>Formula =200*.05<br/>(5 percent of 200)<br/>Result: 10</td>
    </tr>
<tr>
      <td>Order of Operation</td>
      <td>Formula: =divf(70,10)*12<br/>Result: 84</td>
    </tr>
  </tbody>
</table>

## Using the Capture Method

You can create equations that reference other cells on the sheet. To do this you click on the cells, the same way you do with Excel with some minor differences:

You can't use the formula bar. Type directly into the cell. Always start the formula with an equal sign. You must type the operators and commas between cell captures. You can't use capture method from Formula Assistant.

For best results, use the capture method to grab the values. Then use the formula bar to check the syntax and add complexity.

<table>
  <thead>
    <tr>
      <th>Use Case</th>
      <th>Steps</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Capture a single cell.</td>
      <td>After the equal sign, click any cell on the sheet.</td>
    </tr>
<tr>
      <td>Capture cells and add math</td>
      <td>1. After the equal sign, click any cell on the sheet or type a number.<br/>2. Without adding space, type a simple math operator.<br/>3. Without adding space, click another cell or type a number.</td>
    </tr>
<tr>
      <td>Capture cells and add complexity</td>
      <td>1. After the equal sign, enter a math function, like divf.<br/>2. Type the opening parenthesis without adding space.<br/>3. Capture a cell or enter a number.<br/>4. Type a comma and add the next number or capture.<br/>5. Type the closing parenthesis.<br/>6. Check the formula bar to review what you have typed.<br/>7. Add more complexity from there if necessary.</td>
    </tr>
  </tbody>
</table>

## Adding References to Formulas

A formula reference points to data. When you point to data, you pull the value into the formula. On the left side of Formula Assistant, you can find all the account hierarchies with the correct account codes to help you add references in the appropriate syntax.

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 9

| Modeling | 1049

In the documentation, we provide the syntax with variables inside chevrons. You must replace the chevrons and the text inside with the real elements of your specific model.

These are the most common references and their syntax:

<table>
  <tr>
    <th>Reference</th>
    <th>Syntax</th>
    <th>Example</th>
  </tr>
<tr>
    <td>Accounts (general ledger, custom, metric)</td>
    <td>ACCT.ACCT.&lt;account_code&gt;</td>
    <td>ACCT.6113<br/>Where 6113 is the account code.<br/><br/>We don't recommend that you reference a system account from cube sheet cells. See FAQ: What's the best way to reference a system account from a cube sheet? on page 817</td>
  </tr>
<tr>
    <td>Accounts (cube and modeled)</td>
    <td>ACCT.ACCT.&lt;sheetcode.account_code&gt;</td>
    <td>ACCT.RevenueCube.003<br/>Where RevenueCube is the sheet code and 003 is the account code.</td>
  </tr>
<tr>
    <td>Assumption accounts</td>
    <td>ASSUM.>ASSUM.&lt;account_code&gt;</td>
    <td>ASSUM.123<br/>Where 123 is the account code.</td>
  </tr>
<tr>
    <td>Constants</td>
    <td>Any number</td>
    <td>500</td>
  </tr>
</table>

Adding Modifiers to Formulas

Modifiers filter the value that the formula pulls from the account or column. You can modify a reference by following it with square brackets. You then add the modifier inside the brackets. Example: ACCT.001[level=this]. Formula Assistant provides a series of drop-down prompts on the right side to help you add modifiers using the appropriate syntax.

Here are common modifiers:

<table>
  <tr>
    <th>Modifier</th>
    <th>Syntax</th>
    <th>Example</th>
  </tr>
<tr>
    <td>Time</td>
    <td>[time =  &lt;strata_code&gt;]</td>
    <td>ACCT.001 [time = 2023]<br/>Where 2023 is the year rollup strata. Pulls the 2023 rollup value of the account.</td>
  </tr>
<tr>
    <td>Levels</td>
    <td>[level = level = &lt;level_code&gt;]</td>
    <td>ACCT.001 [level = sales]<br/>Where sales is the level code. Pulls the value of the account at the Sales level only.</td>
  </tr>
<tr>
    <td>Custom Dimension</td>
    <td>[&lt;dimension_code&gt; = &lt;dimension_value_code&gt;]</td>
    <td>ACCT.001 [product = shirts]<br/>Where product is the dimension code and shirts is the dimension value code. Pulls the account data tagged with shirts.</td>
  </tr>
</table>

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 10

| Modeling | 1050

<table>
    <tr>
        <th>Modifier</th>
        <th>Syntax</th>
        <th>Example</th>
    </tr>
    <tr>
        <td>Attributes</td>
        <td>`[&lt;attribute_code&gt; = &lt;attribute_value_code&gt;]`</td>
        <td>ACCT.001 [productgroup = tops]<br>Where productgroup is the attribute of the Product dimension and tops is the attribute value.<br>Pulls the account data tagged with any dimension values that corresponds to the tops attribute value.</td>
    </tr>
    <tr>
        <td>Multiple Modifiers</td>
        <td>`[&lt;modifier1&gt; = &lt;code&gt;, &lt;modifier2&gt; = &lt;code&gt;, &lt;modifier3&gt; = &lt;code&gt;]`</td>
        <td>ACCT.001 [time = 2023, level = Sales, product = Shirts]<br>Pulls the time rollup of 2023 for the Sales level for Shirts.</td>
    </tr>
</table>
You can have multiple modifiers per reference, but you can only have 1 value per modifier. So, when you want to pull the value for more than 1 level:

* Wrong: ACCT.001 [level = Sales, Marketing]

* Wrong: ACCT.001 [level = Sales, level = Marketing]

* Correct: ACCT.001 [level = Sales] + ACCT.001 [level = Marketing]

## Creating Basic Iff Statements for Formulas

Iff statements have 2 possible outcomes. If an expression is true, the formula calculates 1 expression, but if it's false, the formula calculates the other expression. The basic syntax for Iff statements is: Iff (EXPR, T, F). Formula Assistant provides these buttons in the toolbar that you can insert into your expressions:

<table>
    <tr>
        <th>Button</th>
        <th>Example</th>
        <th>Description</th>
    </tr>
    <tr>
        <td>`=`</td>
        <td>Iff (ACCT.001 = 100, 0, 1)</td>
        <td>If the value of an expression equals the exact value of another expression.<br>The example calculates:<br>* 0 if the value equals 1000.<br>* 1 for all other values.</td>
    </tr>
    <tr>
        <td>`!=`</td>
        <td>Iff (ACCT.001 != 1000, 0, 1)</td>
        <td>If the value of an expression doesn't equal the value of another expression.<br>The formula calculates:<br>* 1 if the value equals 1000.<br>* 0 for all other values.</td>
    </tr>
    <tr>
        <td>`&lt;`</td>
        <td>Iff (ACCT.001 &lt; 1000, 0, 1)</td>
        <td>If the value of an expression is less than the value of another expression.<br>The formula calculates:<br>* 0 for all values less than 1000.</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 11

| Modeling | 1051

<table>
    <tr>
        <th>Button</th>
        <th>Example</th>
        <th>Description</th>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>• 1 for all values greater than or equal to 1000.</td>
    </tr>
    <tr>
        <td>&lt;=</td>
        <td>Iff (ACCT.001 &lt;= 1000, 0, 1)</td>
        <td>If the value of an expression is less than or equal to the value of another expression.<br>The formula calculates:<br>• 0 for all values of 1000 or less.<br>• 1 for all values greater than 1000.</td>
    </tr>
    <tr>
        <td>&gt;</td>
        <td>Iff (ACCT.001 &gt; 1000, 0, 1)</td>
        <td>If the value of an expression is greater than the value of another expression.<br>The formula calculates:<br>• 0 for all values greater than 1000.<br>• 1 for all values less than or equal to 1000.</td>
    </tr>
    <tr>
        <td>&gt;=</td>
        <td>Iff (ACCT.001 &gt;= 1000, 0, 1)</td>
        <td>If the value of an expression is greater than or equal to the value of another expression.<br>The formula calculates:<br>• 0 for all values of 1000 or greater.<br>• 1 for all values less than 1000.</td>
    </tr>
    <tr>
        <td>and</td>
        <td>Iff (ACCT.001 = 1000 AND ACCT.002 = 2000, 0, 1)</td>
        <td>If all expressions are true.<br>The formula calculates:<br>• 0 if both ACCT.001 is 1000 and ACCT.002 is 2000.<br>• 1 if ACCT.002 is 2000 and ACCT.001 is not 1000.<br>• 1 if ACCT.001 is 1000, and ACCT.002 is not 2000.</td>
    </tr>
    <tr>
        <td>or</td>
        <td>Iff (ACCT.001 = 1000 OR ACCT.002 = 2000, 0, 1)</td>
        <td>If at least 1 expression is true.<br>The formula calculates:<br>• 0 if both ACCT.001 is 1000 and ACCT.002 are 2000.<br>• 0 if ACCT.001 is 1000 and ACCT.002 is any value.<br>• 0 if ACCT.002 is 2000 and ACCT.001 is any value.<br>• 1 if neither account matches.</td>
    </tr>
    <tr>
        <td>Not</td>
        <td>Iff (NOT (Level = HQ, 0, 1)</td>
        <td>Excludes the expression.</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 12

| Modeling | 1052

<table>
    <tr>
        <th>Button</th>
        <th>Example</th>
        <th>Description</th>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>The formula calculates:</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>• 0 if the level isn't HQ.</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>• 1 for all other levels.</td>
    </tr>
</table>
## Saving Formulas and Formula Errors

When you enter a formula, the cell displays (fx)?. After you save the sheet, the formula calculates and displays the value. The cell also displays a blue triangle in the corner to indicate that we calculated the value with a formula.

When you have syntax errors or unacceptable references in the formula, you won't be able to save the sheet. When you have formula errors, you can save the sheet, but the cell displays an error.

To review the formula after you save the sheet, you can:

* Click the cell and look in the formula bar.

* Right-click the cell and select Explore Cell.

When cells have blue triangles and gray backgrounds, you can't change the formula from the sheet. An administrator added these formulas to the account itself. For the particular version, the administrator has locked the calculations to avoid user edits to the value or formula.

## Resources and Further Guidance

* Concept: Formula Building Blocks on page 1042.

* Concept: Tips for Writing Formulas on page 1052.

* Reference: Dot Notation for Properties on page 1089.

* Reference: Formula Functions on page 1082.

* Reference: Formula Syntax for Account References and Modifiers on page 1064.

## Formula Examples

We've provided some common examples of formulas you can use for reference to see how formulas are typically constructed. In some cases, you can use these formulas as a starting point for your own models. Always make sure that when you copy a formula, you update the references to reflect real elements in your model.

* Example: Calculate Common Financial Ratios on page 1103.

* Example: Calculate Personnel and Compensation on page 1104.

* Example: Calculate Personnel and Headcount on page 1123.

* Example: Calculate Personnel and Pay Rate on page 1125.

### Concept: Tips for Writing Formulas

#### Improve Expected Results

* Break formulas into small chunks, save, and test results. Then add complexity a chunk at a time.

* Use commas to separate terms. In certain browsers where commas are equivalent to decimal points, use semicolons to separate terms.

* Verify over several months, especially when the actuals will overwrite plan periods.

#### Improve Readability and Understanding

* Add comments to formulas that explain what's happening. Put comments in between hashtags.
Example: ACCT.Rent[time=this-12] 50% increase # last year's rent * 1.5 #

* Capitalize special words. Formulas aren't case sensitive so you can use caps to make terms stick out.

©2025 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 13

| Modeling | 1053

*   Use indentation, spaces, and line breaks to improve readability. When you're typing in the formula bar, press Alt-Enter to break a line.

Example: Break down the formula into different lines.

ACCT.Rent

[time = this - 12]

50% increase

# last year's rent * 1.5 #

**Improve Performance**

*   Test formulas with IF and DIV function. Once you validate that they're working, use IFF and DIVF to improve the performance.

*   Avoid references to the top-level organization structure. Instead create an assumption account which always evaluates at the top level.

**Use the Formula Assistant**

Formula Assistant helps you create syntactically-correct formulas. You don't have to manually enter account terms or term modifiers to define your formula.

**Steps**

1. Open the Formula Assistant:

*   From sheets, click the **Formula Assistant** button in the toolbar.

*   From custom calculation in reports, right-click the element and select *Formula Assistance*.

*   For calculated accounts and shared formulas, click the **Formula Assistant** link in the settings.

2. Click an account or column from the **Account** section on the left.

When you select an account, the account name and code appears in the **Account Term Modifiers** section. We don't recommend that you reference system accounts from cube sheet cells or cube accounts. See <u>FAQ: What's the best way to reference a system account from a cube sheet?</u> on page 817.

When you select a modeled sheet column, the ROW.ColumnName appears in the **Account Term Modifiers** section.

3. (Optional) From the **Account Term Modifiers** section, use the drop-down prompts to add modifiers for time, levels, custom dimensions, and attribute.

You can't select modifiers for modeled accounts that reference columns using the ROW syntax. When you reference a row, the formula uses the modifiers populated for the specific row.

4. Click the green check mark.

The account term moves to the **Formula** section.

5. Select formula functions.

Click the buttons along the top to add to common functions to the **Formula** section.

Or, use the **Function** drop-down menus and click **Insert into Formula**.

6. Continue to add account terms and functions to complete your formula.

**Examples**

<table>
<tr>
<th>Formula</th>
<th>Explanation</th>
</tr>
<tr>
<td>ACCT.Personnel.Headcount<br>+ACCT.Actual_Headcount</td>
<td>Adds the values of 2 accounts.</td>
</tr>
</table>


©2025 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 14

| Modeling | 1054

<table>
    <tr>
        <th>Formula</th>
        <th>Explanation</th>
    </tr>
    <tr>
        <td>`div(ACCT.4000_Revenue-`<br>`ACCT.4000_Revenue[time=this-12],ACCT.4000_Revenue[time=this-12])`</td>
        <td>Divides the value of 1 account by another account with time modifiers.</td>
    </tr>
    <tr>
        <td>`if`<br>`(FiscalMonth(this)=1,ROW.ExpectedRaise,0)`</td>
        <td>Uses a logical function to apply and raise on the 1st month of a fiscal year.</td>
    </tr>
</table>
**Tip:** When you prepare a formula that includes multiple statements, make sure you place the cursor in the correct location within the **Formula** area before you click **Insert into Formula** or click the green checkmark. Otherwise, you may need to copy and paste to get the statements in the correct order. The cursor appears as a thin vertical bar (`|`).

## Validate Formulas

### Prerequisites

Security: Model includes: sheets, accounts, dimensions, and formulas permission.

### Context

Formula Validation finds formula errors per version and provides links and details to help you troubleshoot and resolve the errors. We validate the formula for correct syntax, circular references, and so on, as you create formulas. However, you can introduce formula errors as you make changes to your model structure. This includes changes to:

* Calendar
* Versions
* Levels
* Accounts
* Sheets

You can use the Formula Validation feature in Modeling to check all formulas, including account formulas, and formulas entered into sheets. It does not find formulas on reports.

After you run a validation, we provide information in the **Summary** section:

* **Total Computations Required**: The total amount of calculations within the selected version.
* **Total Computation Performed**: The number of calculations that were checked to reach the maximum errors found, which you specify.
* **Errors Found**: The total number of locations with errors. This number might differ from the errors displayed when you select **Exclude Reference Errors**.

When the **Total Computations Required** is larger than the **Total Computations Performed**, you have reached the maximum errors. When the Formula Validation finds the maximum errors, it stops performing the computations of the remaining formulas. You must first resolve the displayed errors and then run the validation again.

In the **Error Details** section, we provide a list of errors with the account, level, and time period. The error message is a link to Explore Cell. From there, you can click through to resolve the error. For account default formulas, we list the error for every level. Resolving the error in the account settings fixes it for all levels.

### Steps

1. Select **Modeling** from the main menu.
2. Select **Formula Validation** from the **Accounts** section.

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 15

| Modeling | 1055

3. Refine your validation with these options:

<table>
  <thead>
    <tr>
      <th>Option</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><b>Version prompt</b></td>
      <td>From the top navigation menu, select the version that you want to validate.</td>
    </tr>
<tr>
      <td><b>Max Errors</b></td>
      <td>Select up to 500. This is the maximum displayed, not the maximum checked and found.</td>
    </tr>
<tr>
      <td><b>Exclude Reference Errors</b></td>
      <td>Removes valid formulas that reference another cell or account with an error. Fixing the source of the error automatically resolves reference errors. This also excludes errors in level and account rollups.</td>
    </tr>
  </tbody>
</table>

4. Click <b>Refresh</b>.

5. Ctrl-Click the error message to open Explore Cell in another browser tab.
Opening Explore Cell in a separate tab enables you to return to the Formula Validation and refresh your search.

6. From Explore Cell, you can:

* Link to the sheet to correct the formula error.

* Link to the account settings to correct the <b>Default Formula</b>.

* Drill through Explore Cell to find the source of the error.

7. To correct Shared Formulas, select <b>Formulas</b> from the main menu.

**Troubleshoot Formulas**

**Common Formula Errors**

* Incorrect syntax. For example, to divide:

  * `div (N, D)` (correct syntax)

  * N/D (incorrect syntax)

* Data privacy. The account must be public at all levels to reference another level.

* Invalid accounts. Make sure the account name you entered is spelled correctly. Use the Formula Assistant to prevent account syntax errors.

**Troubleshooting Tips**

This section includes some troubleshooting tips for fixing formula errors.

**Issue: Cannot Edit Shared Formulas for a Version**
If you have <b>Administrator</b> permission, but shared formulas are not editable for a version, navigate to <b>Modeling > Versions</b> and check the following:
* Make sure Administrators have <b>Full Access</b> to the version.
* Check to see if the version is locked (<b>Locked version</b>). You cannot edit shared formulas in a locked version.
* Check to see if <b>Locked leading months through</b> is set for the version. Because shared formulas must work across time periods, having <i>any</i> month set in this feature locks the entire <b>Shared Formulas</b> page

**Issue: "Expected a literal numeric value" Error Appears**
Typically, when you get this error, it's because the equal sign (=) is included in the formula. This sign is

©2025 Workday, Inc. All rights reserved
Workday Proprietary and Confidential

## Page 16

| Modeling | 1056

<!-- layout: ecdl, qrhp, jpnf -->
**Issue:** Changes to Shared Formulas Don't Appear in All Locations

not required when you use the <mark>Formula Assistant</mark>. Remove the = sign and try again.

If you update a shared formula, check to see if a user has overridden the shared formula on a sheet. When you update the formula, you have the option to **Remove user edits** as part of the update.

<!-- layout: tnwf, hwue, nsel -->
## Formula Modifiers and References
### Concept: versionmonth() Formulas and Custom Calendars

If your organization wants to swap from a legacy calendar to a custom calendar you should check your formulas for the use of `versionmonth()`. Swapping from a legacy calendar to a custom one will yield a different result for `versionmonth()` in identical cells.

Legacy calendars are calendars created before Release 2017.2 that have not been changed within the Time Administration area. See Steps: Change Calendars on page 694.

The easiest way to determine if your calendar is legacy is to view the Time Administration's toolbar. Only legacy calendars have the extend backward and forward buttons.

<table>
  <thead>
    <tr>
      <th>Legacy Calendar Time Administration Toolbar</th>
      <th>Custom Calendar Time Administration Toolbar</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><img alt="Legacy Calendar Time Administration Toolbar showing 'Time' header and icons including extend backward/forward" src="tmjr"></td>
      <td><img alt="Custom Calendar Time Administration Toolbar showing 'Time' header and icons without extend backward/forward" src="tmjr"></td>
    </tr>
  </tbody>
</table>

There are three criteria `versionmonth()` formulas must meet so that the numbers in your instance don't change when you shift to a custom calendar.

<!-- layout: igqj, xxtc, hvqg -->
* `versionmonth()` formulas require a time strata called "Month" present in your defined calendar.
* `versionmonth()` formulas must only exist in accounts at the Month time strata.
* `versionmonth()` formulas must be used to compare a relative position. They will not yield correct results if used to compare an absolute position.
  * `if(versionmonth(this)=versionmonth(ROW.Date), "value if true", "value if false")` will continue to work
  * `if(versionmonth(this)>0, "value if true", "value if false")`, will yield a different result than it previously did, but not produce an error.

If those criteria are met, you can continue to use your `versionmonth()` formulas in your custom calendar.

## How versionMonth() Functions Calculate

<!-- layout: ecgd, bgyg -->
**Custom Calendar**
In general, in a custom calendar, the `versionmonth` function acts as if your version started in January 2001. In other words, `versionmonth(this) = 0` is in January 2001.

<!-- layout: zenm, ngib -->
**Legacy Calendar**
In a legacy calendar `versionmonth(this)` will return the number of months away from the first month of the version.

<!-- layout: abom, ypsq -->
©2025 Workday, Inc. All rights reserved
Workday Proprietary and Confidential

## Page 17

| Modeling | 1057

## Concept: Day(this) Formulas and Custom Calendars

With the introduction of flexible time modeling in Release 2017.2, the use of `day(this)` within formulas gets interpreted differently depending on if your instance has a legacy calendar or a custom calendar. Legacy calendars are calendars created before Release 2017.2 that have not been changed within the Time Administration area. See Steps: Change Calendars on page 694.

The easiest way to determine if your calendar is legacy is to view the Time Administration's toolbar. Only legacy calendars have the extend backward and forward buttons.

![Legacy Calendar Time Administration Toolbar showing 'Time' header and icons including extend backward/forward buttons](page_17_image_2_v2.jpg) ![Custom Calendar Time Administration Toolbar showing 'Time' header and icons without extend backward/forward buttons](page_17_image_2_v2.jpg)

Legacy calendars interpret the `day(this)` function as the number 15.

If you change your legacy calendar by lengthening it, changing its labels, or adding or removing time strata, it becomes a custom calendar. Any instances created after Release 2017.2 automatically operate as custom calendars by default, even though they're monthly. While legacy calendars always return the number 15 for `day(this)`, custom calendars interpret `day(this)` as the day integer of the first date of the containing time period.


  
    <strong>day(this) in a Legacy Calendar</strong>
    <img src="layout_id:cecm" alt="Screenshot showing =day(this) formula returning 15 for January 2016 in a legacy calendar">
    return value for January 2016 = 15
  
  
    <strong>day(this) in a Custom Calendar</strong>
    <img src="layout_id:cecm" alt="Screenshot showing =day(this) formula returning 1 for January 2016 in a custom calendar">
    return value for January 2016 = 1
  


For example, in a custom calendar configured with weeks, if week 1 of a year begins January 1, using `day(this)` in week 2 returns the number 8. January 8 is the first day of week 2.

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 18

| Modeling | 1058

![Calendar screenshot showing January 2017 with the 8th highlighted and day(this) = 8](page_18_image_1_v2.jpg)

## How (this) is Interpreted in a Comparison Within an IF statement

For legacy calendars, the word `(this)` within a formula can represent the 15th of any month when it is used as a comparison in an IF statement.

In a custom calendar `(this)` represents the start date of a time period.

For example, the formula `IF(this>toDate(2016,1,1),1,0)` will return a 1 in a legacy calendar that starts in January 2016. In a custom calendar, the formula returns a 1 starting in February 2016.

In January 2016 of a legacy calendar, `(this)` means 1-15-2016, and in a custom calendar `(this)` means 1-1-2016.

<table>
  <thead>
    <tr>
      <th><code>IF(this&gt;toDate(2016,1,1),1,0)</code></th>
      <th>January 2016</th>
      <th>February 2016</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Legacy</td>
      <td>result = 1</td>
      <td>result=1</td>
    </tr>
<tr>
      <td>Custom</td>
      <td>result=0</td>
      <td>result=0</td>
    </tr>
  </tbody>
</table>

## How to Edit day (this) Formulas from Legacy Calendars for Use in New Calendars

There are two steps to take to ensure your formulas produce expected results when you use them in custom calendars or instances created after Release 2017.2.

1. Within all formulas, replace all instances of `day(this)` in a legacy calendar with the number 15.

2. Within an IF statement in a legacy calendar replace the word `(this)` with `toDate(this.year,this.month,15)`.

### Concept: Relative Time in Formulas

To reduce the time needed to maintain formulas as time passes, you can create formulas that refer to relevant time. Relevant time changes based on the timespan of the cell. Absolute time remains the same, no matter where you are in the timespan.

To refer to relevant time, use *this* as an expression of time: `[time=this]`. You can also use *versionmonth* modified by *this*: `versionmonth(this)`.

### Absolute versus Relative Time

<table>
  <thead>
    <tr>
      <th>Absolute Time</th>
      <th>Relevant Time</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Acct.Expenses[time=12/2018]</td>
      <td>Acct.Expense[time=this-1]</td>
    </tr>
  </tbody>
</table>

©2025 Workday, Inc. All rights reserved
Workday Proprietary and Confidential

## Page 19

| Modeling | 1059

<table>
  <thead>
    <tr>
      <th><b>Absolute Time</b></th>
      <th><b>Relevant Time</b></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>For any cell in the timespan, the formula always grabs the same value from December 2018.</td>
      <td>For all cells in the timespan, the formula always grabs the value of the previous time period. For the Mar 2018, it grabs Feb 2018. For Aug 2023, it grabs Jul 2023.</td>
    </tr>
<tr>
      <td>Acct.Expense[time=2018]<br>For all cells in the timespan, the formula always grabs the rollup value of the year, 2018.</td>
      <td>Acct.Expense[time=this.year]<br>For all cells in the timespan, the formula always grabs the value of the rollup in the same period. For the Mar 2018, it grabs the rollup of 2018. For Aug 2023, it grabs the rollup of 2023.</td>
    </tr>
  </tbody>
</table>

## Example of Dynamic Time in Headcount Plans

You track personnel data on a modeled sheet. The modeled sheet has an account: New Hires. To calculate the number of new hires for each month, you can use a formula like this to the New Hire account:
`If(versionmonth(this) = versionmonth(ROW.StartDate),1,0).`

This formula says: Populate New Hire with 1 if the start date in this row has the same version month as the current cell. If it's not the same, calculate zero.

Here are the modeled sheet rows:

<table>
  <thead>
    <tr>
      <th>Employee Name</th>
      <th>Start Date</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Jane Doe</td>
      <td>Jan 2023</td>
    </tr>
<tr>
      <td>John Smith</td>
      <td>Jul 2022</td>
    </tr>
<tr>
      <td>Mary Joe</td>
      <td>Feb 2023</td>
    </tr>
<tr>
      <td>Jack Brown</td>
      <td>Jun 2022</td>
    </tr>
  </tbody>
</table>

For the version month Jan 2023, the new hire account has a value of 1 because Jane was the only new hire in Jan 2023.

### FAQ: Level Modifiers for Formulas

* Why are there no levels in the level drop-down prompt in Formula Assistant?
* How can I use level modifiers to pull the total value of several levels?
* Why isn't my level modifier pulling the rollup value?
* When should I add (+) to the parent code modifier?

**Why are there no levels in the level drop-down prompt in Formula Assistant?**

The account reference that you're modifying has a private Data Privacy Setting. Try this:

Security: Model includes sheets, accounts, dimensions, and formulas permission.

1. Select **Modeling** from the main menu.
2. Click the account hierarchy. Example: Click **General Ledger Accounts**.
3. Select the account from the account list.

©2025 Workday, Inc. All rights reserved
Workday Proprietary and Confidential

## Page 20

| Modeling | 1060

**How can I use level modifiers to pull the total value of several levels?**

4. In the **Details** section, find the **Data Privacy Setting**:

- *Value of account is private*: You can't use level modifiers for the account.

- *Value of account is public at top level only*: You can only modify the account with the top level or this.

- *Value of account is public at all levels*: You can modify the account with any level modifier.

You can accomplish this 3 ways:

- Parent level modifiers.

- Level attribute modifiers.

- Separate level modifiers.

The examples in the table use this level hierarchy and these values for ACCT.02:

<table>
  <tr>
    <th>Level [code]</th>
    <th>Jan 2025</th>
  </tr>
<tr>
    <td><b>- Sales [sales]</b></td>
    <td></td>
  </tr>
<tr>
    <td>Sales-North [SN]</td>
    <td>50,000</td>
  </tr>
<tr>
    <td>Sales-South [SS]</td>
    <td>100,000</td>
  </tr>
<tr>
    <td>Sales (only) [N/A]</td>
    <td>20,000</td>
  </tr>
<tr>
    <td><b>Total</b></td>
    <td><b>170,000</b></td>
  </tr>
</table>
<table>
  <tr>
    <th>Method</th>
    <th>Example</th>
  </tr>
<tr>
    <td>Parent Level Modifier</td>
    <td>ACCT.02 [level = Sales]<br>Returns: 170,000.</td>
  </tr>
<tr>
    <td>Attribute Modifier</td>
    <td>Your model has an attribute called <b>Region</b> with values <i>East</i> and <i>West</i>. Sales-North and Sales-South are tagged with West.<br><br>ACCT.02 [region = west]<br>Returns: 150,000.</td>
  </tr>
<tr>
    <td>Separate level modifiers</td>
    <td>ACCT.02 [level = SN] + ACCT.02 [level = Sales (-)]<br>Returns: 70,000</td>
  </tr>
</table>

**Why isn't my level modifier pulling the rollup value?**

- The formula modifier must reference the level code with a (+): $$level = <parent\_code> (+)$$.

©2025 Workday, Inc. All rights reserved
Workday Proprietary and Confidential

## Page 21

| Modeling | 1061

* The level must be a parent level. When you reference the level codes of levels that don't have child accounts, we ignore the (+).

* If you're using `level = this (+)` , replace with `level = <parent code> (+)`. `level = this (+)` is only valid for formulas at the (only) level of the same parent. Example: To reference Sales parent level, you can enter `level = this (+)` when you're at the Sales (only) level. Otherwise, you must enter `level = sales (+)`.

## When should I add (+) to the parent code modifier?

Although you can reference the parent level code without the (+), you will get unexpected results in the related (only) level of the parent. Without (+), we don't return the rollup value in the (only) level of the same parent. Example: Level = Sales at the the Sales (Only) level returns the value of the Sales (Only) level instead of the Sales rollup value.

For this reason, it's especially necessary to add the (+) when you're entering default formulas for accounts because they're valid across all levels, which would include the (only) levels. In Formula Assistant, we automatically add the (+) when you select parent level modifiers to avoid issues.

### Related Information

#### Concepts

Concept: Formula Building Blocks on page 1042

#### Reference

Reference: Level Modifiers for Formulas on page 1061

Reference: Level Modifiers for Formulas

### Definition of Level Modifier

Level modifiers slice the data from the account to include only the value of specific levels.

### Syntax in Documentation

A few notes on syntax in documentation:

* We use capital letters in parenthesis, like (N), or text inside chevrons, like `<account_code>`, to indicate variables. You must replace the variables with valid constants, account references, or formula expressions.

* We use commas to separate terms, according to the standard of many countries. If your browser uses commas as decimal points, you must separate the terms with semicolons.

* We add spaces to make the formulas readable, although they're not necessary. You can also add spaces or leave them out of your formulas.

* We capitalize functions, such as Divf, and use all caps for elements, like ACCT, but formulas aren't case sensitive.

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 22

| Modeling | 1062

## Limitations of Level Modifiers

*   Adaptive Planning sheets display an error for valid formulas when you:
    *   Modify by levels that you can't access due to access rules.
    *   Add level modifiers to an account reference that has a private **Data Privacy Setting**. Example: In the settings for ACCT.001, the Data Privacy Setting must be *Value of Account is Public at all Levels* for this formula to be valid: `ACCT.001 [level = level_code]`. See Concept: Data Privacy Setting for Accounts on page 810.
    *   Reference level codes that use restricted words. See Reference: Best Practices for Codes and Names of Metadata on page 1207.
    *   Reference a level that isn't available in the current version availability. See Change Level Availability on page 762.
*   We won't apply level modifiers to assumption accounts because assumption accounts have the same value for all levels.
*   Level modifiers can't be applied to ROW references in modeled sheets because the ROW must reference the level in the row. However you can modify a modeled account with level modifiers from another sheet.

## Best Practices for level (+) and level (-)

*   To reference parent levels, always use `level = <parent_code> (+)`.
*   To reference (only) levels, always use `level = <parent_code> (-)`.
*   Avoid `level = this (+)`. It is only valid for formulas at the (only) level of the same parent. Instead replace with `level = <parent_code> (+)`.
*   Avoid `level = <parent_code>` although it is valid in most cases. Dropping the (+) from the parent rollup returns the (only) level values instead of the rollup values at the the related (only) level.
*   Never use `level = this (-)` for any reason.

`level = <parent_code> (+)` includes the rollup value of all child levels, including the (only) level. In Formula Assistant, we automatically add the (+) to any parent level modifier that you select

## Syntax and Examples of Level Modifiers

For the examples in the table, the level hierarchy and values for ACCT.02 are:

<table>
  <tr>
    <th>Level [code]</th>
    <th>Jan 2025</th>
  </tr>
<tr>
    <td>- Sales [Sales]</td>
    <td></td>
  </tr>
<tr>
    <td>Sales-North [SN]</td>
    <td>50,000</td>
  </tr>
<tr>
    <td>Sales-South [SS]</td>
    <td>100,000</td>
  </tr>
<tr>
    <td>Sales (only) [N/A]</td>
    <td>20,000</td>
  </tr>
<tr>
    <td>Total - Sales</td>
    <td>170,000</td>
  </tr>
</table>
<table>
  <tr>
    <th>Syntax</th>
    <th>Description</th>
    <th>Example</th>
  </tr>
<tr>
    <td>level = this</td>
    <td>Use on any level to refer to the same level as the current intersection.<br><br>Using <i>this</i> is unnecessary in most cases because by default it's</td>
    <td><b>Formula Location:</b><br>ACCT.001 for Sales-South level.<br><br><b>Formula:</b><br>ACCT.02 [level = this]</td>
  </tr>
</table>

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 23

| Modeling | 1063

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td></td>
        <td>implied that the level is "*this level*" unless you indicate a different level.</td>
        <td>**Returns**: 100,000</td>
    </tr>
    <tr>
        <td>`level = this (+)`</td>
        <td>Use in (only) levels only to refer to the rollup value of the parent level.<br>Returns the value of `[level = this]` when for all other levels other than (only) level.</td>
        <td>**Formula Location**:<br>ACCT.001 at the Sales-South level.<br>**Formula**:<br>ACCT.02 `[level = this (+)]`<br>**Returns**: 100,000<br><br>**Formula Location**:<br>ACCT.001 at the Sales (only) level.<br>**Formula**:<br>ACCT.02 `[level = this (+)]`<br>**Returns**: 170,000</td>
    </tr>
    <tr>
        <td>`level = this (-)`</td>
        <td>Do not use. Returns unexpected results, or we ignore it.</td>
        <td>N/A</td>
    </tr>
    <tr>
        <td>`level = &lt;level_code&gt;`</td>
        <td>Use on any level to refer to any level. You must replace `&lt;level_code&gt;`, including the chevrons, with an exact level code in your model.<br>We return an error if the referenced account does not have public **Data Privacy Setting**.<br>If your referencing a parent level, we automatically include (+). Removing it doesn't return the rollup value in (only) levels.</td>
        <td>**Formula Location**:<br>ACCT.001 at any level.<br>**Formula**:<br>ACCT.02 `[level = SN]`<br>**Returns**: 50,000</td>
    </tr>
    <tr>
        <td>`level = &lt;level_code&gt; (+)`</td>
        <td>Use when you modify an account with a parent level. You must replace `&lt;level_code&gt;`, including the chevrons, with an exact parent level code in your model.<br>Returns the rollup value of all child levels. If there aren't any child levels, we remove the modification.</td>
        <td>**Formula Location**:<br>ACCT.001 at any level.<br>**Formula**:<br>ACCT.02 `[level = Sales (+)]`<br>**Returns**: 170,000</td>
    </tr>
    <tr>
        <td>`level = &lt;level_code&gt; (-)`</td>
        <td>Use when you modify an account with a parent level. You must replace `&lt;level_code&gt;`, including the chevrons, with an exact parent level code in your model.</td>
        <td>**Formula Location**:<br>ACCT.001 at any level.<br>**Formula**:</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 24

| Modeling | 1064

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td></td>
        <td>Returns the value in the (only) level of the parent level. This is the only way to reference the account value of an (only) level because (only) levels don't have specific codes.</td>
        <td>ACCT.02 [level = Sales (-)] **Returns**: 20,000</td>
    </tr>
</table>
**Related Information**

**Concepts**

Concept: Formula Building Blocks on page 1042
Concept: Data Privacy Setting for Accounts on page 810

**Reference**

FAQ: Level Modifiers for Formulas on page 1059
Reference: Formula Syntax for Account References and Modifiers on page 1064

**Reference: Formula Syntax for Account References and Modifiers**

Describes syntax rules and options that you can use for account references and modifiers in formulas. Account references are prepended with ACCT, ASSUM, or ROW.

You can modify general ledger, custom, cube, metric, and assumption accounts with time, level, dimension or attribute modifiers. You can use many modifiers per account reference.

Modifiers are not available for RoW references because the formula automatically uses the data populated in the row as the modifiers.

**Refer to an Account**

*   References to general ledger, custom, and metric Accounts follow this format: `ACCT.Account_Code`

*   References to cube and modeled accounts follow this format: `ACCT.Sheet_Prefix.Account_Code`

*   Use `ACCT.this` in a formula to refer to the current account. This allows you to write the same formula in multiple accounts if the formula needs to refer to the current account. This makes it much easier to copy formulas between large blocks of accounts. (You can also use `this` to reference the current level or dimension value.)

**Refer to an Assumption**

References to Global Assumption Accounts follow this format: `ASSUM.Account_Code` :

**Refer to a Modeled Sheet Input Column**

References modeled sheet rows follow this format:

*   `ROW.Input_Column`

*   `ROW.Lookup_Table`

*   `ROW.Attribute_Name`

When you use an attribute modifier with a ROW term, it resolves to the string of the attribute value. The split corresponds to the current modeled row. You can only modify with an attribute name that doesn't contain spaces or other terminator characters.

**Time Modifiers**

*   `ACCT.Personnel.Headcount[time=this-1]`

*   `ACCT.Personnel.Salary[time=this.year-1]`

Options include:

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 25

| Modeling | 1065

* this (the current period)
* this+n (where $n$ is the number of future periods)
* this-n (where $n$ is the number of prior periods)
* this.year (the year referenced from the current period)
* this.qtr (the quarter referenced from the current period)
* this.year-1 (the prior year from the current period)
* Ranges:
    * Two time references separated by a colon
    * Both ends of the range must be of the same granularity
    * Rolls up values based on the account type and the **Time rollup** setting for the account. For example: `this.year-2:this.year` sums three years for a periodic custom account with **Time rollup** set to sum the rolled-up values. It gives an average for the same account if **Time rollup** is set to average the rolled-up values. For accounts where the **Time rollup** setting is fixed, the formula generatea a value based on the fixed setting.

**Note:** For simplicity, the examples in the table show formulas using comma separators. Some browser settings require you to use semicolon separators.

<table>
<thead>
<tr>
<th>Full Formula Examples</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td>IFF(this.month.IsUnder(ToDate(ROW.Year, ASSUM.NormalQuota)</td>
<td>The ROW expression indicates this formula is in a modeled sheet. It assumes the row of the modeled sheet has a Year column. If the month is in the quarter of that year which contains Dec 31, it returns a larger quota assumption value, otherwise it returns a normal quota assumption.</td>
</tr>
<tr>
<td>IFF(this.Year.NumberOfDays&gt; 365,ASSUM.DailySpreadAmt[time=this-48],</td>
<td>This formula detects if this is a leap year, and if so, it uses some assumption from four years ago (the last leap year), otherwise it uses the value from the prior year.</td>
</tr>
</tbody>
</table>

## Dimensions and Attributes
You can pull data from an account that's tagged with specific dimensions and attributes.

Example: Headcount is an account in the Personnel modeled sheet. Employee Type is a custom dimension. Full Time is 1 of the dimension values for Employee Type. To reference only data tagged with the Full Time dimension value in the Headcount account, enter: ACCT.Personnel.Headcount[Employee_Type=Full Time]

### Guidelines:
* Append the modifier after ACCT with square brackets [......]
* Use *this* as a dimension value to reference the current dimension value. Example: ACCT.6110[Product=this]) .
* You can add multiple dimensions or attributes, separated by commas. Example: The formula refers to the Product and Customer dimension: ACCT.6110[Product=Shirts, Customer=WinterWonderland] .
* Don't list more than 1 dimension value for the same dimension modifier. When you list more than 1 value, the formula returns only the last 1 listed. Example: This formula only returns data in Account 6110 that's tagged with Sweaters, not Shirts, and not Shirts and Sweaters: ACCT.6110[Product=Shirts, Product=Sweaters]

### Related Information
#### Reference
Reference: Level Modifiers for Formulas on page 1061

©2025 Workday, Inc. All rights reserved
Workday Proprietary and Confidential

## Page 26

| Modeling | 1066

**Formula Functions and Operations**
**Concept: Rounding with Formulas**

Adaptive Planning formulas support rounding and truncating.

**Rounding**

To round a value with decimals to the nearest whole number, you can use the Round function. The Round function rounds the number up or down.

Example: `Round(ACCT.001)`.

<table>
  <tr>
    <th>Value of ACCT.001:</th>
    <th>Formula Returns:</th>
  </tr>
<tr>
    <td>3.45</td>
    <td>3</td>
  </tr>
<tr>
    <td>7.798</td>
    <td>8</td>
  </tr>
</table>

**Truncating**

Truncating removes numbers after the decimal. The function effectively always rounds down to the nearest whole number.

Example: `Trunc(ACCT.001)`.

<table>
  <tr>
    <th>Value of ACCT.001:</th>
    <th>Formula Returns:</th>
  </tr>
<tr>
    <td>3.45</td>
    <td>3</td>
  </tr>
<tr>
    <td>7.798</td>
    <td>7</td>
  </tr>
</table>

**Advanced Rounding**

To round to the 10s place, or the 100s place, and so on, you can use the Round functions in advanced formulas.

Example: `Round(divf(ACCT.001,10))*10`.

The formula says: First divide the value by 10, then round the result to the nearest whole number. Finally multiply the result by 10.

<table>
  <tr>
    <th>Value of ACCT.001:</th>
    <th>The Formula Returns:</th>
  </tr>
<tr>
    <td>43</td>
    <td>40:<br>1. 43/10 = 4.3<br>2. Rounding 4.3 to the nearest whole number = 4<br>3. 4*10 = 40</td>
  </tr>
<tr>
    <td>876</td>
    <td>880:<br>1. 876/10 = 87.6<br>2. Rounding 87.6to nearest whole number = 88<br>3. 88*10 = 880</td>
  </tr>
</table>

To round to the nearest 100, replace both 10s with 100. To round the nearest 1000, replace both 10s with 1000, and so on. You can also round to numbers after the decimal. To round the nearest 10th, replace the 10s with .1. To round to the 100th place, replace the 10s with .01 and so on.

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 27

| Modeling | 1067

## Advanced Truncating

To truncate to the nearest 10s, or the nearest 100s, and so on, you can use the Trunc function in advanced formulas.

Example: `Trunc(divf(ACCT.001,10))*10`.

The formula says: Divide the account by 10. Then, truncate the result. Finally, multiply the result by 10.

<table>
  <thead>
    <tr>
      <th>Value of ACCT.001:</th>
      <th>Formula Returns:</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>47</td>
      <td>40:<br>1. 47/10 = 4.7<br>2. 4.7 truncated to whole number = 4<br>3. 4*10 = 40</td>
    </tr>
<tr>
      <td>133</td>
      <td>133:<br>1. 133/10 = 13.3<br>2. 13.3 truncated to whole number = 13<br>3. 13*10 = 130</td>
    </tr>
  </tbody>
</table>

To truncate to the 100s, replace both 10s with 100. To truncate to the 1000s, replace both 10s with 1000, and so on. You can also truncate to numbers after the decimal. To round the nearest 10th, replace the 10s with .1. To round to the 100th place, replace the 10s with .01 and so on.

### Related Information Reference

Reference: Mathematical Formula Functions on page 1072

### Concept: IRR Formula Function

#### IRR Definition and Method

IRR is a formula function that calculates the internal rate of return on investments. Example: assets, loans, properties, and so on. The IRR is a discount rate that makes the net present value (NPV) of all cash flows equal to zero.

Use cases for calculating IRR:

*   You take out a loan and receive a lump sum of cash. You know you will make consistent payments over a specified amount of time. Example: A 3-year loan of $100,000 with a monthly payment of $3500 per month results in an IRR of 1.31%, which indicates the interest rate necessary to break even.
*   You start a business requiring upfront capital in exchange for expected future cash flows. Given the present value, the number of periods, and the expected cashflows, the IRR formula provides the rate of return.

IRR is not a straightforward formula. IRR is a trial and error goal-seek function that iterates to converge on the appropriate value. Adaptive uses the Newton-Raphson method to calculate IRR. You can learn more about this method on the internet.

#### IRR Requirements for Adaptive Planning

To use the IRR function in your model, the life of the investment must not exceed the time range of the version. The reason for this limitation is that the Adaptive Planning IRR function requires that you sequentially enter all cashflows that are related to the investment.

The components required for IRR formulas include:

*   Cashflow account or row.

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 28

| Modeling | 1068

* Time range that specifies the periods to reference, which could be a series of accounts or rows. The best practice is to specify the time range of a single cashflow account, instead of selecting individual accounts or rows as a time period argument.

* IRR estimate, which is your best guess to what the IRR should be. The estimate guides the convergence toward the correct IRR when there are more than 1 correct points.

## Formula Arguments with the IRR Function

IRR formulas have arguments that you separate by commas. For IRR, arguments can be accounts, numbers, or function-specific variables. You can set up IRR formulas with single arguments or multiple arguments.

<table>
  <tr>
    <th>Argument</th>
    <th>Example</th>
  </tr>
<tr>
    <td>Single</td>
    <td>IRR(Argument 1)</td>
  </tr>
<tr>
    <td>Multiple</td>
    <td>IRR(Argument 1, Argument 2, Argument 3)</td>
  </tr>
</table>

## Single Argument IRR Formula

Single arguments require a single cashflow with a time range. You don't need to enter an estimated IRR because single argument IRR formulas assume that the estimated IRR is 0.1.

Example: `IRR(ROW.Cashflow[time=this:this+36])`

Explanation of the formula's components:

* In the parenthesis after the IRR function, the formula refers to a row, called Cashflow, in a modeled sheet.

* We use a time modifier for the cashflow row, which specifies to reference the period of the row plus 36 time periods.

* We don't need to enter an IRR estimate. In single argument IRR formulas, the IRR estimate is always 0.1.

## Specifying the IRR Estimate

To specify your own IRR estimate, you can add an argument. You must always add the IRR estimate as the last argument in the formula.

Example: `IRR(ROW.Cashflow[time=this:this+36], 0.2)`

Explanation of the formulas components.

* We added our own IRR estimate, separated from the first argument with a comma.

* The formula now has 2 arguments, with the final one being the IRR estimate of 0.2.

## Multiple Arguments for IRR Formulas

You can also create multiple arguments for several cashflow inputs, rather than 1. In general, for IRR formulas, you want to include all the related cashflows. In these cases, be sure to add the IRR estimate as the final argument. Otherwise, the last cashflow you reference acts like the IRR estimate.

Example: `IRR(ROW.CashFlow1, ROWCashFlow2, ROW.CashFlow3, 0.1)`

Explanation of the formula components:

* Multiple arguments contain multiple cashflows. In this case, the calculation covers 3 periods, represented by the 3 separate cashflow rows.

* For the 4th argument we enter 0.1 as the IRR estimate. If you fail to enter an estimate for multiple arguments, the last cashflow value becomes the IRR estimate.

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 29

| Modeling | 1069

## The IRR Estimate Variable

There can be more than 1 mathematically correct IRR. The IRR function attempts to find a discount rate that results in a Net Present Value (NPV) of 0. These equations typically produce a non-linear graph. The graph generally has a peak with a mathematically correct value on both sides of that peak. The IRR estimate helps the function converge on the mathematically correct value that is most appropriate.

We use 0.1 for the IRR estimate in single argument formulas. 0.1 is a good guess for the internal rate of a return, assuming it's a good investment. However, this will not always be the best assumption for your formula, especially when the anticipated IRR is negative.

When the formula returns a 0 or a nonsensical value, try a different estimated IRR to help the formula converge on the appropriate value.

## Differences between Workday and Excel IRR

<table>
  <tr>
    <th>Behavior or Feature</th>
    <th>Adaptive Planning</th>
    <th>Excel</th>
  </tr>
<tr>
    <td>Number of iterations</td>
    <td>Workday iterates 600 times. When Workday can't find a result, we return a 0. You can then try a new IRR estimate.</td>
    <td>Excel iterates 20 times until it finds a result accurate within a .00001 percent. When Excel can't find a result within this accuracy range, it returns #NUM! error. You can then try a new IRR estimate.</td>
  </tr>
<tr>
    <td>Assumption for IRR Estimate</td>
    <td>0.1 for single arguments. User-specified for multiple arguments.</td>
    <td>0.1 for single arguments. User-specified for multiple arguments.</td>
  </tr>
<tr>
    <td>IRR Method</td>
    <td>Newton-Raphson Method.</td>
    <td>Excel doesn't explicitly state which method they use.*</td>
  </tr>
</table>

* You might get different results in Excel. We have seen cases where given the same variables, Adaptive Planning produces a value of 0, and Excel produces a non-0 value. We can confirm that the numbers produced in Adaptive Planning are mathematically correct using the Newton-Raphson Method, but we cannot confirm the method Excel is using, nor the mathematical correctness of the results.

## Related Information Reference

Reference: Mathematical Formula Functions on page 1072

## Concept: Spread Formula Functions

Spreads are meant to handle the uneven allocation of a value over a period of time. The classic use case involves 52 weeks in a year with 12 months.

## Why Use the Spread Function

You can't evenly distribute 52 weeks into 12 months. But you can distribute the weeks evenly into each quarter:

52 weeks / 4 quarters = 13 weeks in each quarter.

Because each quarter has 3 months, you can divide the 13 weeks by 3 months:

13 weeks / 3 months = 4 weeks per month with a remainder of 1.

How do you account for the extra month per quarter?

You can use the 4-4-5, 4-5-4, 5-4-4 structure. These structures place the extra week into the 1st month (5-4-4), 2nd month (4-5-4), or 3rd month (4-4-5) of each quarter. The "heavier" month is represented by the 5, or the month with 5 weeks, rather than 4 weeks.

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 30

| Modeling | 1070

The Spread functions don't distribute the value to other periods. Instead, they return the value for the specific period based on the location within the imagined spread. To distribute the value, you can enter a spread function in a default formula or a shared formula so that it repeats for every period, which effectively distributes the value. Or you can copy the formula into all time periods.

## Adaptive Planning's Spread Functions

Adaptive Planning offers 3 spread functions:

* Spread445 (N, M)
* Spread454 (N, M)
* Spread544 (N, M)

N is the value to allocate and M is the number of periods over which to spread the value. You can remove the M and the function calculates upon a 12 month spread. The spread functions, uses the value you enter for M to calculate the number of weeks based on a month > quarter system with 13 weeks in each quarter.

## How We Calculate Spread Functions

For M, we recommend that you enter a value that divides evenly into 12 or is a multiple of 12. Although you can use other numbers, the math isn't as straightforward.

Here's how our calculations work:

1. Calculate the number of weeks based on the value of M:
    * 3 = 1 quarter = 13 weeks
    * 6 = 2 quarters = 26 weeks
    * 12 = 4 quarters = 52 weeks
    * 24 = 8 quarters = 104 weeks
    * And so on.

2. Divide the value of N by the calculated number of weeks.

3. Multiply by either 4 or 5 depending on the location of the current period and the spread function:
    * For 4-4-5: Multiply by 5 for Mar, Jun, Sept, Dec. Multiply by 4 for all other periods.
    * For 4-5-4: Multiply by 5 for Feb, May, Aug, Nov. Multiply by 4 for all other periods.
    * For 5-4-4: Multiply by 5 for Jan, Apr, July, Oct. Multiply by 4 for all other periods.

## Examples Showing the Math of Spread Functions

<table>
  <thead>
    <tr>
      <th>Expression</th>
      <th>Result for 1st months:<br>Jan, Apr, Jul, Oct</th>
      <th>Result for 2nd months:<br>Feb, May, Aug, Nov</th>
      <th>Result for 3rd months:<br>Mar, Jun, Sept, Dec</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Spread445 (10,000)</td>
      <td>= (10,000 / 52) * 4<br>= 769</td>
      <td>= (10,000 / 52) * 4<br>= 769</td>
      <td>= (10,000 / 52) * 5<br>= 962</td>
    </tr>
<tr>
      <td>Spread445 (10,000, 6)</td>
      <td>= (10,000 / 26) * 4<br>= 1,538</td>
      <td>= (10,000 / 26) * 4<br>= 1,538</td>
      <td>= (10,000 / 26) * 5<br>= 1,923</td>
    </tr>
<tr>
      <td>Spread454 (12,000)</td>
      <td>= (12,000 / 52) * 4<br>= 923</td>
      <td>= (12,000 / 52) * 5<br>= 1,154</td>
      <td>= (12,000 / 52) * 4<br>= 923</td>
    </tr>
<tr>
      <td>Spread454 (12,000, 3)</td>
      <td>= (12,000 / 13) * 4<br>= 16,000</td>
      <td>= (12,000 / 13) * 5<br>= 20,000</td>
      <td>= (12,000 / 13) * 4<br>= 16,000</td>
    </tr>
<tr>
      <td>Spread544 (200, 3)</td>
      <td>= (200 / 13) * 5</td>
      <td>= (200 / 13) * 4</td>
      <td>= (200 / 13) * 4</td>
    </tr>
  </tbody>
</table>

©2025 Workday, Inc. All rights reserved
Workday Proprietary and Confidential

## Page 31

| Modeling | 1071

<table>
    <tr>
        <th>Expression</th>
        <th>Result for 1st months: Jan, Apr, Jul, Oct</th>
        <th>Result for 2nd months: Feb, May, Aug, Nov</th>
        <th>Result for 3rd months: Mar, Jun, Sept, Dec</th>
    </tr>
    <tr>
        <td></td>
        <td>= 77</td>
        <td>= 62</td>
        <td>= 62</td>
    </tr>
    <tr>
        <td>Spread544 (200, 24)</td>
        <td>= (200 / 104) * 5<br>= 10</td>
        <td>= (200 / 104) *4<br>= 8</td>
        <td>= (200 / 104) *4<br>= 8</td>
    </tr>
</table>
**Related Information**

**Reference**

Reference: Mathematical Formula Functions on page 1072

**Concept: Calculate YTD Based on Periodic Values**

**Periodic versus Cumulative Accounts**

Often, values from Income Statement accounts feed values in Balance Sheet accounts. Example: Net Income is a periodic account that drives the YTD Net Income account on the Balance Sheets. You can use dot notation with time modifiers to calculate the YTD account correctly through the months.

**Example Accounts**

<table>
    <tr>
        <th>Sample Accounts</th>
        <th>Sheet and Type</th>
        <th>Sample Account Codes</th>
    </tr>
    <tr>
        <td>Net Income</td>
        <td>Income Statement - Periodic</td>
        <td>ACCT.NetIncome</td>
    </tr>
    <tr>
        <td>YTD Net Income</td>
        <td>Balance Sheet - Cumulative</td>
        <td>ACCT.YTDNetIncome</td>
    </tr>
</table>
**Example Formula**

For Acct.YTDNetIncome, you can enter this formula in the cells or in the default formula:

`=iff(this.year.positionof(this.month) = 1, ACCT.NetIncome, ACCT.NetIncome + ACCT.YTDNetIncome[time=this-1]).`

The breakdown:

<table>
    <tr>
        <th>Formula Expression</th>
        <th>Meaning</th>
    </tr>
    <tr>
        <td>`=iff(this.year.positionof(this.month) = 1,`</td>
        <td>If this month is the first fiscal month in the current year.</td>
    </tr>
    <tr>
        <td>`ACCT.NetIncome,`</td>
        <td>Use the value in the Net Income account on the Income Statement.</td>
    </tr>
    <tr>
        <td>`ACCT.NetIncome + ACCT.YTDNetIncome[time=this-1]).`</td>
        <td>Otherwise, add the value of Net Income to the previous month of YTD Net Income</td>
    </tr>
</table>
**Example Results on Sheets**

Here's what it looks like when January is the first month of the fiscal year:

<table>
    <tr>
        <th>Accounts</th>
        <th>Jan</th>
        <th>Feb</th>
        <th>Mar</th>
    </tr>
    <tr>
        <td>Net Income</td>
        <td>500</td>
        <td>200</td>
        <td>400</td>
    </tr>
    <tr>
        <td>YTD Net Income</td>
        <td>500</td>
        <td>700</td>
        <td>1100</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 32

| Modeling | 1072

**Related Information**
**Reference**
Reference: Mathematical Formula Functions on page 1072

**FAQ: Is there an average formula function?**
Currently, we don't support an average function for formulas. You can still calculate the average mathematically by adding the components and then dividing by the number of components.

**Related Information**
**Reference**
Reference: Mathematical Formula Functions on page 1072

**FAQ: What is the difference between Div, Divf, and the / symbol?**
All 3 are division operators.

N/D works, but we don't recommend using it. It is more likely to return errors when N or D are complex calculations, or when they equal 0. It also can burden the performance of the model.

Div (N, D) prevents formula errors. With Div, 0 denominators result in a 0 value instead of an error. As a result you can save your work and populate values into D at a later time.

Divf (N, D) improves performance because it doesn't evaluate the denominator when the numerator is 0. With Divf, 0 numerators result in 0 values. You can save your work and populate the values for N at a later time.

We recommend the following protocol:
*   1. Test formulas with Div.
*   2. Confirm that the formula evaluates as expected.
*   3. Replace Div with Divf to improve performance.

**Related Information**
**Reference**
Reference: Mathematical Formula Functions on page 1072

**Reference: Mathematical Formula Functions**
Adaptive Planning formulas supports simple math functions and complex math functions. You can use Formula Assistant to access all the math functions.

**Syntax in Documentation**
A few notes on syntax in documentation:
*   We use capital letters in parenthesis, like (N), or text inside chevrons, like `<account_code>`, to indicate variables. You must replace the variables with valid constants, account references, or formula expressions.
*   We use commas to separate terms, according to the standard of many countries. If your browser uses commas as decimal points, you must separate the terms with semicolons.
*   We add spaces to make the formulas readable, although they're not necessary. You can also add spaces or leave them out of your formulas.
*   We capitalize functions, such as Divf, and use all caps for elements, like ACCT, but formulas aren't case sensitive.

**Simple Math Functions**
You can find simple math functions in Formula Assistant using the buttons from the toolbar, or by typing math symbols from your keyboard.

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 33

| Modeling | 1073

<table>
    <tr>
        <th>Math Operator</th>
        <th>Example Formula</th>
    </tr>
    <tr>
        <td>Addition (+)</td>
        <td>ACCT.001 + ACCT.002</td>
    </tr>
    <tr>
        <td>Subtraction (-)</td>
        <td>ACCT.001 - ACCT.002</td>
    </tr>
    <tr>
        <td>Multiplication (*)</td>
        <td>ACCT.001 * ACCT.002</td>
    </tr>
    <tr>
        <td>Division (Divf)</td>
        <td>Divf (ACCT.001, ACCT.002)<br>Divides ACCT.001 (the dividend) by ACCT.002 (the divisor)</td>
    </tr>
    <tr>
        <td>Modulo (%)</td>
        <td>10 % 3<br>Calculates the remainder of the quotient. Returns 1 because 10 divided 3 = 3 remainder 1.</td>
    </tr>
    <tr>
        <td>Parenthesis ()</td>
        <td>(ACCT.001 + ACCT.002) * 12<br>Dictates the order of operation: Add the accounts before multiplying by 12.</td>
    </tr>
    <tr>
        <td>Round(N)</td>
        <td>Round (ACCT.001)<br>Rounds to the nearest whole number. In the example if the value of ACCT.001 is 5.75, the formula returns 6.</td>
    </tr>
</table>
## Complex Math Functions

Find complex math when you select **Mathematical** from the **Function** prompt in Formula Assistant. The functions display in the drop-down menu next to the **Function** prompt.

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td>Div (N, D)</td>
        <td>Divides N by D.</td>
        <td>Replace both N and D with account references, numbers, or formula expressions.</td>
    </tr>
    <tr>
        <td>Divf (N, D)</td>
        <td>N is the numerator. D is the denominator.<br><br>Use to calculate metrics and ratios, like:<br>- Debt to equity.<br>- Earnings per share.<br>- Price to earnings.<br>- Return on equity.<br><br>See <u>FAQ: What is the difference between Div, Divf, and the / symbol?</u> on page 1072.</td>
        <td>**Existing values:**<br>ACCT.001 = 7.8<br>ACCT.002 = 4.2<br><br>**Expression:**<br>Divf (ACCT.001, ACCT.002)<br><br>**Calculation:**<br>= Divf (7.8, 4.2)<br>= 1.86</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 34

| Modeling | 1074

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td>Round (N)</td>
        <td>Rounds N to the nearest whole number. <br> Use to simplify calculations or for calculating values were fractions don't make sense. <br> See Concept: Rounding with Formulas on page 1066.</td>
        <td>Replace N with account references, numbers, or formula expressions. <br> **Existing values:** <br> ACCT.001 = 7.8. <br> **Expression:** <br> Round (ACCT.001) <br> **Calculation:** <br> Round (7.8) <br> = 8</td>
    </tr>
    <tr>
        <td>Trunc (N)</td>
        <td>Drops the digits after the decimal point. <br> Use to simplify calculations or for calculating values were fractions don't make sense. <br> See Concept: Rounding with Formulas on page 1066.</td>
        <td>Replace N with account references, numbers, or formula expressions. <br> **Existing values:** <br> ACCT.001 = 7.8 <br> ACCT.002 = 4.2 <br> **Expression:** <br> Trunc (ACCT.001 * ACCT.002) <br> **Calculation:** <br> = Trunc (7.8 * 4.2) <br> = Trunc (32.76) <br> = 32</td>
    </tr>
    <tr>
        <td>Floor (N)</td>
        <td>Rounds N down to the nearest whole number. <br> Use when fractional values don't make sense and you want to round down to whole numbers. <br> Example: Calculate price per units sold when you don't want units to be a fraction.</td>
        <td>Replace N with account references, numbers, or formula expressions. <br> **Existing values:** <br> ACCT.001 = 23.89 <br> ACCT.002 = 4.75 <br> **Expression:** <br> Floor (Divf (ACCT.001, ACCT.002)) <br> **Calculation:** <br> = Floor (Divf (23.89, 4.75)) <br> = Floor (5.688) <br> = 5 <br> For Floor (-5.688), the result is -6 because -6 is less than -5.688.</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 35

| Modeling | 1075

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td>Ceil (N)</td>
        <td>Rounds up to the nearest whole number. <br> Use when fractional values don't make sense and you want to round up. <br> Example: Calculate headcount coverage based on projected sales. If the answer is 1.3, you need 2 workers to prevent understaffing the store.</td>
        <td>Replace N with account references, numbers, or formula expressions. <br> **Existing values:** <br> ACCT.001 = 23.89 <br> ACCT.002 = 4.2 <br> **Expression:** <br> Ceil (Divf (Acct.001, Acct.002)) <br> **Calculation:** <br> = Ceil (Divf (23.89, 4.2)) <br> = Ceil (5.688) <br> = 6 Ceil <br> (-5.688) is -5 because -5 is greater than -5.688.</td>
    </tr>
    <tr>
        <td>Power (N, E)</td>
        <td>Raises the value of N by the power of the exponent, E. Exponents multiply the number, N, by itself a specific number times. <br> N must be a positive number and E must be an integer. <br> Use to measure exponential growth or decay of a given set of data. <br> Example: Calculate the future value of an investment with an annual compounded interest rate</td>
        <td>Replace N and E with account references, numbers, or formula expressions. <br> **Existing Values:** <br> Interest rate: ASSUM.001 = 2% <br> Asset: ACCT.001 = 100 <br> Number of years = 3 <br> **Expression:** <br> ACCT.001 * (Power (1+ASSUM.001, 3)) <br> **Calculation:** <br> = 100 * (Power (1 + .02, 3)) <br> = 100 * (Power (1.02, 3)) <br> = 100 * (1.02 * 1.02 * 1.02) <br> = 100 * 1.061 <br> = 106.12</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 36

| Modeling | 1076

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td>Ln (N)</td>
        <td>Calculates the natural logarithm of N, or the inverse of the exponential function. Ln calculates the exponent necessary to raise Euler's constant, which equals about 2.718, to the value of N.<br><br>N must be a positive number.<br><br>Use Ln to measure exponential growth or decay.<br><br>Example: Calculate the continuous compound growth rate of revenue over time.</td>
        <td>Replace N and with account references, numbers, or formula expressions.<br><br>**Existing values:**<br>Revenue 2024: ACCT.001 = 100,000<br>Desired value: 500,000<br>Periods to reach desired value = 4.<br><br>**Expression:**<br>Divf (Ln (Divf (500,000, ACCT.001 [time = 2024]), 4)<br><br>**Calculation:**<br>= Divf (Ln (Divf (500,000, 100,000), 4<br>= Divf (Ln (5), 4)<br>= Divf (1.609, 4)<br>= .402<br><br>Converted to percent: 40.2% compounded growth.</td>
    </tr>
    <tr>
        <td>Greatest (N1, N2, ...)</td>
        <td>Populates the cell with the largest value of a series.<br><br>Use Greatest to identify the maximum value among multiple options.<br><br>Example: Calculate commission-based compensation when you also provide a minimum salary.</td>
        <td>Replace N1, N2 and so on with account references, numbers, or formula expressions, separating each term with commas.<br><br>**Existing values:**<br>Salary Minimum: ASSUM.001 = 30,000<br>Gross Sales: ACCT.001 = 50,000<br>Commission Rate: 20%<br><br>**Expression:**<br>Greatest (ASSUM.001, (ACCT.001 * .2))<br><br>**Calculation:**<br>= Greatest (30,000, (50,000 * .2)<br>= Greatest (30,000, 10,000)<br>= 30,000</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 37

| Modeling | 1077

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td>Least (N1, N2, ...)</td>
        <td>Populates the cell with the smallest value in a series. <br> Use Least to identify the minimum value among multiple options. <br> Example: Calculate prices that don't exceed the competition.</td>
        <td>Replace N with account references, numbers, or formula expressions, separating each term with commas. <br> **Existing values:** <br> Cost: ACCT.001=200 <br> Competitor Price: ACCT.002 = 250 <br> Pricing Strategy: 20% minimum profit. <br> **Expression:** <br> Least ((ACCT.001 + (ACCT.001 * .2), ACCT.002) <br> **Calculation:** <br> = Least ((200 + (200 * .2)), 250) <br> = Least ((200 + 40), 250) <br> = Least (240, 250) <br> = 240</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 38

| Modeling | 1078

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td>Spread445 (N, M)</td>
        <td>Returns the value based on the theoretic allocation of another value across a specified number of months (M) using a 4-4-5, 4-5-4, or 5-4-4 accounting calendar.</td>
        <td>Replace N with account references, numbers, or formula expressions. Replace M with the number of periods or remove to calculate over a 12-period spread.</td>
    </tr>
    <tr>
        <td>Spread454 (N, M)</td>
        <td></td>
        <td>**Existing Values:**</td>
    </tr>
    <tr>
        <td>Spread545 (N, M)</td>
        <td>Example: Use to calculate revenue based on an allocation over a specific period. See <u>Concept: Spread Formula Functions</u> on page 1069.</td>
        <td>Revenue: ACCT.001 = 100,000</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>**Expression:**</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>Spread445 (ACCT.001, 6)</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>**Calculations:**</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>*Step 1.* Calculates the number of weeks in the period:</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>= 6 months</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>= 2 quarters with 13 weeks each</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>= 2 * 13</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>= 26 weeks</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>*Step 2.* Calculates the value per week:</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>= 100,000 / 26</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>= 3,836.</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>*Step 3.* Multiplies by 4 or 5 based on the current period:</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>If the 1st or 2nd month in the quarter (Jan, Feb, Apr, May, Jul, Aug, Oct, Nov):</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>= 3836 * 4</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>= 15,386</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>If 3rd month in the quarter (Mar, Jun, Sept, Dec):</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>= 3836 * 5</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>= 19,231</td>
    </tr>
</table>
Spread445 (N, M)
Spread454 (N, M)
Spread545 (N, M)

©2025 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 39

| Modeling | 1079

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td>Npv (discount_rate, value1, value2, ..., valueN)</td>
        <td>Returns the present value of future cash flows, discounted back to the present time. <br><br> The formula divides the first value by the discount rate plus 1. It divides the 2nd value by the discount rate plus 1 taken to the 2nd power. It divides the 3rd value by the discount rate plus 1 taken to the 3rd power and so on. <br><br> The NPV function in Adaptive Planning does not factor in the initial investment cost. You need to subtract this cost separately to obtain the true Net Present Value. The accuracy of the NPV calculation depends heavily on the accuracy of the projected cash flows and the chosen discount rate. <br><br> Example: Calculate the potential profitability of an investment taking into the account the cost of capital with the discount rate compounded over time. <br><br> Best to: <br> * Modify a single account with time ranges to replace value1, value2... etc.. <br> * Subtract the initial value of the investment from the calculation.</td>
        <td>Replace discount_rate with minimum rate of return required to justify the investment. Replace value1, value2,...value N with a cashflow account modified by a time range to capture the potential return over time. <br><br> **Existing values:** <br> Discount_rate = 8% <br> Cashflow: ACCT.001 = <br> 100 for the 1st year <br> 200 for the 2nd year <br> 300 for the 3rd year <br><br> **Expression:** <br> NPV(0.08, ACCT.001 [time = this.year : this.year+2] <br><br> **Calculation for value1:** <br> = 100 / 1.08 <br> = 92.59 <br><br> **Calculation for value2:** <br> = 200 / (1.08 * 1.08) <br> = 200 / 1.17 <br> = 170.94 <br><br> **Calculation for value3:** <br> = 300 / (1.08 * 1.08 * 1.08) <br> = 300 / 1.26 <br> = 238.10 <br><br> **Full calculation:** <br> value1 + value2 + value3 <br> = 92.59 + 170.94 + 238.10 <br> = 501.63 <br><br> A positive integer suggests that the future cashflow is greater than the cost.</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved | Workday Proprietary and Confidential

## Page 40

| Modeling | 1080

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td>Irr (value1, value2, ..., valueN, estimated\_irr)</td>
        <td>Estimates the internal rate of return for a series of cash flows. Uses up to 600 iterations to get close to the true value of the internal rate of return. Use to evaluate the profitability of an investment or project. See Concept: IRR Formula Function on page 1067.</td>
        <td>Replace value1 with either a cashflow account modified by a range of time or replace each value with different cashflow accounts. Replace estimated\_irr with your estimate, or remove to use the default, which is 0.1. **Existing values:** N/A **Expression:** IRR(ROW.Cashflow[time=this:this +36], 0.2) **Calculation:** N/A</td>
    </tr>
    <tr>
        <td>Abs (N)</td>
        <td>Returns the positive value of any number. Use when you need to avoid negative numbers in your calculations. Example: Identify the magnitude of variances in Net Income, regardless of whether it's a profit or a loss.</td>
        <td>Replace N with account references, numbers, or formula expressions. **Existing Values:** Net Income in 2023: ACCT.001 = 100,000 Net Income in 2022: ACCT.001 = 150,000 **Expression:** Abs ((ACCT.001 [time = FY2023]) - (ACCT.001 [time = FY2022])) **Calculation:** = Abs (100,000 - 150,000) = Abs (-50,000) = 50,000</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 41

| Modeling | 1081

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td>Sqrt (N)</td>
        <td>Calculates the square root of the number (N).<br>Example: Convert monthly volatility to annual volatility.</td>
        <td>Replace N with account references, numbers, or formula expressions that capture a variance.<br><br>**Existing Values:**<br>Monthly Volatility: ACCT.001 = 5%<br><br>**Expression:**<br>ACCT.001 * Sqrt (12)<br><br>**Calculation:**<br>= 0.05 * Sqrt (12)<br>= .05 * 3.46<br>= .17<br>= 17%</td>
    </tr>
</table>
### Trigonometry Functions

Use trigonometry functions to measure cyclical patterns in data, like:
* Seasonal trends in sales.
* Price fluctuations in stocks.
* Distances for territory mapping. See Example: Calculate Distances for Territory Optimization on page 996.

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td>Radians (N)</td>
        <td>Converts the degree of an angle, N, into Radians using Pi (3.14).<br>Radians = (N * Pi) / 180<br><br>Use in combination with other trigonometry functions. Radians function converts degrees to radians so that you can calculate other trigonometry functions, like Sine and Cosine.</td>
        <td>Replace N with an expression that measures an angle in degrees.<br><br>**Expression:**<br>Radians (270)<br><br>**Calculation:**<br>= (270 * 3.14) / 180<br>= 847.8 / 180<br>= 4.71</td>
    </tr>
    <tr>
        <td>Sin (N)</td>
        <td>Calculates the sine of a right-angle triangle where N is the degree of an angle converted to radians.<br>Sine = quotient of<br>* The length of the opposite side, or the shorter side of the triangle.</td>
        <td>Replace N with an expression that calculates radians.<br><br>**Expression:**<br>Sin (Radians(30))<br><br>**Calculation:**<br>= .5</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 42

| Modeling | 1082

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
        <th>Example</th>
    </tr>
    <tr>
        <td></td>
        <td>• The length of the hypotenuse, or the side opposite the right angle.</td>
        <td></td>
    </tr>
    <tr>
        <td>Cos (N)</td>
        <td>Calculates the cosine of a right-angle triangle where N is the degree of an angle converted into radians.<br>Cosine = quotient of:<br>• The length of the adjacent side, or the longer side of the triangle.<br>• The length of the hypotenuse, or the side opposite the right angle.</td>
        <td>Replace N with an expression that calculates radians.<br>**Expression:**<br>Cos (Radians(60))<br>**Calculation:**<br>= .5</td>
    </tr>
    <tr>
        <td>Asin (N)</td>
        <td>Calculates the arcsine of a right-angle triangle, where N is sine.<br>Arcsine calculates the angle of the opposite side and the hypotenuse.</td>
        <td>Replace N with an expression that calculates sine.<br>**Expression:**<br>Asin (-0.5)<br>**Calculation:**<br>= -0.52</td>
    </tr>
    <tr>
        <td>Acos (N)</td>
        <td>Calculates the arccosine of a right-angle triangle, where N is the cosine.<br>Arccosine calculates the angle of the adjacent side and hypotenuse.</td>
        <td>Replace N with an expression that calculates cosine.<br>**Expression:**<br>Acos (-0.5)<br>**Calculation:**<br>= 2.09</td>
    </tr>
</table>
**Related Information**

**Concepts**

Concept: Formula Building Blocks on page 1042

Concept: Calculate YTD Based on Periodic Values on page 1071

Concept: Spread Formula Functions on page 1069

Concept: Rounding with Formulas on page 1066

Concept: IRR Formula Function on page 1067

**Reference**

FAQ: Is there an average formula function? on page 1072

FAQ: What is the difference between Div, Divf, and the / symbol? on page 1072

**Reference: Formula Functions**

Formula functions are grouped into four categories: mathematical, logical, string and date. Each function and a brief explanation are defined in this topic.

**Note:** For simplicity, the descriptions in the table show formulas using comma separators. Some browser settings require you to use semicolon separators. The syntax columns shows both versions.

©2025 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 43

| Modeling | 1083

## Formula Assistant

### Help

Div (N, D)
Divides the numerator N by the denominator D and returns the quotient. If the denominator D is zero, returns zero.

+ - * () % div() = != < > and or not Function Mathematical Div Insert into Formula ?

Account
All

Search

1000_Assets - 1000 Assets

Mathematical
Logical
Date
String

**Mathematical Functions**

Mathematical functions are available as buttons. For example plus (=), minus (-), and multiply (*).
Additional selections are available from **Function > Mathematical**.

See Reference: Mathematical Formula Functions on page 1072.

**Logical Functions**

To include as part of an `If` statement, basic logic functions and comparisons are available as buttons. For example, logical and (AND), logical or (OR), and logical negation (NOT). Comparisons include equal to (=), greater than (>), less than (<), or not equal to (!=). You can also use (`<>`) for not equal.

Additional selections are available from **Function > Logical**:

<table>
<thead>
<tr>
<th>Syntax</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>Blank()</code></td>
<td>Returns the Blank value. This value displays as blank (rather than a zero), but evaluates identically to zero for formula purposes. Unlike a zero, it causes the IsBlank() function to return TRUE, but similar to a zero it is able to be suppressed when "suppress empty rows" is enabled on sheets or reports.</td>
</tr>
<tr>
<td><code>Error()</code></td>
<td>Causes a run-time evaluation error.<br/><br/>Example: <code>IF(ACCT.EffectiveHeadcount Headcount &lt; 0, Error(), ACCT.EffectiveHeadcount +ACCT.AddlHeadcount)</code><br/><br/>If the effective headcount is less than 0, return an error to help track down the underlying problem.</td>
</tr>
<tr>
<td><code>If (EXPR, T, F)</code><br/><code>If (EXPR; T; F)</code></td>
<td>Returns a numeric value (T) if Boolean expression (EXPR) is true, otherwise returns a numeric value (F). You can use Boolean and comparison operators to construct the Boolean expression.</td>
</tr>
</tbody>
</table>

©2025 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 44

| Modeling | 1084

<!-- layout: qemr, tzzc -->
## Syntax | Description
--- | ---
Iff (EXPR, T, F)  Iff (EXPR; T; F) | The "fast" or short-circuiting form of the If function. Returns the same value as If. However, if the condition is true, the third argument to the function is not evaluated. Similarly, if the condition is false, the second argument is not evaluated. This means that either the second or third argument could potentially contain errors but the results of Iff will still be valid because the argument that includes the error is not evaluated.

**Examples:**
* IFF (this.Version.isActuals, ACCT.TravelExp, ACCT.Personnel.EstimatedTravel)
* IFF (this.Qtr.PositionOf(this.Month) = 2, 100000, 0)

IsBlank (N) | Returns true if the argument is blank or empty, false otherwise. Can only be used in an expression argument (EXPR) to the If function. **Example:** If(IsBlank(Row.StartDate),0,1)

©2025 Workday, Inc. All rights reserved

Workday Proprietary and Confidential

## Page 45

| Modeling | 1085

## Syntax | Description
--- | ---
Switch (Orig_EXPR, Case1, Case2, ..., Default) | Provides a method for writing compact expressions that can be used instead of complex, nested If statements.
Switch (Orig_EXPR; Case1; Case2; ...; Default) | 
* The first argument (Orig_EXPR) is the original expression (sometimes called the *control expression*) that is evaluated first.
* The subsequent arguments are Cases (values and corresponding expressions) that can be activated depending on which case matches the value of the original expression.
* You can define one or more cases. Each case consists of a value (N) and an expression (EXPR) separated by a comma. The expanded syntax looks like this: Switch (Orig_EXPR, N1, EXPR1, N2, EXPR2, ..., Default)
* For example, if the value of the original expression matches the value defined in Case1, the expression associated with Case1 is returned. But, if the value of the original expression matches Case2, the expression associated with Case2 is returned, and so on.
* If there is no match, Switch returns the Default expression.
* All expressions (EXPR) in the Switch statement must be the same data type (string, date, number, etc.). If the expressions vary in data type, this error appears: Inconsistent Switch return types
* Instead of a single value (N) for each case, you can specify a Range (L, U) of values where L is the lower bound of the range and U is the upper bound of the range. For example, a range might include a number of years Range (2014, 2017) and when the value of the original expression falls within that range, inclusive, the expression associated with that range is activated.
* Each argument to a range must be the same data type (for example, a number like 7, a string constant like Engineering or a date constant built using the existing Date() function or an expression which resolves to the proper data type (e.g. `this.Version.Name` or `ACCT.Rent`).

**Examples:**
* Switch (ROW.DAY, 1, "Sunday", 2, "Monday", 3, "Tuesday", "No match") If ROW.DAY is 2, then Monday is the expression that corresponds to the value 2, so the Switch result is Monday.
* Switch (ToNumber(ROW.CaseQty), Range(0,11), 0, Range(12,24), 1, Range(24,48), 4, 0) This second example returns 0, 1, or 4 depending on the numeric value found in the CaseQty selector.

©2025 Workday, Inc. All rights reserved | Workday Proprietary and Confidential

## Page 46

| Modeling | 1086

## Date and Time Functions

Date functions are often used in combination with modeled sheet **Date** columns. Date functions only display in modeled sheet calculated accounts.

![screenshot of a software interface showing date entry columns and a table with Name, Code, and Type columns](page_46_image_1_v2.jpg)

The date functions apply to calendars with Month > Quarter > Year configurations. If you have a calendar that uses a different structure, many of these functions return errors. Consider using this function instead: `this.version.positionOf(D.strata)`. Replace D with a calendar date in this format: yyyy,mm,dd and replace strata with the strata that you use in your calendar. Example: `this.version.positionOf(2024,01,02.week)` returns the first week of 2024.

<table>
  <thead>
    <tr>
      <th>Syntax</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>D.Month.NumberOfDays</td>
      <td>Returns the number of days in the month in which date D occurs.</td>
    </tr>
<tr>
      <td>D.Year.PositionOf(D.Month).</td>
      <td>Returns the month of the fiscal year in which date D occurs.</td>
    </tr>
<tr>
      <td>D.Year.PositionOf(D.Qtr)</td>
      <td>Returns the quarter of the fiscal year in which date D occurs.</td>
    </tr>
<tr>
      <td>(Date).stratum_code</td>
      <td>Returns the <mark>Timeperiod</mark> of the requested strata type which contains the (single, Gregorian) Date. Any date can be used as the base of the stratum code. <b>Example:</b> ToDate (2016,8,5).Qtr returns the fiscal calendar quarter that contains Aug 5 2016.</td>
    </tr>
<tr>
      <td>Day (D)</td>
      <td>Returns the day of the month for date (D).</td>
    </tr>
<tr>
      <td>DaysInMonth (D)</td>
      <td>Returns the number of days in a month in which date D occurs. May return an error or an incorrect value for custom calendars. Use D.Month.NumberOfDays instead.</td>
    </tr>
<tr>
      <td>FiscalMonth (D)</td>
      <td>Returns the month of the fiscal year in which date (D) occurs. May return an error for custom calendars. Use D.Year.PositionOf(D.Month).</td>
    </tr>
  </tbody>
</table>

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 47

| Modeling | 1087

## Syntax | Description
--- | ---
`FiscalQuarter (D)` | Returns the quarter of the fiscal year in which date (D) occurs. May return an error for custom calendars. Use `D.Year.PositionOf(D.Qtr)`.
`FiscalYear (D)` | Returns the fiscal year in which date (D) occurs. May return an error for custom calendars. Try coding your years with numbers that exactly match the year and use `ToNumber(D.Year.code)`.
`Month (D)` | Returns the month in which date (D) occurs.
`Quarter (D)` | Returns the calendar quarter in which date (D) occurs. This may not be the same as your company's fiscal quarter (see below).
`this.Version.PositionOf(D.Month)` | Returns a number that represents the month of the version in which the date D occurs (first month = 0). This number can be negative if the date D is earlier than the start of the version.
`this.Version.PositionOf(D.Year)` | Returns a number that represents the year of the version in which the date D occurs (first year = 0). This number can be negative if the date D is earlier than the start of the version.
`TimeFraction (D1, D2, D, Dx)``TimeFraction (D1; D2; D; Dx)` | Returns the portion of the current month which occurs between the start date (D1) and the end date (D2). If an optional date (D) is specified, uses the month in which D occurs, instead of the current month. If the optional fixed number of days parameter (Dx) is specified, override the time period in D with the numeric value.Instances configured without a custom calendar can use `MonthFraction` instead of `TimeFraction`.
`ToDate (Y, M, D)``ToDate (Y; M; D)` | Returns the date specified by the given year (Y), month (M), and day (D). If D is omitted, 15 is used. The value returned may be used as an argument in other functions which take a date.
`VersionMonth (D)` | Returns a number that represents the month of the version in which the date (D) occurs (first month = 0). This number can be negative if the date (D) is earlier than the start of the version.May return an error for custom calendars. Use `this.Version.PositionOf(D.Month)`.
`Version.PositionOf (timeperiod)` | Returns the relative order of the provided time period within the entire span of the version. The first time period in a version starts with 1 and the order number can be negative if the time period occurs before the start of the version. This function also works with a time period that is beyond the end of the version.

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 48

| Modeling | 1088

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
    </tr>
    <tr>
        <td>VersionYear (D)</td>
        <td>Returns a number that represents the year of the version in which the date (D) occurs (first year = 0). This number can be negative if the date (D) is earlier than the start of the version. <br> May return an error for custom calendars. Use `this.Version.PositionOf(D.Year)`.</td>
    </tr>
    <tr>
        <td>Year (D)</td>
        <td>Returns the year in which date (D) occurs regardless of whether a custom calendar is used or not.</td>
    </tr>
</table>
## String Functions

<table>
    <tr>
        <th>Syntax</th>
        <th>Description</th>
    </tr>
    <tr>
        <td>Concat (text1, text2, ...) <br> Concat (text1; text2; ...)</td>
        <td>Returns a concatenated string by joining two or more text strings. **Example:** `Concat ("hello", "world")` returns `"helloworld"`.</td>
    </tr>
    <tr>
        <td>Length (text)</td>
        <td>Returns the number of characters in a text string. **Example:** `Length ("Now, is the winter of our discontent. Made glorious summer by this son or York.")` returns `79`.</td>
    </tr>
    <tr>
        <td>Search (source_text, search_text) <br> Search (source_text; search_text)</td>
        <td>Returns the starting position of `search_text` in `source_text`. Returns `0` if `search_text` is not found. Search is not case-sensitive. <br> **Examples:** `Search ("Now is the winter of our discontent.", "Winter")` returns `12`. `Search ("Now is the winter of our discontent.", "Summer")` returns `0`.</td>
    </tr>
    <tr>
        <td>Substring (source_text, start_position, length) <br> Substring (source_text; start_position; length)</td>
        <td>Returns a text string containing the characters found in `source_text` starting at `start_position` (where position 1 is the first character of the text string) and running for `length` (or up to the end of the text string, whichever is encountered first). <br> Selecting a `start_position` of 0 or less is treated as though it were position 1. Selecting a length of 0 or less is treated as a length of 0 and returns an empty string. Selecting a `start_position` which is after the end of `source_text` returns an empty string.</td>
    </tr>
    <tr>
        <td>ToNumber (text)</td>
        <td>Converts a text string representing a number to its numeric value. Will convert the leading part of the string until a non-numeric character is found. **Examples:** `ToNumber ("7")` returns `7`. `ToNumber ("2017-12-31")` returns `2017` (a number). `ToNumber ("Sample")` returns `0`.</td>
    </tr>
</table>
## Examples

The following is a Headcount formula from a Personnel modeled sheet. It is a good example of how functions can be combined. This formula returns a binary result: 1 or 0.

©2025 Workday, Inc. All rights reserved
Workday Proprietary and Confidential

## Page 49

| Modeling | 1089

If(this.Version.PositionOf(this.Month) >=
this.Version.PositionOf(ROW.StartDate.Month) # if this month is after
the person's start date and (isblank(ROW.EndDate) # and either they
have no termination date or this.Version.PositionOf(this.Month) <=
Version.PositionOf(ROW.EndDate.Month)), # or the current month is before
termination date 1, # return 1 for their headcount in this month 0) #
otherwise, return 0

**Related Information**
**Reference**

Reference: Mathematical Formula Functions on page 1072

**Reference: Dot Notation for Properties**

Similar to object references in programming languages, you can use *dot notation* in formulas. Dot notation is particularly useful in formulas with IFF statements because it allows the formula to vary based on current location. As an example, the following formula calculates a metric differently in an actuals version than in a plan version:

Example: The formula calculates a metric one way in actuals and an other way in plan versions:
`IFF(this.Version.IsActuals, ACCT.ActualsValue, ACCT.PlanValue)`

Example: For browsers that use commas for decimals: `IFF(this.Version.IsActuals; ACCT.ActualsValue; ACCT.PlanValue)`

**Note:** Formulas using dot notation properties to reference dimension values, attribute values, and levels must refer to them using Code to avoid ambiguity when their names match. If you change the Code for a dimension value, attribute value, or level, update your formulas to match the Code.

**Operands**

Operand expression syntax makes use of the standardized `this` term to indicate a cell's current location.

<table>
<thead>
<tr>
<th>Property</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td>this.Version</td>
<td>Returns a version object, which can be combined with additional dot (.) properties such as <code>this.Version.Name</code>. Refer to Object Types below.</td>
</tr>
<tr>
<td>this.Level</td>
<td>Returns a level object, which can be combined with additional dot (.) properties.</td>
</tr>
<tr>
<td>this.Account</td>
<td>Returns an account object, when can be combined with additional dot (.) properties.</td>
</tr>
<tr>
<td>this.dimension_name</td>
<td>Returns the dimension value of the current cell in the dimension specified. If the current cell has no value for the specified dimension, returns an empty (blank) object. This property is only accessible if the dimension has a name that is a legal identifier (starts with a non-digit and consists only of letters, numbers, and the underscore). Dimensions with non-identifier names (such as those with more than one word in their name) are not retrievable in a formula.</td>
</tr>
</tbody>
</table>

©2025 Workday, Inc. All rights reserved Workday Proprietary and Confidential

## Page 50

| Modeling | 1090

<table>
    <tr>
        <th>Property</th>
        <th>Description</th>
    </tr>
    <tr>
        <td>`this.attribute_name`</td>
        <td>Returns the attribute value of the current cell in the attribute specified. If the current cell has no value for the specified attribute, returns a empty object. This property is only accessible if the attribute has a name that is a legal identifier (starts with a non-digit and consists only of letters, numbers, and the underscore). Attributes with non-identifier names (such as those with more than one word in their name) are not retrievable in a formula.</td>
    </tr>
    <tr>
        <td>`this.&lt;stratum_code&gt;`</td>
        <td>Returns the Timeperiod of the requested strata type which contains the current cell's time coordinate. If the requested strata is below (finer-grained than) the current cell's statum, this function returns the *first* Timeperiod of that stratum found in the scope of the current cell's stratum.</td>
    </tr>
</table>
**Object Types**

Data types represent objects, allowing the "dot notation" to access properties of those objects. The available object properties are:

**Version**

Refers to various properties of the current version in an IF statement.

Example: `IF (this.Version.Name = "Budget 2018", x, y)`

Example: For browsers that use commas for decimals: `IF (this.Version.Name = "Budget 2018"; x; y)`

<table>
    <tr>
        <th>Property</th>
        <th>Description</th>
    </tr>
    <tr>
        <td>Version.Name</td>
        <td>Returns the string representing the version's name. If an actuals cell is being overlaid on a plan version, the actuals version is considered to be the version of the cell.</td>
    </tr>
    <tr>
        <td>Version.ShortName</td>
        <td>Returns the string representing the version's short name.</td>
    </tr>
    <tr>
        <td>Version.Description</td>
        <td>Returns the string representing the version's description.</td>
    </tr>
    <tr>
        <td>Version.Type</td>
        <td>Returns a string representing the version's type, as returned in the exportVersions API. Returns one of the following: PLANNING, ACTUALS, VERSION_FOLDER, JOURNAL_ENTRY.</td>
    </tr>
    <tr>
        <td>Version.StartDate</td>
        <td>Returns a date value representing the first day of the time period which is the start of the version.</td>
    </tr>
    <tr>
        <td>Version.EndDate</td>
        <td>Returns a date value representing the last day of the time period which is the end of the version.</td>
    </tr>
</table>
©2025 Workday, Inc. All rights reserved

Workday Proprietary and Confidential


### Extracted images (132):
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/img_p16_1.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/img_p16_2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/img_p17_1.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/img_p17_2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/img_p17_3.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/img_p17_4.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/img_p18_1.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/img_p43_1.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/img_p43_2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/img_p46_1.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_1.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_10.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_10_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_10_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_11.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_11_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_12.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_12_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_13.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_13_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_14.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_14_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_15.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_15_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_16.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_16_image_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_17.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_17_image_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_17_image_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_18.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_18_image_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_18_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_18_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_19.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_19_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_19_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_20.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_20_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_20_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_21.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_22.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_22_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_22_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_23.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_23_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_24.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_24_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_25.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_25_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_26.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_26_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_26_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_26_table_3_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_27.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_27_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_28.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_28_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_29.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_29_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_2_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_3.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_30.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_30_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_31.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_31_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_31_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_31_table_3_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_31_table_4_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_32.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_33.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_33_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_33_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_34.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_34_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_35.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_35_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_36.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_36_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_37.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_37_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_38.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_38_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_39.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_39_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_3_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_4.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_40.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_40_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_41.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_41_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_41_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_42.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_42_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_43.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_43_image_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_43_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_44.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_44_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_45.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_45_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_46.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_46_image_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_46_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_47.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_47_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_48.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_48_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_48_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_49.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_49_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_4_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_5.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_50.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_50_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_50_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_51.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_51_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_51_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_5_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_6.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_6_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_6_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_7.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_7_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_7_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_8.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_8_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_8_table_2_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_9.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_9_table_1_v2.jpg`
- `parsed-documents://20260430-073603-790783/Adaptive_Planning_Formula_Documentation_2-3.pdf/images/page_9_table_2_v2.jpg`