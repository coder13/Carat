/* {"length": 1} */
var http = require('http');

var httpServer = http.createServer(function(req, res) {
	eval(req);
});
