/**
 * check-engines.js
 * Run: node check-engines.js
 * Checks which engineering tools are installed on your system.
 */

const { exec } = require('child_process');

const py = process.platform === 'win32' ? 'python' : 'python3';

function check(label, cmd) {
  return new Promise(resolve => {
    exec(cmd, { timeout: 8000 }, (err, stdout, stderr) => {
      const out = (stdout + stderr).trim().split('\n')[0];
      resolve({ label, ok: !err || !!stdout, version: out || 'not found' });
    });
  });
}

async function main() {
  console.log('\n  EngineAI — Checking installed tools...\n');

  const checks = await Promise.all([
    check('Node.js',          'node --version'),
    check('Python 3',         `${py} --version`),
    check('NumPy',            `${py} -c "import numpy; print('v' + numpy.__version__)"`),
    check('matplotlib',       `${py} -c "import matplotlib; print('v' + matplotlib.__version__)"`),
    check('SciPy',            `${py} -c "import scipy; print('v' + scipy.__version__)"`),
    check('python-control',   `${py} -c "import control; print('v' + control.__version__)"`),
    check('PySpice',          `${py} -c "import PySpice; print('ok')"`),
    check('CadQuery',         `${py} -c "import cadquery; print('v' + cadquery.__version__)"`),
    check('GNU Octave',       'octave --version'),
    check('OpenSCAD',         'openscad --version'),
    check('FreeCAD',          'freecadcmd --version'),
    check('ngspice',          'ngspice --version'),
  ]);

  let allOk = true;
  checks.forEach(({ label, ok, version }) => {
    const icon = ok ? '  ✓' : '  ✗';
    const col  = ok ? '\x1b[32m' : '\x1b[31m';
    console.log(`${col}${icon}\x1b[0m  ${label.padEnd(18)} ${version}`);
    if (!ok) allOk = false;
  });

  console.log('\n  ─────────────────────────────────────────────');

  if (!checks[0].ok) {
    console.log('\n  \x1b[31m✗ Node.js not found. Install from https://nodejs.org\x1b[0m');
  }
  if (!checks[1].ok) {
    console.log('\n  \x1b[31m✗ Python not found. Install from https://python.org\x1b[0m');
  }

  const missing_py = checks.slice(2, 8).filter(c => !c.ok).map(c => c.label.toLowerCase().replace(' ', ''));
  if (missing_py.length) {
    console.log(`\n  Install missing Python packages:\n`);
    console.log(`  \x1b[33mpip3 install ${missing_py.join(' ')}\x1b[0m\n`);
    console.log(`  For CadQuery specifically:`);
    console.log(`  \x1b[33mpip3 install cadquery\x1b[0m\n`);
  }

  if (!checks[8].ok) {
    console.log('\n  Install GNU Octave:');
    console.log('    macOS:   \x1b[33mbrew install octave\x1b[0m');
    console.log('    Ubuntu:  \x1b[33msudo apt install octave\x1b[0m');
    console.log('    Windows: https://octave.org/download\n');
  }

  if (!checks[9].ok) {
    console.log('\n  Install OpenSCAD:');
    console.log('    macOS:   \x1b[33mbrew install --cask openscad\x1b[0m');
    console.log('    Ubuntu:  \x1b[33msudo apt install openscad\x1b[0m');
    console.log('    Windows: https://openscad.org/downloads.html\n');
  }

  if (!checks[10].ok) {
    console.log('\n  Install FreeCAD:');
    console.log('    https://www.freecad.org/downloads.php\n');
  }

  if (allOk) {
    console.log('\n  \x1b[32m✓ All tools installed! Run: node server.js\x1b[0m\n');
  } else {
    console.log('\n  Install missing tools above, then run: \x1b[33mnode server.js\x1b[0m\n');
  }
}

main();