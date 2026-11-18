# ShipGate

An app that refuses to deploy until Kane CLI verifies it, built for the KaneCLI Online Hackathon.

ShipGate is a tiny release board: add release checks, tick them off, and a readiness score climbs
to 100% and a READY TO SHIP state. The real project is the gate around it:

1. `gate.mjs` serves the app and runs Kane CLI against its flow in a real browser
   (`kane-cli run "<objective>" --headless --agent`).
2. Kane's JSON result and exit code decide what happens next. A failure is written to
   `KANE_FAILURE.md` and handed back to the coding agent, which fixes the app and re-runs the gate.
3. Only a pass deploys (commit + push; GitHub Pages serves this repo).
4. Every run, pass or fail, is appended to `history.json`, and the shipped page renders that
   history in its footer. The failures ship with the app, on purpose.

## Run it yourself

Requires Node 18+ and a free TestMu AI account (https://www.testmuai.com) with the
10,000 free hackathon credits claimed.

```sh
npm install -g @testmuai/kane-cli
export LT_USERNAME=<your TestMu username>
export LT_ACCESS_KEY=<your TestMu access key>
node gate.mjs            # verify only
node gate.mjs --deploy   # verify, and ship if Kane passes
```

## The proof run

During development one bug was planted in the readiness math. Kane caught it (exit 1), the fix
was made from Kane's own failure report, and the re-run passed. That failure is in the history
below the fold on the live page, and in this repo's `history.json`.
