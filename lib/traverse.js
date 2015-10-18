'use strict';

const extend = require('lodash').extend;
const traverse = require('./expressions').traverse;

const Flags = {
	recursive: false,
	debug: false,
	verbose: false,
	pretty: false,
	json: false
};

module.exports = function (ast, file, options, cb) {
	extend(Flags, options);

	// var tree = traverse(Flags, code, (scope, node) => console.log(node.type));
	let tree = traverse(ast, file, Flags, cb);

	return tree;
};
