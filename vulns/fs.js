/* {"length": 2, "process": true} */
var fs = require('fs');

var source = fs.readFileSync(process.argv[2]);
eval(source);

fs.readFile(source, function (err, data) {
	eval(data);
});
