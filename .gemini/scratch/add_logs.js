const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach((f) => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

walkDir('src/handlers', function (filePath) {
    if (!filePath.endsWith('.ts')) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // Replace .save() with log.debug + .save()
    // Regex matches: spaces, variable name, .save();
    content = content.replace(/^(\s+)(\w+)\.save\(\);/gm, (match, spaces, varName) => {
        return `${spaces}log.debug('[auto] saving entity: {}', ['${varName}']);\n${spaces}${varName}.save();`;
    });

    // Replace early returns `if (var == null) return;`
    content = content.replace(/^(\s+)if \(([\w\.]+) == null\) return;/gm, (match, spaces, condition) => {
        return `${spaces}if (${condition} == null) {\n${spaces}    log.warning('[auto] early return: {} is null', ['${condition}']);\n${spaces}    return;\n${spaces}}`;
    });

    fs.writeFileSync(filePath, content, 'utf8');
});

console.log('Finished adding logs to handlers.');
