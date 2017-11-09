# Carat 
---

Scans Node.js programs for vulnerabilities.
Uses [Espect](http://github.com/coder13/espect)

## Usage:
---

From terminal:

```bash
$ carat <file> [options]
```

Example:

```bash
$ carat vulns/fs.js
---------------- vulns/fs.js
vuln
 sink:
  line: vulns/fs.js:4
  code: fs.readFileSync(process.argv[2])
source:
  line: vulns/fs.js:4
  code: process
vuln
 sink:
  line: vulns/fs.js:8
  code: eval(data)
source:
  line: vulns/fs.js:8
  code: data
```

## Notes to keep in mind:

Code is written in es6, only traverses es5 for now.
