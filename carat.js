var esprima = require('esprima'),
	Scope = require('./scope.js'),
	chalk = require('chalk'),
	_ = require('underscore');

var Sinks = [
	"^eval$",
	"^setTimeout$",
	"^clearTimeout$",
	"^setInterval$",
	"^clearInterval$",
	"^require\\('child_process'\\).exec$",
	"^require\\('http'\\).get$",
	"^require\\('fs'\\).*$",
	"^require\\('express'\\).*$",
	"^require\\('hapi'\\).*$",
];

var Sources = ['^process.*$'];

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
	Scope.Global = new Scope({depth: 0});

	Scope.prototype.onReport = function (report) {
		reports.push(report);
		console.log(chalk.red('[REPORT]'), report.sink.name, report.source.name);
	};

	var vars = {
		module: {type: 'Object', props: {exports: {type: 'Object', props: {}}}},
		global: {type: 'Object', props: {}}
	};
	vars.exports = vars.module.props.exports;
	vars.this = {type: 'Object', props: vars, source: false};

	var scope = new Scope(_.extend(Scope.Global, {
		file: file,
		vars: vars
	}));

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
		console.error(e.stack);
		return false;
	}
}
