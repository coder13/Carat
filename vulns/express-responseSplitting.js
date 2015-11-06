/*{"length": 1}*/
var express = require('express');
var app = express();

var name = process.argv[2]; //'что-то русское ⠊Set-Cookie: foo=bar⠊⠊ <script>alert("Hi!")</script>';
app.get('/', function (req, res) {
	res.cookie('foo_' + name, 'data');
	res.send('Hello World!');
});

var server = app.listen(7777, function () {
	var host = server.address().address;
	var port = server.address().port;
	console.log('Example app listening at http://%s:%s', host, port);
});
