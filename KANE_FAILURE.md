# Kane failure report

When: 2026-11-18T19:57:27.622Z
Exit code: 1

## What Kane found

Both checklist items were checked once, but the board showed 99% instead of 100% and did not display the required ready message.

Reason: Final verification failed: "Readiness shows 100% and the text "READY TO SHIP" is visible on the page."

Full run: https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7R3NNEXPF90H85K85B4JJF1/dashboard/share/US_SXG9BFFM3GCIHD0XNG076ZKDPQYQB4ZWUBOL15XQT7QS9AP478W80X9EHJ15WZRD?type=summary&agentView=true&fqdn=summary-page

## Steps

- Step 2 [running]: Step 1
- Step 2 [done]: navigate: Navigate to http://127.0.0.1:8371/
- Step 3 [running]: Step 2
- Step 3 [done]: wait: queued plan (2 steps): type "New release check"; click "Add item"
- Step 4 [running]: Step 3
- Step 4 [done]: type: Type "Write release notes" into "New release check"
- Step 5 [running]: Step 4
- Step 5 [done]: click: Click "Add item"
- Step 6 [running]: Step 5
- Step 6 [done]: type: Typing Tag the version in the New release check field
- Step 7 [running]: Step 6
- Step 7 [done]: click: Clicking Add item again on the release board
- Step 8 [running]: Step 7
- Step 8 [done]: click: Clicking the first item's checkbox to check it
- Step 9 [running]: Step 8
- Step 9 [done]: click: Clicking the second item's checkbox to check it
- Step 10 [running]: Step 9
- Step 10 [done]: analyze: The text "READY TO SHIP" is visible on the page.
- Step 11 [running]: Step 10
- Step 11 [failed]: assert: Readiness shows 100% and the text "READY TO SHIP" is visible on the page.

The coding agent reads this file, fixes the app, and re-runs the gate.
