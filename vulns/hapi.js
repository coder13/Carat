/* {"length": 1} */
var Hapi = require('hapi');

var server = new Hapi.Server();

server.route({
	method: 'GET',
	path: '/',
	handler: function (req, reply) {
		eval(req);
		// reply(request);
	}
});
