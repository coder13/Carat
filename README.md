# Carat 
---

Scans Node.js programs for vulnerabilities.
Uses [Espect](http://github.com/coder13/espect)

## Usage:
---

*note:* very, very, very rough. May change, who knows when I'll keep working on this thing. But for now, this is how you'd use it.

```js
const fs = require('fs');
const carat = require('carat');

const code = string(fs.readFileSync(fileLocation));

// Given the code, options, fileLocation and a callback, calls the callback with each report it fines.
// Each report contains the sink and the source and the locatoins of them.
carat.traverse(code, options, fileLocation, function (report) {
    console.log(report);
})
```
From terminal:

```bash
$ carat <file> [options]
```

## Notes to keep in mind:

Code is written in es6, only traverses es5 for now.
