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
4. Every run on this repo's deploy line, pass or fail, is appended to `history.json`, and the
   shipped page renders that history in its footer. The failures ship with the app, on purpose.

## Run it yourself

Requires Node 18+, a Chrome/Chromium for Kane to drive, and a free TestMu AI account
(https://www.testmuai.com) with the 10,000 free hackathon credits claimed.

```sh
npm install -g @testmuai/kane-cli
kane-cli login --oauth   # browser sign-in; no raw access keys in your shell
node gate.mjs            # verify only
node gate.mjs --deploy   # verify, and ship if Kane passes
```

## Closing the loop

Give the gate your own local coding agent and it drives the fix itself:

```sh
node gate.mjs --deploy --agent 'claude -p --permission-mode acceptEdits "Read {failure} and fix the app so the flow passes. Keep the change minimal."'
```

The gate runs your agent unattended, so the command has to be able to edit files without
stopping to ask: with Claude Code that is a permission mode, as in the example above.

On a Kane failure the gate writes `KANE_FAILURE.md`, invokes your agent with that report
(`{failure}` in the command is replaced with the report's path; the path is also in
`SHIPGATE_FAILURE_FILE`), then re-runs Kane. Bounds: `--max-attempts` (default 1),
`--max-diff` (default 400 changed lines), a 10-minute agent timeout, and `--dry-run`,
which still runs Kane and writes the failure report, then prints the agent invocation it
would run and stops without invoking the agent. The agent's diff is measured against the tree as
the agent found it, and it may never touch the gate itself, `history.json`,
`KANE_FAILURE.md`, or `planted-bug.patch`: an agent that edits the check has its fix
rejected, the tree restored, and the refusal recorded in the history. With `--agent` or
`--deploy` the working tree must start clean. Every attempt is logged in `history.json`
with the agent's command, the files it changed, its exit code, and its diff, and the
shipped page renders those attempts alongside Kane's runs. One limit, named plainly:
ShipGate verifies behaviour, not intent — an agent could fake the app instead of fixing
it, and only the diff it shows you would tell. Review the agent's diff.

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

Every run on this repo's deploy line, in order. (The gate was also exercised during
development on scratch copies, including scripted stand-in tests of the loop; those runs
are not in this history.) Proof links open Kane's own run report in Test Manager.

| # | Time (UTC) | Verdict | What happened | Proof |
|---|------------|---------|---------------|-------|
| 1 | 2026-11-18 14:16:50 | FAIL | Kane's agent re-clicked an already-checked item and toggled it off, so readiness never reached 100%; the app behaved correctly. | [Test Manager](https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7QG133QQMB4BG7A7KA04EFY/dashboard/share/US_8TZG3XTK3V7LEPSLESN4YCZ863E9H2EI0BAW9W5MLAQB38SKF5KTP93FN0MPGHTQ?type=summary&agentView=true&fqdn=summary-page) |
| 2 | 2026-11-18 14:24:33 | PASS | Baseline: Kane completed the release checklist on the board. | [Test Manager](https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7QGBTMGBE14JTAAAN7SGTM9/dashboard/share/US_KQAWS8Y9PN57NO87KIL209TGTL1HLY12CVDN8FA8ZVNVFPVJHT3T49BONAYVQVMN?type=summary&agentView=true&fqdn=summary-page) |
| 3 | 2026-11-18 14:26:51 | FAIL | The planted-bug run. Kane's summary blames a re-click; its step trace shows each box clicked once, then the 100% check failing, which is the planted cap. The gate acts on Kane's exit code, not its summary. | [Test Manager](https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7QGRCYR9EF2RTV14Z6GPMG8/dashboard/share/US_ANAJWBXOOWQMRTIJ8KSIE3RXAY0E09LJ793D9VGM29R1E8PWQS76KWV6VNBJ94HW?type=summary&agentView=true&fqdn=summary-page) |
| 4 | 2026-11-18 14:29:27 | PASS | After the fix, Kane completed the checklist and the gate deployed. | [Test Manager](https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7QGVW7TC45A0F88H0R4J03M/dashboard/share/US_EAX1VIXSIID8FW5S8N3ZUVT193T6KQFW1U6QVE6LLS0XL9OEBI6I4F27Z1T63BSF?type=summary&agentView=true&fqdn=summary-page) |
| 5 | 2026-11-18 19:57:27 | FAIL | The blocked self-test's Kane run: the cap was planted again and Kane failed the build, each box checked once, board at 99%. | [Test Manager](https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7R3NNEXPF90H85K85B4JJF1/dashboard/share/US_SXG9BFFM3GCIHD0XNG076ZKDPQYQB4ZWUBOL15XQT7QS9AP478W80X9EHJ15WZRD?type=summary&agentView=true&fqdn=summary-page) |
| 6 | 2026-11-18 19:57:27 | BLOCKED | Harness self-test: a scripted stand-in (not a coding agent) fixed the cap but also inserted a fake pass into `history.json`. The gate rejected the whole fix, restored the tree, and recorded the refusal. | Recorded by the gate; no Kane run |
| 7 | 2026-11-18 22:09:11 | FAIL | A planted regression (commit 412b5e2), its message neutral on purpose so the fixing agent could not read the answer from it. Kane checked each box once; the board stopped at 99%. | [Test Manager](https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7RB72FGVWV6CSTT4BSQ2WB5/dashboard/share/US_V1FW9OHNDPVJS0Y30WK71V7GYMWSSZAM2WWIONC0AB2FT3VWA85WB614JYD220Y1?type=summary&agentView=true&fqdn=summary-page) |
| 8 | 2026-11-18 22:11:24 | PASS | Claude Code, invoked by the gate on a Mac, fixed the regression from Kane's failure report and that commit's diff. It also noticed the repo's earlier self-test commits (Claude Code loads recent commits at startup) and said the cap might be another planted test; its fix rests on the latest commit and index.html. Kane passed on the re-run and the gate shipped it as 728f802. | [Test Manager](https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7RBAJTBDW5MDE5PSHH9463X/dashboard/share/US_S66H7YG46JEF8NXE0HEN774RL5V00HM8WR1LQ8LX8DGN2U400H1JMW3F7BCDFBZ5?type=summary&agentView=true&fqdn=summary-page) |

## Reproduce the catch

The planted bug ships as a patch, so the central claim is checkable in two commands
(after the setup in "Run it yourself"):

```sh
git apply planted-bug.patch   # cap readiness at 99%
node gate.mjs                  # Kane runs the flow; the gate refuses (exit 1) and writes KANE_FAILURE.md
git apply -R planted-bug.patch # remove the cap
node gate.mjs                  # Kane passes; add --deploy to ship on a pass
```
