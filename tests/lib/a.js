module.exports.e = eval;

require('fs').readFile('blah', 'utf8', function(err, data) {
	
	module.exports.source = data;

});