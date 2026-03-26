const fs = require("fs");
const path = require("path");

function generateKiCadProject(projectName) {
    const projectDir = path.join(__dirname, "..", "kicad_projects", projectName);

    if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
    }

    const projectFile = `
(kicad_project
  (version 1)
  (generator engineai)
)
`;

    fs.writeFileSync(path.join(projectDir, projectName + ".kicad_pro"), projectFile);

    return {
        success: true,
        message: "KiCad project created",
        path: projectDir
    };
}

module.exports = { generateKiCadProject };