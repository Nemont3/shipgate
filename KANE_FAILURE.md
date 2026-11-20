# Kane failure report

When: 2026-11-20T15:07:21.314Z
Exit code: 1

## What Kane found

After each of the two release items was checked once, the board remained at 50% instead of reaching 100% and showing the ready message.

Reason: Final verification failed: "Readiness shows 100% and the text "READY TO SHIP" is visible on the page."

Full run: https://test-manager.lambdatest.com/projects/01M7QFHXAPEQH6WWREJZC35QEM/test-cases/01M7WQTDM7SJJ321SRSP4DW0DC/dashboard/share/US_GHQDGPI4TTL901EEDM9TUPIO6T7PCIIS3CNZC0RWNGPZK1E1G26LZ49Q90E8RU6L?type=summary&agentView=true&fqdn=summary-page

## Steps

- Step 2 [running]: Step 1
- Step 2 [done]: navigate: Navigate to http://127.0.0.1:8371/
- Step 3 [running]: Step 2
- Step 3 [done]: type: Typing Write release notes in New release check field
- Step 4 [running]: Step 3
- Step 4 [done]: scroll: Scrolling to the Add item button
- Step 5 [running]: Step 4
- Step 5 [done]: click: Clicking Add item
- Step 6 [running]: Step 5
- Step 6 [done]: type: Typing Tag the version into New release check field
- Step 7 [running]: Step 6
- Step 7 [done]: scroll: Scrolling to the Add item button on the ShipGate Release Board
- Step 8 [running]: Step 7
- Step 8 [done]: click: Clicking Add item button
- Step 9 [running]: Step 8
- Step 9 [done]: analyze: Readiness shows 0%.
- Step 10 [running]: Step 9
- Step 10 [done]: assert: There are now two unchecked items and Readiness shows 0%.
- Step 11 [running]: Step 10
- Step 11 [done]: click: Checking the first item's checkbox in the ShipGate release board list
- Step 12 [running]: Step 11
- Step 12 [done]: click: Checking the second item's checkbox in the ShipGate Release Board list
- Step 13 [running]: Step 12
- Step 13 [done]: analyze: The text "READY TO SHIP" is visible on the page.
- Step 14 [running]: Step 13
- Step 14 [failed]: assert: Readiness shows 100% and the text "READY TO SHIP" is visible on the page.

The coding agent reads this file, fixes the app, and re-runs the gate.
