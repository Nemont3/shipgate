// ShipGate harness: serve the app, verify it with Kane CLI, and (only on a pass,
// with --deploy) ship it. A failing run never deploys.
//
// With --agent "<cmd>" the gate closes the loop itself: on a Kane failure it
// invokes the developer's own local coding agent with KANE_FAILURE.md as the
// prompt surface, then re-runs Kane, until a pass (or the attempt budget runs
// out). The agent is never Muse's cloud session; it is whatever command the
// installing developer configures (e.g. `claude -p "..."` or `codex exec "..."`).
// Without --agent the gate behaves exactly as before: one run, fail stops here.
import { createServer } from 'node:http';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { extname, join, resolve as resolvePath } from 'node:path';

const PORT = process.env.PORT || 8371;
const APP_URL = `http://127.0.0.1:${PORT}/`;
const OBJECTIVE = process.env.SHIPGATE_OBJECTIVE ||
  `Verify the ShipGate release board. In the "New release check" field type "Write release notes" and click "Add item". Then type "Tag the version" and click "Add item" again. There are now two unchecked items and Readiness shows 0%. Click the first item's checkbox once to check it, then click the second item's checkbox once to check it. Do not click any checkbox more than once. Finally verify that Readiness shows 100% and that the text "READY TO SHIP" is visible on the page. Report pass only if both verifications match exactly.`;

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const has = name => argv.includes(name);
const AGENT_CMD = opt('--agent', null);
// The agent command may embed {failure}; the gate substitutes the failure
// report's absolute path, so `claude -p "Fix the app so the flow in {failure}
// passes"` works without shell tricks.
const AGENT_CMD_EFFECTIVE = AGENT_CMD ? AGENT_CMD.replaceAll('{failure}', resolvePath('KANE_FAILURE.md')) : null;
const DRY_RUN = has('--dry-run');
// Paths the agent's fix may never touch: the gate itself, its records, and the
// test fixtures. Editing the check is not a fix.
const PROTECTED_PATHS = new Set(['gate.mjs', 'history.json', 'KANE_FAILURE.md', 'planted-bug.patch']);
const MAX_ATTEMPTS = parseInt(opt('--max-attempts', AGENT_CMD ? '1' : '0'), 10);
const MAX_DIFF = parseInt(opt('--max-diff', '400'), 10);
const AGENT_TIMEOUT_MS = 10 * 60 * 1000;

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

function runAgent(cmd, attempt) {
  return new Promise(resolve => {
    const child = spawn(cmd, [], {
      shell: '/bin/sh', cwd: process.cwd(),
      env: { ...process.env, SHIPGATE_FAILURE_FILE: resolvePath('KANE_FAILURE.md'), SHIPGATE_ATTEMPT: String(attempt) },
      stdio: 'inherit', timeout: AGENT_TIMEOUT_MS,
    });
    child.on('close', code => resolve(code === null ? 124 : code));
    child.on('error', e => { console.error('GATE: agent spawn failed:', e.message); resolve(1); });
  });
}

// Snapshot the working tree (without touching it) so the agent's effect is
// measured against the tree as the agent found it, not against HEAD: an agent
// that reverts an uncommitted change has still changed the tree.
function gitSnapshotRef() {
  return new Promise(resolve => {
    execFile('git', ['stash', 'create'], (err, stdout) => {
      const hash = (stdout || '').trim();
      resolve(err || !hash ? 'HEAD' : hash);
    });
  });
}

function gitChangedLinesSince(ref) {
  return new Promise(resolve => {
    execFile('git', ['diff', ref, '--numstat'], (err, stdout) => {
      if (err) return resolve(0);
      let total = 0;
      for (const line of stdout.split('\n')) {
        const m = line.match(/^(\d+)\t(\d+)\t/);
        if (m) total += parseInt(m[1], 10) + parseInt(m[2], 10);
      }
      resolve(total);
    });
  });
}

function gitUntracked() {
  return new Promise(resolve => {
    // No --exclude-standard on purpose: gitignored files must NOT be invisible
    // to the gate. A new file hidden in an ignored path still counts toward the
    // diff cap and still shows in the recorded diff. Pre-existing ignored files
    // appear in both the before and after snapshots, so the before/after
    // comparison keeps them out of the agent's measured change.
    execFile('git', ['ls-files', '--others'], (err, stdout) => {
      resolve(err ? new Set() : new Set(stdout.split('\n').filter(Boolean)));
    });
  });
}

function gitStatusPorcelain() {
  return new Promise(resolve => {
    execFile('git', ['status', '--porcelain'], (err, stdout) => resolve(err ? '' : stdout.trim()));
  });
}

// Diff of one file the agent created, against nothing. `git diff` against a
// snapshot never shows untracked files, so without this an agent could add a
// whole new file and the recorded diff would show only the line that loads
// it. Exit code 1 from --no-index just means "differs"; stdout is the diff.
function gitNewFileDiff(file) {
  return new Promise(resolve => {
    execFile('git', ['diff', '--no-index', '--', '/dev/null', file], (err, stdout) => {
      resolve((stdout || '').trimEnd());
    });
  });
}

// How many lines a new file counts toward the diff cap: its added lines, from
// the same --no-index diff the gate records (lines starting with '+', minus
// the '+++' header). Counting a new file as a flat 1 line would let a
// 5,000-line file pass a 400-line cap.
async function gitNewFileLines(file) {
  const diff = await gitNewFileDiff(file);
  if (!diff) return 0;
  return diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
}

// The agent's unified diff against the tree as it found it, capped so
// history.json stays readable. This is the reviewable evidence for the fix:
// the gate verifies behaviour, and the diff is where intent gets checked.
function gitDiffSince(ref, untrackedBefore, untrackedAfter) {
  return new Promise(resolve => {
    execFile('git', ['diff', ref], async (err, stdout) => {
      let text = err ? '' : (stdout || '').trimEnd();
      const newFiles = [...untrackedAfter].filter(f => !untrackedBefore.has(f));
      for (const f of newFiles) {
        const nd = await gitNewFileDiff(f);
        if (nd) text = text ? text + '\n' + nd : nd;
      }
      if (!text) return resolve('');
      const lines = text.split('\n');
      const MAX = 60;
      resolve(lines.length > MAX ? lines.slice(0, MAX).join('\n') + `\n… diff truncated (${lines.length - MAX} more lines)` : text);
    });
  });
}

function gitChangedFilesSince(ref, untrackedBefore, untrackedAfter) {
  return new Promise(resolve => {
    execFile('git', ['diff', ref, '--name-only'], (err, stdout) => {
      const files = err ? [] : stdout.split('\n').filter(Boolean);
      for (const f of untrackedAfter) if (!untrackedBefore.has(f)) files.push(f);
      resolve(files);
    });
  });
}

function gitRestoreFrom(ref, newFiles) {
  return new Promise(resolve => {
    execFile('git', ['restore', '--source', ref, '--staged', '--worktree', '--', '.'], async () => {
      for (const f of newFiles) { try { await rm(f, { force: true }); } catch { /* already gone */ } }
      resolve();
    });
  });
}

async function appendHistory(entry) {
  const history = JSON.parse(await readFile('history.json', 'utf8'));
  history.runs.push(entry);
  await writeFile('history.json', JSON.stringify(history, null, 2) + '\n');
}

async function recordRun(result, code, runEnd, attempt, agent, agentRun) {
  // Kane's --agent mode streams NDJSON events; the run_end event carries the verdict.
  const note = result === 'pass' ? (runEnd?.one_liner || 'Kane verified the release flow end to end.')
    : result === 'fail' ? (runEnd?.one_liner || 'Kane caught a failure in the release flow. See KANE_FAILURE.md.')
    : `Kane run errored (exit ${code}).`;
  const entry = { timestamp: new Date().toISOString(), result, exitCode: code, note };
  if (attempt > 0) { entry.attempt = attempt; if (agent) entry.agent = agent; }
  if (agentRun) entry.agentRun = agentRun;
  if (runEnd?.test_url) entry.testUrl = runEnd.test_url;
  if (runEnd?.credits_consumed) entry.credits = Math.round(runEnd.credits_consumed * 100) / 100;
  await appendHistory(entry);
  return entry;
}

async function writeFailureReport(entry, code, runEnd, stepRemarks) {
  await writeFile('KANE_FAILURE.md',
    `# Kane failure report\n\nWhen: ${entry.timestamp}\nExit code: ${code}\n\n## What Kane found\n\n${runEnd?.one_liner || 'Kane reported a failure.'}\n\n${runEnd?.reason ? `Reason: ${runEnd.reason}\n\n` : ''}${runEnd?.test_url ? `Full run: ${runEnd.test_url}\n\n` : ''}## Steps\n\n${stepRemarks.join('\n') || '(no step remarks captured)'}\n\nThe coding agent reads this file, fixes the app, and re-runs the gate.\n`);
}

async function deploy() {
  const git = args => new Promise(resolve => {
    const c = spawn('git', args, { stdio: 'inherit' });
    c.on('close', resolve);
    c.on('error', () => resolve(1));
  });
  await git(['add', '-A']);
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
}

// --dry-run is a free config check: print the Kane invocation and the agent
// invocation exactly as they would run, then exit 0 without running either.
// It spends no Kane credits, invokes no agent, and writes nothing (no history
// entry, no failure report). It also skips the clean-tree refusal below, so it
// works on any tree.
if (DRY_RUN) {
  console.log(`GATE: DRY RUN — would run Kane: kane-cli run "${OBJECTIVE}" --url ${APP_URL} --name shipgate-release-verification --headless --agent`);
  if (AGENT_CMD_EFFECTIVE) {
    console.log(`GATE: DRY RUN — on a Kane failure, would invoke agent: ${AGENT_CMD_EFFECTIVE}`);
    console.log(`GATE: DRY RUN — with SHIPGATE_FAILURE_FILE=${resolvePath('KANE_FAILURE.md')} SHIPGATE_ATTEMPT=1, up to ${MAX_ATTEMPTS} attempt(s), diff cap ${MAX_DIFF} lines`);
  } else {
    console.log('GATE: DRY RUN — no --agent configured; on a Kane failure the gate would stop after writing KANE_FAILURE.md.');
  }
  if (argv.includes('--deploy')) console.log('GATE: DRY RUN — with --deploy, a Kane pass would commit and push.');
  console.log('GATE: DRY RUN — nothing run, nothing written, no credits spent.');
  server.close();
  process.exit(0);
}

// With an agent in the loop or a deploy at stake, the tree must start clean:
// the diff the gate measures is then the agent's alone, and `git add -A` at
// deploy time cannot sweep in an unrelated file.
if (AGENT_CMD || argv.includes('--deploy')) {
  const dirty = await gitStatusPorcelain();
  if (dirty) {
    console.log('GATE: REFUSED — working tree is not clean. Commit or stash first so the agent\'s diff is measurable and the deploy ships only what was verified.');
    console.log(dirty);
    server.close();
    process.exit(2);
  }
}

let attempt = 0;
let agentUsed = null;
let lastAgentRun = null;
for (;;) {
  const { code, out } = await runKane();
  const events = out.split('\n').filter(l => l.trim().startsWith('{')).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const runEnd = [...events].reverse().find(e => e.type === 'run_end') || null;
  const stepRemarks = events.filter(e => e.step !== undefined && e.remark).map(e => `- Step ${e.step} [${e.status}]: ${e.remark}`);

  let result;
  if (runEnd && runEnd.status === 'passed') result = 'pass';
  else if (runEnd && runEnd.status === 'failed') result = 'fail';
  else result = code === 0 ? 'pass' : code === 1 ? 'fail' : 'error';

  const entry = await recordRun(result, code, runEnd, attempt, agentUsed, lastAgentRun);

  if (result === 'error') {
    console.log(`GATE: ERROR (exit ${code}). Nothing deployed.`);
    server.close();
    process.exit(2);
  }
  if (result === 'pass') {
    console.log('GATE: PASS. Kane verified the flow.');
    server.close();
    if (argv.includes('--deploy')) await deploy();
    else console.log('GATE: pass recorded in history.json. Re-run with --deploy to ship.');
    break;
  }

  // result === 'fail'
  await writeFailureReport(entry, code, runEnd, stepRemarks);
  console.log('GATE: FAIL. Failure written to KANE_FAILURE.md. Nothing deployed.');
  if (!AGENT_CMD || attempt >= MAX_ATTEMPTS) {
    server.close();
    process.exit(1);
  }
  console.log(`GATE: invoking agent (attempt ${attempt + 1} of ${MAX_ATTEMPTS}): ${AGENT_CMD_EFFECTIVE}`);
  const snapshotRef = await gitSnapshotRef();
  const untrackedBefore = await gitUntracked();
  const agentCode = await runAgent(AGENT_CMD_EFFECTIVE, attempt + 1);
  const untrackedAfter = await gitUntracked();
  const changedFiles = await gitChangedFilesSince(snapshotRef, untrackedBefore, untrackedAfter);
  let diffLines = await gitChangedLinesSince(snapshotRef);
  for (const f of untrackedAfter) if (!untrackedBefore.has(f)) diffLines += await gitNewFileLines(f);
  // Record the command as configured, not as executed: {failure} stays
  // unexpanded and repo-local paths stay relative, so the public history
  // carries no machine-specific paths. The executed command is unchanged.
  const recordedCommand = AGENT_CMD.replaceAll(process.cwd() + '/', '');
  const agentRun = { command: recordedCommand, exitCode: agentCode, files: changedFiles, lines: diffLines, diff: await gitDiffSince(snapshotRef, untrackedBefore, untrackedAfter) };
  if (agentCode !== 0) {
    console.log(`GATE: agent exited ${agentCode}. Stopping the loop; nothing deployed.`);
    server.close();
    process.exit(1);
  }
  const protectedHit = changedFiles.find(f => PROTECTED_PATHS.has(f));
  if (protectedHit) {
    const newFiles = changedFiles.filter(f => untrackedAfter.has(f) && !untrackedBefore.has(f));
    await gitRestoreFrom(snapshotRef, newFiles);
    await appendHistory({ timestamp: new Date().toISOString(), result: 'blocked', note: `Agent edited a protected path (${protectedHit}); the fix was rejected and the tree restored. The gate cannot be talked out of its own verdict.`, agentRun });
    console.log(`GATE: BLOCKED — agent edited protected path ${protectedHit}. Fix rejected, tree restored, nothing deployed.`);
    server.close();
    process.exit(1);
  }
  lastAgentRun = agentRun;
  if (diffLines === 0) {
    console.log('GATE: agent changed nothing. Stopping the loop; nothing deployed.');
    server.close();
    process.exit(1);
  }
  if (diffLines > MAX_DIFF) {
    console.log(`GATE: agent changed ${diffLines} lines (cap ${MAX_DIFF}). Stopping the loop; nothing deployed.`);
    server.close();
    process.exit(1);
  }
  console.log(`GATE: agent changed ${diffLines} lines. Re-running Kane.`);
  attempt += 1;
  agentUsed = AGENT_CMD.split(/\s+/)[0];
}
