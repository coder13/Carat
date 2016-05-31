/* {"length": 3, "process": true} */

var regex = RegExp(process.argv[2]);
regex.compile(process.argv[3]);
regex.test(process.argv[4]);
