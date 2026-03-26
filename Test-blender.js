const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { exec } = require('child_process');

const blenderPath = 'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe';
const desktop     = path.join(os.homedir(), 'Desktop');

// Test 1: Open Blender with NO flags at all
const bat1 = path.join(desktop, 'test1.bat');
fs.writeFileSync(bat1, '@echo off\r\nstart "" "' + blenderPath + '"\r\n');

console.log('Running Test 1: Open Blender with no flags...');
exec('cmd.exe /c "' + bat1 + '"', function(err) {
  if (err) console.log('Test 1 ERROR:', err.message);
  else     console.log('Test 1 SUCCESS');
});