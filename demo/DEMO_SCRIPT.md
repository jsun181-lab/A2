# 2-Minute Demo Script

## English Voiceover Script

0:00-0:15

Hello everyone. This is DataInsight Agent, a CSV cleaning and analysis software agent. It shows the full agent loop: perceive input, decide what to do, act on the data, and remember the result.

0:15-0:35

I start by opening the local web app and clicking Load Sample. The sample sales dataset has missing values, a duplicate row, inconsistent category names, and a clear revenue outlier.

0:35-0:55

Next, I keep Balanced mode selected and click Run Agent. In the perception stage, the agent detects rows, columns, data types, missing values, outliers, and the starting data quality score.

0:55-1:15

In the decision stage, the agent builds a cleaning plan. Balanced mode removes duplicates, fills missing values, standardizes Region and Product, and flags outliers instead of directly changing them.

1:15-1:35

Then the agent acts on the dataset. The quality score improves from 94 to 98, and the action list shows each cleaning step, including the duplicate removal and Revenue outlier review flag.

1:35-1:50

In the analysis section, the agent creates multiple charts: bar, donut, histogram, line, and scatter. I can click Expand to inspect a larger chart preview.

1:50-2:00

Finally, I can export the cleaned CSV and review recent checkpoints in Memory. Switching to Aggressive mode changes the decision strategy, showing that the agent adapts its actions based on risk.
