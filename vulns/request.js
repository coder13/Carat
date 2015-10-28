/* {"length": 1} */
// TODO: mark body as source?

var request = require('request');

request('bad url', function (err, res, body) {
	eval(res);
});
