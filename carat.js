var esprima = require('esprima'),
	_ = require('underscore'),
	chalk = require('chalk'),
	Scope = require('./scope.js');

var Sinks = ['eval', 'setTimeout', 'clearTimeout'];
var Sources = ['process.argv']

module.exports.Flags = Flags = {
	debug: true,
	verbose: false,
	pretty: false
}

module.exports.flags = function (flags) {
	Flags.debug = !!(flags.debug == undefined ? Flags : flags).debug || true;
	Flags.verbose = !!(flags.verbose == undefined ? Flags : flags).verbose;
}

module.exports.check = function(code, file) {
	code = _.filter(code.split('\n'), function(l) {return (l[0] + l[1])!="#!";}).join('\n');
	var ast = esprima.parse(code, {loc: true})

	var reports = [];

	Scope = Scope(Flags);
	Scope.prototype.onReport = function (report) {
		reports.push(report);
	};
	
	var scope = new Scope({
		file: file
	});

	ast.body = _(ast.body).reject(function (node) {
		if (node.type == 'FunctionDeclaration') {
			func = scope.resolveStatement['FunctionDeclaration'](node);
			return true;
		}
	});

	ast.body.forEach(function(node) {
		if (node.type == 'ExpressionStatement')
			node = node.expression;

		try {
			if (scope.resolveStatement[node.type])
				scope.resolveStatement[node.type](node);
			else {
				console.log('undefined statement:', node.type);
			}
		} catch (e) {
			if (Flags.debug) {
				console.error(chalk.bold.red('Error reading line:'), scope.file + ':' + pos(node));
				console.error(e.stack);
			}
		}

	});

	return reports;
}

/*
		Convience Functions
*/

function pos(node) {
	return node.loc ? String(node.loc.start.line) : '-1';
};