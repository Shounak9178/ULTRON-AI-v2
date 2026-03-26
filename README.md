# EngineAI Copilot — MATLAB Live Control
### AI-Powered Engineering Project Builder

---

## What This Does
You describe any MATLAB project in the chat.
The AI (Groq — free) generates the complete MATLAB code.
MATLAB opens on your desktop and runs the project automatically.
You watch every step execute live.

---

## Project Structure

```
engineai-copilot/
├── server.js                    ← Node.js backend server
├── config.js                    ← Your API keys and settings
├── package.json                 ← Node dependencies
├── agents/
│   └── claude-matlab-agent.js  ← Groq AI code generator
└── public/
    └── index.html               ← Frontend chat UI
```

---

## Setup (First Time Only)

### 1. Install Node dependencies
```
npm install
```

### 2. Get free Groq API key
Go to: https://console.groq.com
Sign up free → API Keys → Create API Key
Copy the key (starts with gsk_...)

### 3. Add your key to config.js
Open config.js and replace:
  GROQ_API_KEY: 'YOUR_GROQ_API_KEY_HERE'
With your actual key:
  GROQ_API_KEY: 'gsk_xxxxxxxxxxxxxxxxxxxxxxxx'

### 4. Check your MATLAB path in config.js
The default paths cover R2025a and R2024b.
To find your exact path run in terminal:
  dir "C:\Program Files\MATLAB" /b

### 5. Start the server
```
node server.js
```

### 6. Open in browser
```
http://localhost:3001
```

---

## How to Use

1. Type any MATLAB project in the chat box
2. Click Build
3. MATLAB opens on your desktop automatically
4. The project executes step by step
5. All scripts saved to: Desktop\EngineAI_MATLAB

---

## Example Projects You Can Build

- PID controller for a DC motor
- Signal processing FFT analysis
- Spring mass damper simulation
- Heat transfer 2D conduction
- Beam deflection SFD BMD diagrams
- Robot arm kinematics
- Kalman filter for sensor fusion
- Neural network pattern recognition
- Monte Carlo structural reliability
- Any project from your coursework

---

## Three Execution Modes

| Mode   | What Happens |
|--------|-------------|
| Auto   | MATLAB opens and runs everything automatically |
| Script | MATLAB opens with script loaded, you press F5 |
| Demo   | Works without MATLAB — shows full simulation |

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend   | Node.js + Express |
| AI Engine | Groq API (Llama 3.3 70B) — Free |
| Frontend  | HTML + CSS + JavaScript |
| Real-time | WebSocket |
| MATLAB    | R2025a (or any version) |

---

## Troubleshooting

**MATLAB not opening:**
Run: dir "C:\Program Files\MATLAB" /b
Add the exact path to config.js MATLAB_PATHS

**Groq API error:**
Check your key at https://console.groq.com
Make sure key starts with gsk_

**JSON parse error:**
Just try again — Groq occasionally returns malformed JSON
The agent retries 3 times automatically

**Port already in use:**
Change PORT in config.js to 3002 or any other port

---

## Files Generated

All MATLAB scripts are saved to:
  Desktop\EngineAI_MATLAB\

A .bat launcher file is also created:
  Desktop\EngineAI_MATLAB\run_engineai.bat

---

## Built By
EngineAI Copilot — Shounak Kulkarni
Powered by Groq AI + MATLAB + Node.js
