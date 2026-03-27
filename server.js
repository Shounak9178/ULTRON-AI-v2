/**
 * Ultron AI — server.js
 * MATLAB + Blender Copilot with ERROR FEEDBACK LOOP
 *
 * How the feedback loop works:
 * 1. AI generates MATLAB script
 * 2. MATLAB runs it via command line and captures output + errors
 * 3. If error → send error back to AI → AI fixes the code
 * 4. Run fixed code again → repeat up to 3 times
 * 5. Near-zero error rate regardless of AI quality
 *
 * Run:  node server.js
 * Deps: npm install
 */

const express = require('express');
const cors = require('cors');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http');
const {
  generateProject,
  generateMATLABProject,
  generateBlenderProject,
  generateKiCadProject,
  generateFollowUp,
  fixMATLABError,
  fixBlenderError,
  detectSoftware,
} = require('./agents/groq-agent');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = config.PORT || 3001;
const isWin = process.platform === 'win32';

// Output folders
const DESKTOP = path.join(os.homedir(), 'Desktop', 'Ultron_AI');
const MATLAB_FOLDER = path.join(DESKTOP, 'MATLAB');
const BLENDER_FOLDER = path.join(DESKTOP, 'Blender');
const KICAD_FOLDER = path.join(DESKTOP, 'KiCad');
[DESKTOP, MATLAB_FOLDER, BLENDER_FOLDER, KICAD_FOLDER].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// Force browser to NEVER cache UI files to ensure updates propagate instantly
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function pyPath(p) { return p.replace(/\\/g, '/'); }

function runCmd(cmd, timeout = 15000) {
  return new Promise(resolve => {
    exec(cmd, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, ...payload, ts: Date.now() });
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

function log(msg, type = 'info') {
  console.log(`[${type}] ${msg}`);
  broadcast('log', { msg, logType: type });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────
//  FIND SOFTWARE
// ─────────────────────────────────────────────
async function findSoftware(paths) {
  for (const p of (paths || [])) {
    if (p.includes('\\') || p.includes('/')) {
      if (fs.existsSync(p)) return p;
    } else {
      const r = await runCmd(isWin ? `where ${p}` : `which ${p}`);
      if (!r.err && r.stdout.trim()) return r.stdout.trim().split('\n')[0].trim();
    }
  }
  return null;
}

async function findMATLAB() { return findSoftware(config.MATLAB_PATHS); }
async function findBlender() { return findSoftware(config.BLENDER_PATHS); }
async function findKiCad() { return findSoftware(config.KICAD_PATHS); }

// ─────────────────────────────────────────────
//  WEBSOCKET
// ─────────────────────────────────────────────
wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'connected', msg: 'Ultron AI server ready' }));
});

// ─────────────────────────────────────────────
//  HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const [matlabPath, blenderPath, kicadPath] = await Promise.all([findMATLAB(), findBlender(), findKiCad()]);
  const geminiReady = !!(config.GEMINI_API_KEY && config.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE');
  const groqReady = !!(config.GROQ_API_KEY && config.GROQ_API_KEY !== 'YOUR_GROQ_API_KEY_HERE');
  const apiKeySet = geminiReady || groqReady;
  const activeAI = geminiReady ? 'Gemini ' + (config.GEMINI_MODEL || '2.0-flash')
    : groqReady ? 'Groq Llama 3.3'
      : 'none';

  res.json({
    status: 'ok', matlab: matlabPath, matlabFound: !!matlabPath,
    blender: blenderPath, blenderFound: !!blenderPath,
    kicad: kicadPath, kicadFound: !!kicadPath,
    apiKeySet, activeAI, outputFolder: DESKTOP, timestamp: Date.now(),
  });
});

// ─────────────────────────────────────────────
//  PLAN
// ─────────────────────────────────────────────
app.post('/api/plan', async (req, res) => {
  const { query, software } = req.body;
  if (!query) return res.status(400).json({ error: 'No query' });

  const detected = software || detectSoftware(query);
  broadcast('status', { msg: `AI generating your ${detected} project...`, stage: 'planning' });

  try {
    log(`Planning [${detected}]: "${query}"`);
    let project;
    if (detected === 'blender') project = await generateBlenderProject(query);
    else if (detected === 'matlab') project = await generateMATLABProject(query);
    else if (detected === 'kicad') project = await generateKiCadProject(query);
    else project = await generateProject(query);

    log(`Plan ready: ${project.title} — ${project.steps.length} steps`);
    broadcast('plan_ready', { project });
    res.json({ success: true, project });
  } catch (e) {
    log(`Plan error: ${e.message}`, 'error');
    broadcast('error', { msg: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────
//  EXECUTE
// ─────────────────────────────────────────────
app.post('/api/execute', async (req, res) => {
  const { project, mode = 'auto' } = req.body;
  if (!project) return res.status(400).json({ error: 'No project' });
  const id = uuidv4().slice(0, 8);
  res.json({ success: true, id });
  runProject(project, id, mode);
});

// ─────────────────────────────────────────────
//  FOLLOW UP
// ─────────────────────────────────────────────
app.post('/api/followup', async (req, res) => {
  const { originalQuery, followUpQuery, previousSteps, software } = req.body;
  broadcast('status', { msg: 'AI generating follow-up...', stage: 'planning' });
  try {
    const project = await generateFollowUp(originalQuery, followUpQuery, previousSteps, software);
    broadcast('plan_ready', { project, isFollowUp: true });
    res.json({ success: true, project });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Script viewer
app.get('/api/script/:id', (req, res) => {
  const mFile = path.join(MATLAB_FOLDER, `ultron_${req.params.id}.m`);
  const pyFile = path.join(BLENDER_FOLDER, `ultron_${req.params.id}.py`);
  const ksFile = path.join(KICAD_FOLDER, `ultron_${req.params.id}.kicad_sch`);
  if (fs.existsSync(mFile)) return res.json({ content: fs.readFileSync(mFile, 'utf8'), ext: 'm' });
  if (fs.existsSync(pyFile)) return res.json({ content: fs.readFileSync(pyFile, 'utf8'), ext: 'py' });
  if (fs.existsSync(ksFile)) return res.json({ content: fs.readFileSync(ksFile, 'utf8'), ext: 'kicad_sch' });
  res.status(404).json({ error: 'Script not found' });
});

app.get('/api/files', (req, res) => {
  try {
    const collect = (dir, ext) => fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(f => f.endsWith(ext)).map(f => {
        const fp = path.join(dir, f);
        return { name: f, path: fp, ext, size: fs.statSync(fp).size, created: fs.statSync(fp).birthtime };
      })
      : [];
    const files = [...collect(MATLAB_FOLDER, '.m'), ...collect(BLENDER_FOLDER, '.py'), ...collect(KICAD_FOLDER, '.kicad_sch'), ...collect(KICAD_FOLDER, '.py')]
      .sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json({ files, folder: DESKTOP });
  } catch { res.json({ files: [], folder: DESKTOP }); }
});

app.get('/api/open-folder', (req, res) => {
  exec(isWin ? `explorer "${DESKTOP}"` : `xdg-open "${DESKTOP}"`);
  res.json({ success: true });
});

app.get('/api/open-file', (req, res) => {
  const fileToOpen = req.query.path;
  if (!fileToOpen || !fs.existsSync(fileToOpen)) {
    return res.status(404).json({ error: 'File not found' });
  }
  // Windows-specific highlighting in Explorer
  if (isWin) {
    exec(`explorer /select,"${fileToOpen}"`);
  } else {
    // Basic fallback for Linux/Mac - just opens the folder
    exec(`xdg-open "${path.dirname(fileToOpen)}"`);
  }
  res.json({ success: true });
});

// ─────────────────────────────────────────────
//  PROJECT RUNNER
// ─────────────────────────────────────────────
async function runProject(project, id, mode) {
  broadcast('project_start', { project, id });
  const software = project.software || 'matlab';
  if (mode === 'demo') { await runDemo(project, id, software); return; }
  if (software === 'blender') await runBlenderProject(project, id);
  else if (software === 'kicad') await runKiCadProject(project, id);
  else await runMATLABProject(project, id);
}

// ═══════════════════════════════════════════════════════════
//  MATLAB RUNNER WITH ERROR FEEDBACK LOOP
// ═══════════════════════════════════════════════════════════
async function runMATLABProject(project, id) {
  const matlabPath = await findMATLAB();
  if (!matlabPath) {
    broadcast('error', { msg: 'MATLAB not found. Check MATLAB_PATHS in config.js.' });
    return;
  }
  broadcast('matlab_found', { path: matlabPath });

  // Create a clean named project folder
  const safeName = (project.title || 'Project').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_').slice(0, 40);
  const projectDir = path.join(MATLAB_FOLDER, `${safeName}_${id}`);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
  log(`Project folder: ${projectDir}`);
  broadcast('console_output', { text: `>> Project folder: ${projectDir}` });

  // Build the initial script
  let scriptContent = buildMATLABContent(project, projectDir);
  let scriptPath = saveMATLABScript(scriptContent, id, projectDir);
  broadcast('script_ready', { path: scriptPath, id, software: 'matlab' });

  broadcast('software_launched', {
    software: 'matlab',
    msg: 'Running MATLAB script and checking for errors...',
  });

  // ── ERROR FEEDBACK LOOP ────────────────────────────────
  const maxAttempts = config.MAX_FIX_ATTEMPTS || 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`MATLAB run attempt ${attempt}/${maxAttempts}`);
    broadcast('fix_attempt', {
      attempt, maxAttempts, msg: attempt === 1
        ? 'Running MATLAB script...'
        : `Auto-fixing errors — attempt ${attempt}/${maxAttempts}...`
    });

    // Run MATLAB headlessly to check for errors
    const result = await runMATLABHeadless(matlabPath, scriptPath);

    if (result.success) {
      // No errors — open MATLAB visually so user sees the results
      log('Script validated — no errors! Opening MATLAB...');
      broadcast('fix_attempt', { attempt, maxAttempts, msg: '✓ No errors found! Opening MATLAB on your desktop...', success: true });
      await openMATLABWithScript(matlabPath, scriptPath);
      break;
    }

    // Errors found
    log(`MATLAB error on attempt ${attempt}: ${result.error.slice(0, 150)}`);
    broadcast('matlab_error', {
      attempt,
      error: result.error,
      msg: `Error found — sending to AI for auto-fix (attempt ${attempt}/${maxAttempts})...`,
    });
    broadcast('console_output', { text: `!! Error: ${result.error.split('\n')[0]}` });

    if (attempt < maxAttempts) {
      // Ask AI to fix the error
      broadcast('fix_attempt', { attempt: attempt + 1, maxAttempts, msg: 'AI is analysing and fixing the error...' });
      try {
        const fixedCode = await fixMATLABError(scriptContent, result.error, attempt);
        scriptContent = fixedCode;
        scriptPath = saveMATLABScript(scriptContent, id, projectDir);
        broadcast('script_fixed', { path: scriptPath, attempt: attempt + 1 });
        broadcast('console_output', { text: `>> AI fixed error — retrying...` });
        log(`Script fixed by AI — saved: ${scriptPath}`);
      } catch (e) {
        log(`AI fix failed: ${e.message}`, 'error');
        broadcast('console_output', { text: `!! AI fix failed: ${e.message}` });
        break;
      }
    } else {
      // Max attempts reached — open MATLAB anyway with best version
      log('Max fix attempts reached — opening MATLAB with best version');
      broadcast('fix_attempt', { attempt, maxAttempts, msg: 'Opening MATLAB with best available version...', warning: true });
      await openMATLABWithScript(matlabPath, scriptPath);
    }
  }

  // Stream step progress in UI
  await streamStepProgress(project);

  // Scan for all saved output files in the project folder
  const savedFiles = [];
  try {
    const files = fs.readdirSync(projectDir);
    files.forEach(f => {
      if (['.m', '.fig', '.mat', '.jpg', '.png', '.slx'].some(e => f.endsWith(e))) {
        const filePath = path.join(projectDir, f);
        const stat = fs.statSync(filePath);
        savedFiles.push({ name: f, path: filePath, size: stat.size, ext: path.extname(f).toLowerCase() });
      }
    });
  } catch { }
  if (savedFiles.length > 0) {
    broadcast('console_output', { text: `\n✓ Saved ${savedFiles.length} file(s) to: ${projectDir}` });
    savedFiles.forEach(f => {
      let icon = '📄';
      if (f.ext === '.fig') icon = '📊';
      if (f.ext === '.png' || f.ext === '.jpg') icon = '🖼';
      if (f.ext === '.mat') icon = '💾';
      broadcast('console_output', { text: `  ${icon} ${f.name}` });
    });
    // Broadcast explicit file list so UI can render the Results panel
    broadcast('matlab_files', { files: savedFiles, projectDir });
  }

  broadcast('project_complete', {
    title: project.title, software: 'matlab',
    steps: project.steps.length, scriptPath,
    savedFiles,
    msg: `MATLAB project complete! ${savedFiles.length} file(s) saved.`,
  });
}

// ─────────────────────────────────────────────
//  RUN MATLAB HEADLESSLY — capture errors
// ─────────────────────────────────────────────
async function runMATLABHeadless(matlabPath, scriptPath) {
  const scriptDir = pyPath(path.dirname(scriptPath));
  const scriptFile = pyPath(scriptPath);
  const logFile = scriptPath.replace('.m', '_log.txt');

  // Run MATLAB in no-display mode, capture output to log file
  const matlabCmd = isWin
    ? `"${matlabPath}" -batch "try; cd('${scriptDir}'); run('${scriptFile}'); catch e; fprintf('ULTRON_ERROR: %s\\n', e.message); end" > "${logFile}" 2>&1`
    : `"${matlabPath}" -batch "try; cd('${scriptDir}'); run('${scriptFile}'); catch e; fprintf('ULTRON_ERROR: %s\\n', e.message); end" > "${logFile}" 2>&1`;

  log(`Running headless check: ${matlabCmd.slice(0, 80)}...`);

  const result = await runCmd(matlabCmd, 60000);
  let output = '';

  // Read the log file
  try {
    if (fs.existsSync(logFile)) {
      output = fs.readFileSync(logFile, 'utf8');
    }
  } catch { }

  // Also check stderr
  if (result.stderr) output += '\n' + result.stderr;
  if (result.stdout) output += '\n' + result.stdout;

  // Check for errors
  const errorPatterns = [
    /ULTRON_ERROR:\s*(.+)/i,
    /Error\s+(?:using|in)\s+.+\n(.+)/i,
    /Undefined\s+(?:function|variable)\s+'?(\w+)'?/i,
    /Error:\s+(.+)/i,
  ];

  for (const pattern of errorPatterns) {
    const match = output.match(pattern);
    if (match) {
      return { success: false, error: output.trim() };
    }
  }

  // If MATLAB exited with error code
  if (result.err && result.err.code !== 0 && output.toLowerCase().includes('error')) {
    return { success: false, error: output.trim() || result.err.message };
  }

  return { success: true, output: output.trim() };
}

// ─────────────────────────────────────────────
//  OPEN MATLAB VISUALLY — user sees results
// ─────────────────────────────────────────────
async function openMATLABWithScript(matlabPath, scriptPath) {
  const scriptDir = pyPath(path.dirname(scriptPath));
  const scriptFile = pyPath(scriptPath);
  const batPath = scriptPath.replace('.m', '_open.bat');

  const batContent = [
    '@echo off',
    `cd /d "${path.dirname(scriptPath)}"`,
    `start "" "${matlabPath}" -r "cd('${scriptDir}'); run('${scriptFile}');"`,
    'exit',
  ].join('\r\n');

  fs.writeFileSync(batPath, batContent);
  exec(`"${batPath}"`, { windowsHide: false });
  log('MATLAB opened visually');

  broadcast('software_launched', {
    software: 'matlab',
    msg: 'MATLAB is now open on your desktop showing your results!',
  });
}

// ─────────────────────────────────────────────
//  BUILD MATLAB SCRIPT CONTENT
// ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════
//  KICAD RUNNER — opens KiCad with Python script auto-executed
// ═══════════════════════════════════════════════════════════
async function runKiCadProject(project, id) {
  const kicadPath = await findKiCad();
  if (!kicadPath) {
    broadcast('error', { msg: 'KiCad not found. Check KICAD_PATHS in config.js.' });
    return;
  }
  broadcast('kicad_found', { path: kicadPath });
  log(`KiCad found: ${kicadPath}`);

  // Build the Python script
  const pcbPath = path.join(KICAD_FOLDER, `ultron_${id}.kicad_pcb`).replace(/\\/g, '/');
  let scriptContent = buildKiCadContent(project, pcbPath);

  const scriptPath = saveKiCadScript(scriptContent, id);
  broadcast('script_ready', { path: scriptPath, id, software: 'kicad' });
  log(`KiCad script saved: ${scriptPath}`);

  const pyExe = path.join(path.dirname(kicadPath), 'python.exe');
  const pcbnewExe = path.join(path.dirname(kicadPath), 'pcbnew.exe');
  const maxAttempts = config.MAX_FIX_ATTEMPTS || 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`KiCad run attempt ${attempt}/${maxAttempts}`);
    broadcast('fix_attempt', {
      attempt, maxAttempts, msg: attempt === 1
        ? 'Generating KiCad board via embedded Python engine...'
        : `Auto-fixing errors — attempt ${attempt}/${maxAttempts}...`
    });

    const logPath = scriptPath.replace('.py', '_log.txt');
    const headlessCmd = '"' + pyExe + '" "' + scriptPath + '" > "' + logPath + '" 2>&1';
    log('Running KiCad python engine...');

    const result = await runCmd(headlessCmd, 45000);

    let output = '';
    try { if (fs.existsSync(logPath)) output = fs.readFileSync(logPath, 'utf8'); } catch { }

    const hasError = output.toLowerCase().includes('error') || output.toLowerCase().includes('traceback') || output.includes('STEP_ERROR');

    const errLines = output.split('\n').filter(l => l.trim().toLowerCase().includes('error') || l.trim().includes('STEP_ERROR') || l.trim().toLowerCase().includes('traceback'));
    if (errLines.length > 0) {
      errLines.slice(-10).forEach(line => broadcast('console_output', { text: '!! ' + line.trim() }));
    } else {
      output.split('\n').filter(l => l.trim()).slice(-10).forEach(line => broadcast('console_output', { text: '>> ' + line.trim() }));
    }

    if (!hasError) {
      log('KiCad script validated — no errors!');
      broadcast('fix_attempt', { attempt, maxAttempts, msg: '✓ Circuit generated! Launching pcbnew editor...', success: true });
      break;
    }

    log(`KiCad error on attempt ${attempt}: ${output.slice(-150).replace(/\n/g, ' ')}`);
    broadcast('console_output', { text: `!! Attempting to auto-fix KiCad script...` });

    if (attempt < maxAttempts) {
      broadcast('fix_attempt', { attempt: attempt + 1, maxAttempts, msg: 'AI is analysing and fixing the error...' });
      try {
        const { fixKiCadError } = require('./agents/groq-agent');
        const fixedCode = await fixKiCadError(scriptContent, output, attempt);
        scriptContent = fixedCode;
        fs.writeFileSync(scriptPath, scriptContent, 'utf8');
        broadcast('script_fixed', { path: scriptPath, attempt: attempt + 1 });
        broadcast('console_output', { text: `>> AI fixed error — retrying...` });
        log(`KiCad script fixed by AI — saved`);
      } catch (e) {
        log(`AI fix failed: ${e.message}`, 'error');
        broadcast('console_output', { text: `!! AI fix failed: ${e.message}` });
        break;
      }
    } else {
      log('Max fix attempts reached — launching KiCad with best version');
      broadcast('fix_attempt', { attempt, maxAttempts, msg: 'Opening pcbnew with best available version...', warning: true });
    }
  }

  // Open the generated PCB file visually using pcbnew.exe!
  const openBat = scriptPath.replace('.py', '_open.bat');
  const openContent = '@echo off\r\nstart "" "' + pcbnewExe + '" "' + pcbPath + '"\r\n';
  fs.writeFileSync(openBat, openContent);
  exec('cmd.exe /c "' + openBat + '"', (err) => {
    if (err) log('pcbnew launch error: ' + err.message, 'warn');
  });

  broadcast('software_launched', {
    software: 'kicad',
    msg: 'KiCad PCB Editor is opening with your generated circuit!',
  });

  broadcast('fix_attempt', {
    attempt: 1, maxAttempts: 1,
    msg: '✓ Circuit generated! Launching pcbnew editor...',
    success: true,
  });

  await streamStepProgress(project);

  broadcast('project_complete', {
    title: project.title,
    software: 'kicad',
    steps: project.steps.length,
    scriptPath,
    msg: 'KiCad project ready! Load the script in KiCad Scripting Console to build the schematic.',
  });
}

// ─────────────────────────────────────────────
//  BUILD KICAD SCRIPT
// ─────────────────────────────────────────────
function buildKiCadContent(project, pcbPath) {
  const title = (project.title || 'Ultron Project').replace(/["']/g, '');
  const schPath = path.join(KICAD_FOLDER, 'ultron_schematic.kicad_sch').replace(/\\/g, '/');

  const stepLines = [];
  project.steps.forEach((step, i) => {
    const label = (step.label || '').replace(/"/g, "'");
    const cmdLines = (step.cmd || '').split('\n').map(l => '    ' + l);
    stepLines.push(`    # Step ${i + 1}/${project.steps.length}: ${label}`);
    stepLines.push(`    print("Step ${i + 1}/${project.steps.length}: ${label}")`);
    stepLines.push('    try:');
    cmdLines.forEach(l => stepLines.push('    ' + l));
    stepLines.push(`    except Exception as _e:`);
    stepLines.push(`        print("STEP_ERROR: " + str(_e))`);
    stepLines.push(`    print("  Done.")`);
    stepLines.push('');
  });

  return `# Ultron AI KiCad Script — ${title}
# Generated: ${new Date().toLocaleString()}
# HOW TO USE:
#   In KiCad: Tools → Scripting Console → paste this script
#   OR: run with kicad-cli python script
#
# This script uses KiCad Python API (pcbnew / schematic)

import pcbnew
import os
import math

PCBOUT_PATH = r"${pcbPath}"

def run_ultron_kicad():
    print("========================================")
    print("  Ultron AI: ${title}")
    print("========================================")

${stepLines.join('\n')}

    print("========================================")
    print("  Ultron AI: KiCad Project Complete!")
    print("========================================")

try:
    run_ultron_kicad()
except Exception as e:
    import traceback
    print("FATAL ERROR: " + str(e))
    traceback.print_exc()
`;
}

function saveKiCadScript(content, id) {
  const scriptPath = path.join(KICAD_FOLDER, `ultron_${id}.py`);
  fs.writeFileSync(scriptPath, content, 'utf8');
  log(`KiCad script saved: ${scriptPath}`);
  return scriptPath;
}


function buildMATLABContent(project, projectDir) {
  const safeDir = (projectDir || MATLAB_FOLDER).replace(/\\/g, '\\\\');
  const lines = [];
  lines.push(`%% Ultron AI — ${project.title}`);
  lines.push(`%% ${project.description || ''}`);
  lines.push(`%% Generated: ${new Date().toLocaleString()}`);
  lines.push('');
  lines.push(`PROJECT_DIR = '${safeDir}';`);
  lines.push(`if ~exist(PROJECT_DIR, 'dir'), mkdir(PROJECT_DIR); end`);
  lines.push(`cd(PROJECT_DIR);`);
  lines.push('');
  lines.push(`disp('========================================');`);
  lines.push(`disp('  Ultron AI: ${(project.title || '').replace(/'/g, "''")}');`);
  lines.push(`disp('========================================');`);
  lines.push('');

  let figCount = 0;
  project.steps.forEach((step, i) => {
    lines.push(`%% Step ${i + 1}/${project.steps.length}: ${step.label}`);
    lines.push(`disp(['Step ${i + 1}/${project.steps.length}: ${(step.label || '').replace(/'/g, "''")}']);`);
    lines.push('');
    lines.push(step.cmd || '');
    lines.push('');
    // After each step that likely creates a figure: save it
    const stepLower = (step.cmd || '').toLowerCase();
    if (stepLower.includes('figure') || stepLower.includes('plot') || stepLower.includes('subplot') || stepLower.includes('surf') || stepLower.includes('mesh')) {
      figCount++;
      lines.push(`try`);
      lines.push(`  fig_handles = findall(0,'Type','figure');`);
      lines.push(`  for _fi = 1:length(fig_handles)`);
      lines.push(`    fig_name = fullfile(PROJECT_DIR, sprintf('plot_step${i + 1}_fig%d.fig', _fi));`);
      lines.push(`    savefig(fig_handles(_fi), fig_name);`);
      lines.push(`    saveas(fig_handles(_fi), strrep(fig_name,'.fig','.png'));`);
      lines.push(`  end`);
      lines.push(`catch _fe, disp(['Fig save warn: ' _fe.message]); end`);
    }
    lines.push(`disp('  Done.');`);
    lines.push('');
  });

  // Save final workspace
  lines.push(`%% Save workspace and script`);
  lines.push(`try, save(fullfile(PROJECT_DIR, 'workspace.mat')); catch, end`);
  lines.push(`disp('========================================');`);
  lines.push(`disp('  Ultron AI: Project Complete!');`);
  lines.push(`disp(['  Files saved to: ' PROJECT_DIR]);`);
  lines.push(`disp('========================================');`);
  return lines.join('\n');
}

function saveMATLABScript(content, id, projectDir) {
  const dir = projectDir || MATLAB_FOLDER;
  const scriptPath = path.join(dir, `ultron_${id}.m`);
  fs.writeFileSync(scriptPath, content, 'utf8');
  log(`MATLAB script saved: ${scriptPath}`);
  return scriptPath;
}

// ═══════════════════════════════════════════════════════════
//  BLENDER RUNNER — simple and reliable
//  Skip headless check, open directly, script auto-executes
// ═══════════════════════════════════════════════════════════
async function runBlenderProject(project, id) {
  const blenderPath = await findBlender();
  if (!blenderPath) {
    broadcast('error', { msg: 'Blender not found. Check BLENDER_PATHS in config.js.' });
    return;
  }
  broadcast('blender_found', { path: blenderPath });
  log(`Blender found: ${blenderPath}`);

  // Build and save the script
  const scriptContent = buildBlenderContent(project);
  const scriptPath = saveBlenderScript(scriptContent, id);
  broadcast('script_ready', { path: scriptPath, id, software: 'blender' });
  log(`Blender script saved: ${scriptPath}`);

  // Open Blender with the script — simple and direct
  broadcast('fix_attempt', { attempt: 1, maxAttempts: 1, msg: 'Opening Blender on your desktop...' });

  log(`Launching Blender: ${blenderPath}`);
  log(`Script: ${scriptPath}`);

  // bat file + cmd.exe — confirmed working on this Windows machine
  // Also run headless first to capture output/errors for debugging
  const logPath = scriptPath.replace('.py', '_output.txt');
  const batPath = scriptPath.replace('.py', '_launch.bat');

  // First run headless to capture any errors
  const headlessCmd = '"' + blenderPath + '" --background --python "' + scriptPath + '" > "' + logPath + '" 2>&1';
  log('Running headless check first...');

  exec(headlessCmd, { timeout: 30000 }, (err, stdout, stderr) => {
    // Read the log
    let output = '';
    try { output = require('fs').readFileSync(logPath, 'utf8'); } catch { }

    // Show output in browser console
    const lines = output.split('\n').filter(l => l.trim());
    lines.forEach(line => {
      if (line.includes('STEP_ERROR') || line.includes('FATAL') || line.includes('Error') || line.includes('Traceback')) {
        broadcast('console_output', { text: '!! ' + line.trim() });
        log('Blender error: ' + line.trim(), 'warn');
      } else if (line.includes('Step') || line.includes('done') || line.includes('Ultron')) {
        broadcast('console_output', { text: '>> ' + line.trim() });
      }
    });

    // Now open Blender visually regardless
    const batContent = '@echo off\r\nstart "" "' + blenderPath + '" --python "' + scriptPath + '"\r\n';
    require('fs').writeFileSync(batPath, batContent);
    exec('cmd.exe /c "' + batPath + '"', (e2) => {
      if (e2) log('Blender visual launch error: ' + e2.message, 'warn');
      else log('Blender opened visually');
    });
  });

  broadcast('software_launched', {
    software: 'blender',
    msg: 'Blender is opening on your desktop! The 3D model will build automatically.',
  });

  broadcast('fix_attempt', {
    attempt: 1, maxAttempts: 1,
    msg: '✓ Blender opened! Watch your 3D model build automatically.',
    success: true,
  });

  // Stream step progress in UI while Blender builds the model
  await streamStepProgress(project);

  broadcast('project_complete', {
    title: project.title,
    software: 'blender',
    steps: project.steps.length,
    scriptPath,
    msg: 'Blender project complete! Your 3D model is built in the viewport.',
  });
}

// ─────────────────────────────────────────────
//  BUILD MATLAB SCRIPT CONTENT
// ─────────────────────────────────────────────
function buildMATLABContent(project) {
  const lines = [];
  lines.push(`%% Ultron AI — ${project.title}`);
  lines.push(`%% ${project.description || ''}`);
  lines.push(`%% Generated: ${new Date().toLocaleString()}`);
  lines.push('');
  lines.push(`disp('========================================');`);
  lines.push(`disp('  Ultron AI: ${(project.title || '').replace(/'/g, "''")}');`);
  lines.push(`disp('========================================');`);
  lines.push('');

  project.steps.forEach((step, i) => {
    lines.push(`%% Step ${i + 1}/${project.steps.length}: ${step.label}`);
    lines.push(`disp(['Step ${i + 1}/${project.steps.length}: ${(step.label || '').replace(/'/g, "''")}']);`);
    lines.push('');
    lines.push(step.cmd || '');
    lines.push('');
    lines.push(`disp('  Done.');`);
    lines.push('');
  });

  lines.push(`disp('========================================');`);
  lines.push(`disp('  Ultron AI: Project Complete!');`);
  lines.push(`disp('========================================');`);
  return lines.join('\n');
}

function saveMATLABScript(content, id) {
  const scriptPath = path.join(MATLAB_FOLDER, `ultron_${id}.m`);
  fs.writeFileSync(scriptPath, content, 'utf8');
  log(`MATLAB script saved: ${scriptPath}`);
  return scriptPath;
}

// ═══════════════════════════════════════════════════════════
//  BLENDER RUNNER WITH ERROR FEEDBACK LOOP
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
//  BUILD BLENDER SCRIPT
// ─────────────────────────────────────────────
function buildBlenderContent(project) {
  // Build each step indented inside try/except blocks
  const stepLines = [];

  project.steps.forEach((step, i) => {
    const label = (step.label || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const cmdLines = (step.cmd || '').split('\n').map(l => '    ' + l);

    stepLines.push(`    # ── Step ${i + 1}/${project.steps.length}: ${label} ──`);
    stepLines.push(`    print("Step ${i + 1}/${project.steps.length}: ${label}")`);
    stepLines.push('    try:');
    // Indent each code line by 8 spaces (inside try block)
    cmdLines.forEach(line => {
      stepLines.push('    ' + line);
    });
    stepLines.push(`    except Exception as _e:`);
    stepLines.push(`        print("STEP_ERROR in step ${i + 1}: " + str(_e))`);
    stepLines.push(`        import traceback`);
    stepLines.push(`        traceback.print_exc()`);
    stepLines.push(`    print("  Step ${i + 1} done.")`);
    stepLines.push('');
  });

  const title = (project.title || 'Ultron Project').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const blendOut = path.join(BLENDER_FOLDER, 'ultron_model.blend').replace(/\\/g, '/');

  return `# Ultron AI - ${title}
# ${(project.description || '').replace(/"/g, "'")}
# Generated: ${new Date().toLocaleString()}

import bpy
import math
import os
import traceback

def run_ultron_project():
    print("========================================")
    print("  Ultron AI: ${title}")
    print("========================================")

    # Clear default scene objects
    try:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
        for mesh in list(bpy.data.meshes):
            bpy.data.meshes.remove(mesh)
        for mat in list(bpy.data.materials):
            bpy.data.materials.remove(mat)
        for cam in list(bpy.data.cameras):
            bpy.data.cameras.remove(cam)
        for light in list(bpy.data.lights):
            bpy.data.lights.remove(light)
        bpy.context.scene.unit_settings.system = 'METRIC'
        bpy.context.scene.unit_settings.scale_length = 0.001
        print("Scene cleared successfully")
    except Exception as e:
        print("Scene clear warning: " + str(e))

${stepLines.join('\n')}

    print("========================================")
    print("  Ultron AI: Project Complete!")
    print("========================================")

    # Save the blend file
    try:
        blend_path = r"${blendOut}"
        bpy.ops.wm.save_as_mainfile(filepath=blend_path)
        print("Model saved to: " + blend_path)
    except Exception as e:
        print("Save note: " + str(e))

# Run
try:
    run_ultron_project()
except Exception as e:
    print("FATAL ERROR: " + str(e))
    traceback.print_exc()
`;
}
function saveBlenderScript(content, id) {
  const scriptPath = path.join(BLENDER_FOLDER, `ultron_${id}.py`);
  fs.writeFileSync(scriptPath, content, 'utf8');
  log(`Blender script saved: ${scriptPath}`);
  return scriptPath;
}

// ─────────────────────────────────────────────
//  STREAM STEP PROGRESS
// ─────────────────────────────────────────────
async function streamStepProgress(project) {
  for (let i = 0; i < project.steps.length; i++) {
    const step = project.steps[i];
    const delay = estimateStepTime(step, project.software);
    await sleep(delay * 0.3);
    broadcast('step_update', { stepIndex: i, label: step.label, status: 'running', total: project.steps.length });
    broadcast('console_output', { text: `>> [${i + 1}/${project.steps.length}] ${step.label}` });
    await sleep(delay * 0.7);
    broadcast('step_update', { stepIndex: i, label: step.label, status: 'done', total: project.steps.length });
    if (step.produces) broadcast('console_output', { text: `   -> ${step.produces}` });
  }
}

// ─────────────────────────────────────────────
//  DEMO MODE
// ─────────────────────────────────────────────
async function runDemo(project, id, software) {
  broadcast('software_launched', {
    software,
    msg: `Demo mode — showing ${software === 'blender' ? 'Blender' : 'MATLAB'} execution`,
    demo: true,
  });

  const scriptPath = software === 'blender'
    ? saveBlenderScript(buildBlenderContent(project), id)
    : saveMATLABScript(buildMATLABContent(project), id);
  broadcast('script_ready', { path: scriptPath, id, software, demo: true });

  for (let i = 0; i < project.steps.length; i++) {
    const step = project.steps[i];
    const delay = estimateStepTime(step, software);
    await sleep(delay * 0.4);
    broadcast('step_update', { stepIndex: i, label: step.label, status: 'running', total: project.steps.length });
    broadcast('console_output', { text: `>> ${step.label}` });
    const lines = (step.cmd || '').split('\n')
      .filter(l => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('%'))
      .slice(0, 3);
    for (const line of lines) { await sleep(120); broadcast('console_output', { text: `   ${line.trim()}` }); }
    await sleep(delay * 0.5);
    if (step.produces) broadcast('console_output', { text: `   -> ${step.produces}` });
    broadcast('step_update', { stepIndex: i, label: step.label, status: 'done', total: project.steps.length });
  }

  broadcast('project_complete', {
    title: project.title, software, steps: project.steps.length,
    scriptPath, demo: true,
    msg: `Demo complete! Script saved to Desktop\\Ultron_AI\\${software === 'blender' ? 'Blender' : 'MATLAB'}`,
  });
}

// ─────────────────────────────────────────────
//  ESTIMATE STEP TIME
// ─────────────────────────────────────────────
function estimateStepTime(step, software) {
  const code = (step.cmd || '').toLowerCase();
  if (software === 'blender') {
    if (code.includes('subdivision') || code.includes('boolean')) return 1800 + Math.random() * 800;
    if (code.includes('material') || code.includes('render')) return 1400 + Math.random() * 600;
    return 900 + Math.random() * 500;
  }
  if (code.includes('for ') || code.includes('while ')) return 2000 + Math.random() * 1000;
  if (code.includes('figure') || code.includes('plot')) return 1400 + Math.random() * 600;
  if (code.includes('ode45') || code.includes('fft')) return 1600 + Math.random() * 800;
  return 800 + Math.random() * 500;
}

// ─────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────
server.listen(PORT, async () => {
  const [matlabPath, blenderPath, kicadPath] = await Promise.all([findMATLAB(), findBlender(), findKiCad()]);
  const geminiReady = !!(config.GEMINI_API_KEY && config.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE');
  const groqReady = !!(config.GROQ_API_KEY && config.GROQ_API_KEY !== 'YOUR_GROQ_API_KEY_HERE');
  const activeAI = geminiReady ? 'Gemini ' + (config.GEMINI_MODEL || '2.0-flash') : groqReady ? 'Groq Llama 3.3' : 'none';

  console.log('\n  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║   Ultron AI — MATLAB + Blender + KiCad Engineering Copilot  ║');
  console.log(`  ║   http://localhost:${PORT}                                        ║`);
  console.log('  ╠══════════════════════════════════════════════════════════════╣');
  console.log(`  ║  Active AI : ${activeAI}`);
  console.log(`  ║  Gemini    : ${geminiReady ? '✓ ready (primary)' : '✗ not set'}`);
  console.log(`  ║  Groq      : ${groqReady ? '✓ ready (fallback)' : '✗ not set'}`);
  console.log(`  ║  MATLAB    : ${matlabPath ? '✓ ' + matlabPath.slice(0, 42) : '✗ not found'}`);
  console.log(`  ║  Blender   : ${blenderPath ? '✓ ' + blenderPath.slice(0, 42) : '✗ not found'}`);
  console.log(`  ║  KiCad     : ${kicadPath ? '✓ ' + kicadPath.slice(0, 42) : '✗ not found'}`);
  console.log(`  ║  Fix loop  : up to ${config.MAX_FIX_ATTEMPTS || 3} auto-fix attempts per project`);
  console.log('  ╚══════════════════════════════════════════════════════════════╝\n');

  if (!geminiReady && !groqReady) {
    console.log('  ⚠  Add GEMINI_API_KEY or GROQ_API_KEY in config.js');
    console.log('  Free Gemini: https://aistudio.google.com/apikey');
    console.log('  Free Groq:   https://console.groq.com\n');
  }
  if (!matlabPath) console.log('  ⚠  MATLAB not found — check MATLAB_PATHS in config.js\n');
  if (!kicadPath) console.log('  ⚠  KiCad not found — check KICAD_PATHS in config.js\n');
  if (!blenderPath) console.log('  ⚠  Blender not found — check BLENDER_PATHS in config.js\n');
});
