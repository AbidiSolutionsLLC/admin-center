const fs = require('fs');
const lines = fs.readFileSync('src/controllers/policies.controller.ts', 'utf8').split('\n');
let depth = 0;
lines.forEach((l, i) => {
  const oldDepth = depth;
  depth += (l.match(/\{/g)||[]).length;
  depth -= (l.match(/\}/g)||[]).length;
  if (depth === 1 && oldDepth === 0) {
    console.log(`Depth became 1 at line ${i+1}: ${l}`);
  }
});
