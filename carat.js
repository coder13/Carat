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
	"^require\\('mongodb'\\).MongoClient.connect$"
];

var Sources = ['^process.*$'];
var callbacks = [];

var Flags;
Flags = DefaultFlags = module.exports.Flags = {
	recursive: false,
	debug: false,
	verbose: false,
	pretty: false,
	json: false
};

module.exports.configure = function (flags, options) {
	Flags = _.extend(DefaultFlags, flags);

	if (options) {
		if (options.Sinks) {
			Sinks = Sinks.concat(options.Sinks);
		}

		if (options.Sources) {
			Sources = Sources.concat(options.Sources);
		}

		if (options.Callbacks) {
			callbacks = options.callbacks;
		}
	}
};

module.exports.check = function(code, file) {
	var ast = getAst(code);
	if (!ast)
		return false;

	var reports = [];

	Scope = Scope(Flags, {Sinks: Sinks, Sources: Sources, Callbacks: callbacks});
	Scope.Global = new Scope({file: file, depth: 0});

	Scope.prototype.onReport = function (report) {
		reports.push(report);
		if (Flags.verbose && !Flags.json)
			console.log(chalk.red('[REPORT]'), report.sink.name, report.source.name);
	};

	var parent = {
		file: file,
		vars: _.extend({
				module: {type: 'Object', props: {exports: {type: 'Object', props: {}}}},
				global: {type: 'Object', props: {}}
			}, Scope.Global.vars)
	};

	parent.vars.exports = parent.vars.module.props.exports;
	var scope = new Scope(parent);

	scope.traverse(ast.body);

	return {
		reports: reports,
		reportedSinks: Scope.reportedSinks
	};
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
