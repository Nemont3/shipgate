# ShipGate

An app that refuses to deploy until Kane CLI verifies it, built for the KaneCLI Online Hackathon.

ShipGate is a tiny release board: add release checks, tick them off, and a readiness score climbs
to 100% and a READY TO SHIP state. The real project is the gate around it:

1. `gate.mjs` serves the app and runs Kane CLI against its flow in a real browser
   (`kane-cli run "<objective>" --url <the local app> --headless --agent`).
2. Kane's streamed verdict and exit code decide what happens next. A failure is written to
   `KANE_FAILURE.md` and handed back to the coding agent, which fixes the app and re-runs the gate.
3. Only a pass deploys (commit + push; GitHub Pages serves this repo). If the push fails, the
   gate says so out loud and exits without claiming a deployment.
4. Every run, pass or fail, is appended to `history.json`, and the shipped page renders that
   history in its footer. The failures ship with the app, on purpose.

## Run it yourself

Requires Node 18+, a Chrome/Chromium for Kane to drive, and a free TestMu AI account
(https://www.testmuai.com) with the 10,000 free hackathon credits claimed.

```sh
npm install -g @testmuai/kane-cli
kane-cli login --oauth   # browser sign-in; no raw access keys in your shell
node gate.mjs            # verify only
node gate.mjs --deploy   # verify, and ship if Kane passes
```

(The CLI also accepts `LT_USERNAME` / `LT_ACCESS_KEY` environment variables if you prefer
key-based auth.)

## The proof run

During development one bug was planted in the readiness math: readiness was capped at 99%, so
the board could never reach READY TO SHIP. Kane caught it (exit 1; its step trace showed both
boxes ticked with readiness stuck at 99%), the fix was made from Kane's own failure report, and
the re-run passed. That failure is in the history below the fold on the live page, and in this
repo's `history.json`. Kane's agent also flubbed one run of its own, re-clicking a box it had
already checked; that failure is in the history too.
