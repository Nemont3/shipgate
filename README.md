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
the board could never reach READY TO SHIP. Kane caught it (exit 1; its step trace shows each
box clicked once, then its final check, that readiness shows 100% and READY TO SHIP, failing),
the cap was then reverted, and the re-run passed. That failure is in the
history on the live page, and in this repo's `history.json`. Kane's agent also flubbed one run
of its own, re-clicking a box it had already checked; that failure is in the history too.

## Verification history

Every gate run, in order. Proof links open Kane's own run report in Test Manager.

| # | Time (UTC) | Verdict | What happened | Proof |
|---|------------|---------|---------------|-------|
| 1 | 2026-11-18 14:16:50 | FAIL | Kane's agent re-clicked an already-checked item and toggled it off, so readiness never reached 100%; the app behaved correctly. | [Test Manager](https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7QG133QQMB4BG7A7KA04EFY/dashboard/share/US_8TZG3XTK3V7LEPSLESN4YCZ863E9H2EI0BAW9W5MLAQB38SKF5KTP93FN0MPGHTQ?type=summary&agentView=true&fqdn=summary-page) |
| 2 | 2026-11-18 14:24:33 | PASS | Baseline: Kane completed the release checklist on the board. | [Test Manager](https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7QGBTMGBE14JTAAAN7SGTM9/dashboard/share/US_KQAWS8Y9PN57NO87KIL209TGTL1HLY12CVDN8FA8ZVNVFPVJHT3T49BONAYVQVMN?type=summary&agentView=true&fqdn=summary-page) |
| 3 | 2026-11-18 14:26:51 | FAIL | The planted-bug run. Kane's summary blames a re-click; its step trace shows each box clicked once, then the 100% check failing, which is the planted cap. The gate acts on Kane's exit code, not its summary. | [Test Manager](https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7QGRCYR9EF2RTV14Z6GPMG8/dashboard/share/US_ANAJWBXOOWQMRTIJ8KSIE3RXAY0E09LJ793D9VGM29R1E8PWQS76KWV6VNBJ94HW?type=summary&agentView=true&fqdn=summary-page) |
| 4 | 2026-11-18 14:29:27 | PASS | After the fix, Kane completed the checklist and the gate deployed. | [Test Manager](https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7QGVW7TC45A0F88H0R4J03M/dashboard/share/US_EAX1VIXSIID8FW5S8N3ZUVT193T6KQFW1U6QVE6LLS0XL9OEBI6I4F27Z1T63BSF?type=summary&agentView=true&fqdn=summary-page) |

## Reproduce the catch

The planted bug ships as a patch, so the central claim is checkable in two commands
(after the setup in "Run it yourself"):

```sh
git apply planted-bug.patch   # cap readiness at 99%
node gate.mjs                  # Kane runs the flow; the gate refuses (exit 1) and writes KANE_FAILURE.md
git apply -R planted-bug.patch # remove the cap
node gate.mjs                  # Kane passes; add --deploy to ship on a pass
```
