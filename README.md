# Carat 
---

Scans Node.js programs for vulnerabilities.

## Usage:
---

2 ways to use: programatically and via the terminal. 


### Terminal:
After installation, just run `carat <file> [options]` on any nodejs program you want to scan it.

```
Options:

-r           Recursive flag. Will recursively check required files. Default is false.
-s,          Sink flag. Will list all the sinks in the program.
-v           Verbose flag. Will print all statements. Default is false.
-d, --debug  debug flag. Will output the file and line of the code being checked when an error is thrown
```