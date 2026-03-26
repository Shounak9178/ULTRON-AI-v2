const { generateKiCadProject } = require('./agents/groq-agent');

async function testKiCad() {
  try {
    console.log("Testing KiCad Generation...");
    const project = await generateKiCadProject("555 timer flasher");
    console.log("Project Generated successfully:");
    console.log(JSON.stringify(project, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

testKiCad();
