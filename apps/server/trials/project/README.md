# tally

Reads a bank's CSV export and prints totals.

```sh
node src/index.ts data/sample.csv
node src/index.ts data/sample.csv --by category
```

The CSV columns are `date,description,category,amount`, with amounts in dollars
(negative for refunds).
