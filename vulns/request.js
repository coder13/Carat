
// TODO: mark body as source?

var request = require('request');

request(process.argv[2], function (err, res, body) {
	eval(res);
});
