/* {"length": 2} */
var express = require('express');

var app = express();

app.put('/', function(req, res) {
	res.send(req);
});

var router = express.Router();

router.post('/', function (req, res) {
	res.send(req);
});
