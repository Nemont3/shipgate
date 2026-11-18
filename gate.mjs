// ShipGate harness: serve the app, verify it with Kane CLI, record the run,
// and (only on a pass, with --deploy) ship it. A failing run never deploys.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join } from 'node:path';

const PORT = process.env.PORT || 8371;
const OBJECTIVE = process.env.SHIPGATE_OBJECTIVE ||
  `Go to http://localhost:${PORT}/ and do the following: in the "New release check" field type "Write release notes" and click "Add item". Then type "Tag the version" and click "Add item" again. Then check both checkboxes in the list. Finally verify that the Readiness shows 100% and that the text "READY TO SHIP" is visible on the page.`;

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
console.log(`ShipGate app served at http://localhost:${PORT}/`);

function runKane() {
  return new Promise(resolve => {
    const child = spawn('kane-cli', ['run', OBJECTIVE, '--headless', '--agent'], { env: process.env });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; process.stderr.write(d); });
    child.on('close', code => resolve({ code, out, err }));
    child.on('error', e => resolve({ code: 2, out: '', err: String(e) }));
  });
}

const { code, out } = await runKane();
server.close();

let parsed = null;
try { parsed = JSON.parse(out.trim().split('\n').pop()); } catch { /* Kane prints one JSON object; anything else is recorded raw */ }

const result = code === 0 ? 'pass' : code === 1 ? 'fail' : 'error';
const note = result === 'pass' ? 'Kane verified the release flow end to end.'
  : result === 'fail' ? 'Kane caught a failure in the release flow. See KANE_FAILURE.md.'
  : `Kane run errored (exit ${code}).`;

const history = JSON.parse(await readFile('history.json', 'utf8'));
history.runs.push({ timestamp: new Date().toISOString(), result, exitCode: code, note });
await writeFile('history.json', JSON.stringify(history, null, 2) + '\n');

if (result === 'fail') {
  await writeFile('KANE_FAILURE.md',
    `# Kane failure report\n\nExit code: ${code}\n\n## Kane JSON result\n\n\`\`\`json\n${out}\n\`\`\`\n\nThe coding agent reads this file, fixes the app, and re-runs the gate.\n`);
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
  });
  await git(['add', '-A']);
  await git(['commit', '-m', `ShipGate: verified pass ${new Date().toISOString()}`]);
  await git(['push']);
  console.log('GATE: deployed (committed and pushed; GitHub Pages serves the repo).');
} else {
  console.log('GATE: pass recorded in history.json. Re-run with --deploy to ship.');
}
