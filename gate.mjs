// ShipGate harness: serve the app, verify it with Kane CLI, record the run,
// and (only on a pass, with --deploy) ship it. A failing run never deploys.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join } from 'node:path';

const PORT = process.env.PORT || 8371;
const APP_URL = `http://127.0.0.1:${PORT}/`;
const OBJECTIVE = process.env.SHIPGATE_OBJECTIVE ||
  `Verify the ShipGate release board. In the "New release check" field type "Write release notes" and click "Add item". Then type "Tag the version" and click "Add item" again. There are now two unchecked items and Readiness shows 0%. Click the first item's checkbox once to check it, then click the second item's checkbox once to check it. Do not click any checkbox more than once. Finally verify that Readiness shows 100% and that the text "READY TO SHIP" is visible on the page. Report pass only if both verifications match exactly.`;

const TYPES = { '.html': 'text/html', '.json': 'application/json', '.md': 'text/plain' };
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const body = await readFile(join(process.cwd(), path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(PORT, r));
console.log(`ShipGate app served at ${APP_URL}`);

function runKane() {
  return new Promise(resolve => {
    const child = spawn('kane-cli', ['run', OBJECTIVE, '--url', APP_URL, '--name', 'shipgate-release-verification', '--headless', '--agent'], { env: process.env });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; process.stderr.write(d); });
    child.on('close', code => resolve({ code, out, err }));
    child.on('error', e => resolve({ code: 2, out: '', err: String(e) }));
  });
}

const { code, out } = await runKane();
server.close();

// Kane's --agent mode streams NDJSON events; the run_end event carries the verdict.
const events = out.split('\n').filter(l => l.trim().startsWith('{')).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const runEnd = [...events].reverse().find(e => e.type === 'run_end') || null;
const stepRemarks = events.filter(e => e.step !== undefined && e.remark).map(e => `- Step ${e.step} [${e.status}]: ${e.remark}`);

let result;
if (runEnd && runEnd.status === 'passed') result = 'pass';
else if (runEnd && runEnd.status === 'failed') result = 'fail';
else result = code === 0 ? 'pass' : code === 1 ? 'fail' : 'error';

const note = result === 'pass' ? (runEnd?.one_liner || 'Kane verified the release flow end to end.')
  : result === 'fail' ? (runEnd?.one_liner || 'Kane caught a failure in the release flow. See KANE_FAILURE.md.')
  : `Kane run errored (exit ${code}).`;

const entry = { timestamp: new Date().toISOString(), result, exitCode: code, note };
if (runEnd?.test_url) entry.testUrl = runEnd.test_url;
if (runEnd?.credits_consumed) entry.credits = Math.round(runEnd.credits_consumed * 100) / 100;

const history = JSON.parse(await readFile('history.json', 'utf8'));
history.runs.push(entry);
await writeFile('history.json', JSON.stringify(history, null, 2) + '\n');

if (result === 'fail') {
  await writeFile('KANE_FAILURE.md',
    `# Kane failure report\n\nWhen: ${entry.timestamp}\nExit code: ${code}\n\n## What Kane found\n\n${runEnd?.one_liner || 'Kane reported a failure.'}\n\n${runEnd?.reason ? `Reason: ${runEnd.reason}\n\n` : ''}${runEnd?.test_url ? `Full run: ${runEnd.test_url}\n\n` : ''}## Steps\n\n${stepRemarks.join('\n') || '(no step remarks captured)'}\n\nThe coding agent reads this file, fixes the app, and re-runs the gate.\n`);
  console.log('GATE: FAIL. Failure written to KANE_FAILURE.md. Nothing deployed.');
  process.exit(1);
}
if (result === 'error') {
  console.log(`GATE: ERROR (exit ${code}). Nothing deployed.`);
  process.exit(2);
}

console.log('GATE: PASS. Kane verified the flow.');
if (process.argv.includes('--deploy')) {
  const git = args => new Promise(resolve => {
    const c = spawn('git', args, { stdio: 'inherit' });
    c.on('close', resolve);
    c.on('error', () => resolve(1));
  });
  await git(['add', 'index.html', 'history.json', 'README.md', 'gate.mjs']);
  const commitCode = await git(['commit', '-m', `ShipGate: verified pass ${new Date().toISOString()}`]);
  if (commitCode !== 0) {
    console.log('GATE: verified, but the local commit failed, so nothing is ready to deploy. See the git output above.');
    process.exit(4);
  }
  const pushCode = await git(['push']);
  if (pushCode === 0) {
    console.log('GATE: deployed (committed and pushed; GitHub Pages serves the repo).');
  } else {
    console.log('GATE: verified and committed locally, but the push failed, so this is NOT deployed. Push the commit to deploy.');
    process.exit(3);
  }
} else {
  console.log('GATE: pass recorded in history.json. Re-run with --deploy to ship.');
}
