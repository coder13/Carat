/*
		Convience functions
*/

var cs = { // colors
	'CE': chalk.green,
	'SCE': chalk.red,
	'SINK': chalk.red,
	'SOURCE': chalk.red,
	'RETURN': chalk.green
};

module.xports.log = function (type, node, name, value) {
	if (!Flags.verbose)
		return;
	var p = this.pos(node);

	var v = value ? stringifyArg(value) : '';
	console.log(Array(this.depth || 1).join('-'), cs[type] ? cs[type]('[' + type + ']') : chalk.blue('[' + type + ']'),
				chalk.bold.grey(p), name.name || name.raw || name.value || name,
				value ? (chalk.bold.green(value.type) + ': ' + chalk.white(v)) : '');
};

// Quick function to return the line number of a node
module.xports.pos = function (node) {
	return node.loc ? String(node.loc.start.line) : '-1';
};

// Search a object for value with a given name
module.xports.find = function (reports, name) {
	if (!name || typeof name != 'string')
		return false;
	return _.find(reports, function(i) {
		return name.indexOf(i.source.name + '.') == 0 ||
				name.indexOf(i.source.name + '(') == 0 ||
				name.indexOf(i.source.name + '[') == 0 ||
				name == i.source.name;
	});
};

// Splits a MemberExpression by the actually dots that seperate each part.
module.xports.splitME = function (me) {
	return me.split(/\.\s*(?=[^)]*(?:\(|$))/g);
};

module.xports.isName = function (i) {
	return i == 'Identifier' || i == 'MemberExpression';
};

module.xports.stringifyArg = function (arg) {
	if (arg) {
		return (arg.source ? chalk.red:chalk.blue)(arg.value || (arg.callee ? (arg.callee.raw || arg.callee.value || arg.callee) : arg.name) || arg.raw || arg);
	} else {
		return '';
	}
};

module.exports.getAst = function (code, location) {
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
};
