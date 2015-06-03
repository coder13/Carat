var esprima = require('esprima'),
	Scope = require('./scope.js'),
	chalk = require('chalk');

var Sinks = [
	"^eval$",
	"^setTimeout$",
	"^clearTimeout$",
	"^setInterval$",
	"^clearInterval$",
	"^require\\('child_process'\\).exec$",
	"^require\\('http'\\).get$",
	"^require\\('fs'\\).*?$",
	"^require\\('express'\\).*?$",
	"^require\\('hapi'\\).*?$",
];

var Sources = ['^process.argv.*$'];

var Flags = module.exports.Flags = {
	recursive: false,
	debug: true,
	verbose: false,
	pretty: false
};

module.exports.flags = function (flags) {
	Flags.recursive = !!(flags.recursive === undefined ? Flags : flags).recursive;
	Flags.debug = !!(flags.debug === undefined ? Flags : flags).debug;
	Flags.verbose = !!(flags.verbose === undefined ? Flags : flags).verbose;
};

module.exports.check = function(code, file) {
	var ast = getAst(code);
	if (!ast)
		return false;

	var reports = [];

	Scope = Scope(Flags, {Sinks: Sinks, Sources: Sources});
	Scope.Global = new Scope();
	Scope.stack = [Scope.Global];

	Scope.prototype.onReport = function (report) {
		reports.push(report);
		console.log(chalk.red('[REPORT]'), report.sink.name, report.source.name);
	};

	var scope = new Scope(Scope.Global);

	scope.file = file;

	scope.traverse(ast.body);

	return reports;
};

function getAst(code, location) {
	var options = {
		loc: location !== undefined ? location : true // yes, we want the the postition (line number, column) of each node
	};
	try {
		// Handles #!/usr/bin/env node; Esprima doesn't actually know what to do with it.
		code = code.replace(/^\#\!/, '//');

		return esprima.parse(code, options);
	} catch (e) {
		console.error("There was an error with the code when parsing.");
		return false;
	}
}
