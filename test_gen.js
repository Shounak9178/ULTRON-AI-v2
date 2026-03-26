const { generateProject } = require('./agents/groq-agent');

async function test() {
  try {
    const p = await generateProject('PID Controller');
    console.log("KEYS:", Object.keys(p));
    console.log("EXPLANATION LENGTH:", p.explanation ? p.explanation.length : 'MISSING');
    if (p.explanation) console.log("SNIPPET:", p.explanation.slice(0, 200));
  } catch(e) {
    console.log("ERROR:", e.message);
  }
}
test();
