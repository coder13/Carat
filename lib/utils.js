'use strict';

const _ = require('lodash');
const espree = require('espree');
const chalk = require('chalk');
var config = require('getconfig');
const resolve = require('resolve');

var espreeOptions = {
	loc: true,
	tolerant: true
	// ecmaFeatures: {
	// 	arrowFunctions: false,
	// 	blockBindings: false,
	// 	templateStrings: false,
	// 	forOf: false,
	// 	regexYFlag: false,
	// 	regexUFlag: false,
	// 	generators: false
	// }
};

/*
	Takes a member expression made up of other Expressions and returns a single string.
	Designed to be used mainly for the names of CallExpressions
	resolve determines whether to determine the value of the identifier in its current scope.
*/
const resolveMemberExpression = module.exports.resolveMemberExpression = function (node, resolve) {
	switch (node.type) {
	case 'MemberExpression':
		let obj = resolveMemberExpression(node.object);
		let prop = resolveMemberExpression(node.property);
		let name = obj + (node.computed ? '[' + prop + ']' : '.' + prop);
		return name;
	case 'Identifier':
		return node.name;
	case 'Literal':
		return typeof node.value === 'string' ? '\'' + node.value + '\'' : node.value;
	case 'NewExpression':
	case 'CallExpression':
		// Formats a CallExpression / NewExpression to a nice raw format.
		let stringifyArgs = _(node.arguments).map(resolveMemberExpression);

		return resolveMemberExpression(node.callee) + '(' + stringifyArgs.join(', ') + ')';
	case 'ThisExpression':
		return 'this';
	case 'FunctionExpression':
		return 'Function';
	default:
		// console.log(node.type);
		return '';
	}
};

// Quick function to return the line number of a node
module.exports.pos = function (node) {
	return node.loc ? String(node.loc.start.line) : '-1';
};

// Search a object for value with a given name
// module.exports.find = function (reports, name) {
// 	if (!name || typeof name != 'string')
// 		return false;
// 	return _.find(reports, function(i) {
// 		return name.indexOf(i.source.name + '.') == 0 ||
// 				name.indexOf(i.source.name + '(') == 0 ||
// 				name.indexOf(i.source.name + '[') == 0 ||
// 				name == i.source.name;
// 	});
// };

// Splits a MemberExpression by the actually dots that seperate each part.
module.exports.splitME = function (me) {
	return me.split(/\.\s*(?=[^)]*(?:\(|$))/g);
};

module.exports.isName = function (i) {
	return i === 'Identifier' || i === 'MemberExpression';
};

module.exports.stringifyArg = function (arg) {
	if (arg) {
		let color = arg.source ? chalk.red : chalk.blue;
		return color(arg.value || (arg.callee ? (arg.callee.raw || arg.callee.value || arg.callee) : arg.name) || arg.raw || arg);
	}
	return '';
};

// Parses the file and returns the ast.
module.exports.parseFile = function (file, options) {
	try {
		var data = fs.readFileSync(file);
		if (data) {
			var code = String(data).replace(/^\#\!/, '//'); // Get rid of #!/usr/bin/env node
			var ast = espree.parse(code, _.extend({}, espreeOptions, options));
			return ast;
		}
	} catch (e) {
		console.error(e);
	}
	return false;
};

// Returns the directory the given file is in.
module.exports.dir = function (file) {
	return file.split('/').slice(0, -1).join('/');
};

const fileLookupTable = {};

// Takes a module name and returns it's location.
module.exports.resolvePath = function (file, baseDir, cb) {
	// resolve the filename given the base directory
	try {
		var resolvedfile = resolve.sync(file, {basedir: baseDir});
		if (!resolvedfile) {
			return false;
		}

		if (fileLookupTable[resolvedfile]) {
			// console.error('already parsed', resolvedfile);
			return false;
		}

		fileLookupTable[resolvedfile] = true;

		return resolvedfile;
	} catch (e) {
		console.error(config.isDev ? e.stack : e);
	}
};

module.exports.getAst = function (code, options) {
	options = options || {};
	if (!options.loc) {
		options.loc = true;
	}

	try {
		// Handles #!/usr/bin/env node; Esprima doesn't actually know what to do with it.
		code = code.replace(/^\#\!/, '//');

		return espree.parse(code, options);
	} catch (e) {
		console.error('There was an error with the code when parsing.');
		console.error(e.stack);
		return false;
	}
};
