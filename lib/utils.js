'use strict';

const _ = require('lodash');
const chalk = require('chalk');
const espree = require('espree');

var cs = { // colors
	'CE': chalk.green,
	'SCE': chalk.red,
	'SINK': chalk.red,
	'SOURCE': chalk.red,
	'RETURN': chalk.green
};

module.exports.log = function (type, node, name, value) {
	if (!Flags.verbose) {
		return;
	}
	let p = this.pos(node);

	let v = value ? stringifyArg(value) : '';
	console.log(Array(this.depth || 1).join('-'), cs[type] ? cs[type]('[' + type + ']') : chalk.blue('[' + type + ']'),
				chalk.bold.grey(p), name.name || name.raw || name.value || name,
				value ? (chalk.bold.green(value.type) + ': ' + chalk.white(v)) : '');
};

/*
	Takes a member expression made up of other Expressions and returns a single string.
	Designed to be used mainly for the names of CallExpressions
	resolve determines whether to determine the value of the identifier in its current scope.
*/
const resolveMemberExpression = module.exports.resolveMemberExpression = function (node) {
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
	case 'TemplateElement':
		return node.value.raw;
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
