const { callAI } = require('./agents/groq-agent');

async function test() {
  try {
    const r = await callAI("System prompt", "Write an explanation of PID");
    console.log("SUCCESS:", r ? r.slice(0, 200) : "EMPTY");
  } catch(e) {
    console.log("FAIL:", e.message);
  }
}
test();
