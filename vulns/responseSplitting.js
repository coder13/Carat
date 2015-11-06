/*{"length": 1}*/
var http    = require('http');
var Cookies = require('cookies');

var data = process.argv[2]; // 'что-то русское ⠊Set-Cookie: foo=bar⠊⠊ <script>alert('Hi!!')</script>';

server = http.createServer(function(req, res) {
	var cookies = new Cookies(req, res);
	cookies.set('data', data );
	res.writeHead( 200, {'Content-Type': 'text/plain'});
	res.write(new Buffer('foo'));
	res.end();
});

server.listen(7777);
