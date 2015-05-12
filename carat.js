var esprima = require('esprima');

module.exports.check = function(code) {
	code = _.filter(input.split('\n'), function(l) {return (l[0] + l[1])!="#!";}).join('\n');
	var ast = esprima.parse(code, {loc: true})

	

}