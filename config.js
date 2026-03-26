module.exports = {

  // ── Primary AI: Gemini (free - https://aistudio.google.com/apikey) ──
  GEMINI_API_KEY: 'gemini_api_key',
  GEMINI_MODEL: 'gemini-2.0-flash',

  // ── Fallback AI: Groq (free - https://console.groq.com) ────────────
  GROQ_API_KEY: 'GROQ_API_KEY',
  GROQ_MODEL: 'llama-3.3-70b-versatile',

  // ── MATLAB paths ────────────────────────────────────────────────────
  MATLAB_PATHS: [
    'C:\\Program Files\\MATLAB\\R2025a\\bin\\matlab.exe',
    'C:\\Program Files\\MATLAB\\R2025b\\bin\\matlab.exe',
    'C:\\Program Files\\MATLAB\\R2024b\\bin\\matlab.exe',
    'C:\\Program Files\\MATLAB\\R2024a\\bin\\matlab.exe',
    'matlab',
  ],

  // ── Blender paths ───────────────────────────────────────────────────
  BLENDER_PATHS: [
    'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe',
    'blender',
  ],
  KICAD_PATHS: [
    'C:\\Users\\Shounak Kulkarni\\Desktop\\Ultron_AI\\bin\\kicad.exe',
    'kicad',
  ],
  PORT: 3001,
  MAX_TOKENS: 8192,

  // ── Error feedback loop settings ───────────────────────────────────
  MAX_FIX_ATTEMPTS: 3,   // how many times to auto-fix errors
};