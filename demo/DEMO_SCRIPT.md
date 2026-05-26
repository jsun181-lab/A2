# 2-Minute Demo Script

## English Voiceover Script

0:00-0:15

Hello everyone. This project is called DataInsight Agent. It is an intelligent software agent for CSV data cleaning and analysis. The goal is not only to display a dataset, but to demonstrate a full agent loop: perceiving input, making decisions, taking actions, and remembering recent results.

0:15-0:35

First, I open the local web application. The control panel on the left lets the user upload a CSV file or load a sample dataset. Here I click Load Sample. The sample sales dataset contains common data quality problems, including missing values, duplicate rows, inconsistent category capitalization, and a clear revenue outlier.

0:35-0:55

Next, I keep the cleaning mode set to Balanced and click Run Agent. The agent first enters the perception stage. It identifies the number of rows and columns, infers each column's data type, counts missing values and outliers, and calculates an overall data quality score.

0:55-1:15

Then the agent moves into the decision stage. Based on the selected cleaning mode, it automatically creates a cleaning strategy. In balanced mode, it removes duplicate rows, fills missing values, standardizes category fields such as Region and Product, and flags outliers instead of directly changing them. This shows that the agent can make decisions based on risk.

1:15-1:35

After that, the agent takes action. It applies the cleaning plan and improves the data quality score from 94 to 98. The action list shows exactly what was changed, such as removing one duplicate row, filling missing Region and Revenue values, and adding a review flag for the Revenue outlier.

1:35-1:50

Now I move to the analysis section. The agent does not generate only one chart. It selects multiple chart types based on the detected data columns, including a bar chart, donut chart, histogram, line chart, and scatter plot. I can also click Expand to open a larger chart preview, which makes the results easier to inspect.

1:50-2:00

Finally, the user can export the cleaned CSV and check the Memory panel for recent analysis checkpoints. If I switch to Aggressive mode, the agent makes a different decision, such as capping outliers and increasing the risk level. This prototype demonstrates a complete intelligent software agent cycle: perceive, decide, act, and remember.
