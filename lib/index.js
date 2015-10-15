'use strict';

const esprima = require('esprima');
const chalk = require('chalk');
const _ = require('lodash');
const Scope = require('./scope');
const utils = require('./utils');

const Sinks = [
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

const Sources = ['^process.*$'];
const callbacks = [];

const Flags = DefaultFlags = global.Flags = module.exports.Flags = {
	recursive: false,
	debug: false,
	verbose: false,
	pretty: false,
	json: false
};

module.exports = function (options, code) {
	Flags = _.extend(DefaultFlags, options);

	let ast = getAst(code);
	if (!ast)
		return false;

	let reports = [];

	Scope.Global = new Scope({file: options.file, depth: 0});

	Scope.prototype.onReport = function (report) {
		reports.push(report);
		if (Flags.verbose && !Flags.json)
			console.log(chalk.red('[REPORT]'), report.sink.name, report.source.name);
	};

	let parent = {
		file: file,
		lets: _.extend({
			module: {type: 'Object', props: {exports: {type: 'Object', props: {}}}},
			global: {type: 'Object', props: {}}
		}, Scope.Global.lets)
	};

	parent.lets.exports = parent.lets.module.props.exports;
	let scope = new Scope(parent);

	scope.traverse(ast.body);

	return {
		reports: reports,
		reportedSinks: Scope.reportedSinks
	};
};

function getAst(code, location) {
	let options = {
		loc: location !== undefined ? location : true // yes, we want the the postition (line number, column) of each node
	};
	try {
		// Handles #!/usr/bin/env node; Esprima doesn't actually know what to do with it.
		code = code.replace(/^\#\!/, '//');

		return espree.parse(code, options);
	} catch (e) {
		console.error("There was an error with the code when parsing.");
		console.error(e.stack);
		return false;
	}
}
