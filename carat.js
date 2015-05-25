var esprima = require('esprima'),
	_ = require('underscore'),
	chalk = require('chalk'),
	Scope = require('./scope.js');

var Sinks = [
	"eval", 
	"setTimeout",
	"clearTimeout", 
	"setInterval",
	"clearInterval",
	"require\\([\\']child_process[\\']\\)\\.exec", 
	"require\\([\\']http[\\']\\)\\.get",
	"require\\([\\']fs[\\']\\)\\.\\w+",
	"require\\([\\']mongodb[\\']\\)\\.\\w+",
	"require\\([\\']hapi[\\']\\)\\.\\w+",
	"require\\([\\']express[\\']\\)\\.\\w+"
];
var Sources = ['process.argv']

module.exports.Flags = Flags = {
	recursive: false,
	debug: true,
	verbose: false,
	pretty: false
}

module.exports.flags = function (flags) {
	Flags.recursive = !!(flags.recursive == undefined ? Flags : flags).recursive;
	Flags.debug = !!(flags.debug == undefined ? Flags : flags).debug;
	Flags.verbose = !!(flags.verbose == undefined ? Flags : flags).verbose;
}

module.exports.check = function(code, file) {
	ast = getAst(code);
	if (!ast)
		return false;

	var reports = [];

	Scope = Scope(Flags, {Sinks: Sinks, Sources: Sources});

	Scope.prototype.onReport = function (report) {
		reports.push(report);
	};
	
	var scope = new Scope({
		file: file
	});

	scope.traverse(ast.body);

	return reports;
}

function getAst(code, location) {
	var options = {
		loc: location != undefined ? location: true // yes, we want the the postition (line number, column) of each node
	};
	try {
		// Handles #!/usr/bin/env node; Esprima doesn't actually know what to do with it. 
		code = _.filter(code.split('\n'), function(l) {return (l[0] + l[1])!="#!";}).join('\n');
		return esprima.parse(code, options);
	} catch (e) {
		return false;
	}
}

/*
		Convience Functions
*/

function pos(node) {
	return node.loc ? String(node.loc.start.line) : '-1';
};