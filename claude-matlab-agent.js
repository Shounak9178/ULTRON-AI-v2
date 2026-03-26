/**
 * agents/claude-matlab-agent.js
 *
 * Uses Claude API to generate MATLAB code for ANY project.
 * No hardcoded templates — Claude understands the project
 * and writes the exact code needed.
 */

const fetch = require('node-fetch');
const { ANTHROPIC_API_KEY, MODEL, MAX_TOKENS } = require('../config');

// ─────────────────────────────────────────────────────────────
//  SYSTEM PROMPT — teaches Claude how to generate MATLAB steps
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert MATLAB engineer and AI assistant.
Your job is to take any engineering project description and break it into
executable MATLAB steps that run live on the user's desktop.

CRITICAL RULES:
1. Return ONLY valid JSON — no markdown, no backticks, no explanation outside JSON
2. Every "cmd" field must be valid, runnable MATLAB code
3. Each step must be self-contained and executable independently
4. Use fprintf() to print progress messages so user sees output
5. Generate figures with figure() commands so plots appear on desktop
6. Include realistic engineering values and proper MATLAB syntax
7. Each step should do one logical thing (define params, plot, compute, etc.)
8. Always start with: clear; clc; close all;
9. Always end with a completion message using fprintf or disp
10. Keep each cmd between 3-15 lines of MATLAB code

Return this exact JSON structure:
{
  "title": "Short project title",
  "description": "One sentence describing what this project does",
  "estimatedTime": "X seconds",
  "matlabToolboxes": ["base", "control", "signal", "image"],
  "steps": [
    {
      "label": "Short step name",
      "cmd": "MATLAB code here\\nMultiple lines separated by \\n",
      "produces": "what this step creates: plot/variable/calculation/figure"
    }
  ]
}

The "matlabToolboxes" field lists which MATLAB toolboxes are needed.
Common ones: base (always needed), control (Control System Toolbox),
signal (Signal Processing Toolbox), image (Image Processing Toolbox),
stats (Statistics Toolbox), optim (Optimization Toolbox),
symbolic (Symbolic Math Toolbox), rf (RF Toolbox).

Generate between 6 and 14 steps depending on project complexity.
Each step label should be concise (3-6 words max).
Make the project complete and professional quality.`;

// ─────────────────────────────────────────────────────────────
//  MAIN FUNCTION — generate MATLAB project for any query
// ─────────────────────────────────────────────────────────────
async function generateMATLABProject(query) {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'YOUR_API_KEY_HERE') {
    throw new Error('API key not configured. Open config.js and add your Claude API key.');
  }

  const userPrompt = `Generate a complete, professional MATLAB project for this request:

"${query}"

Make it comprehensive, with real engineering values, proper plots, and complete analysis.
Include all necessary steps from setup to final results.
Use proper MATLAB syntax — this code will execute directly in MATLAB.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data    = await response.json();
  const content = data.content[0].text;

  // Parse the JSON response from Claude
  let project;
  try {
    // Strip any accidental markdown
    const clean = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    project = JSON.parse(clean);
  } catch (e) {
    // Try to extract JSON from response
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      project = JSON.parse(match[0]);
    } else {
      throw new Error(`Failed to parse Claude response as JSON: ${e.message}`);
    }
  }

  // Validate structure
  if (!project.steps || !Array.isArray(project.steps)) {
    throw new Error('Invalid project structure from Claude');
  }

  return project;
}

// ─────────────────────────────────────────────────────────────
//  GENERATE FOLLOW-UP — modify or extend existing project
// ─────────────────────────────────────────────────────────────
async function generateFollowUp(originalQuery, followUpQuery, previousSteps) {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'YOUR_API_KEY_HERE') {
    throw new Error('API key not configured.');
  }

  const userPrompt = `Original MATLAB project: "${originalQuery}"

The user wants to extend or modify it:
"${followUpQuery}"

Previous steps already executed:
${previousSteps.map((s, i) => `${i+1}. ${s.label}`).join('\n')}

Generate additional MATLAB steps that build on top of the previous work.
Assume all previous variables are still in the MATLAB workspace.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const data    = await response.json();
  const content = data.content[0].text;
  const clean   = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

// ─────────────────────────────────────────────────────────────
//  EXPLAIN STEP — Claude explains what a step does
// ─────────────────────────────────────────────────────────────
async function explainStep(stepLabel, stepCode) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Explain this MATLAB step in 2-3 sentences for an engineering student:\n\nStep: ${stepLabel}\nCode:\n${stepCode}`
      }],
    }),
  });
  const data = await response.json();
  return data.content[0].text;
}

module.exports = { generateMATLABProject, generateFollowUp, explainStep };