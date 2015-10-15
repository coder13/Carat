'use strict';

const extend = require('lodash').extend;
const traverse = require('./traverse');

const Flags = {
	recursive: false,
	debug: false,
	verbose: false,
	pretty: false,
	json: false
};

module.exports = function (options, code, cb) {
	extend(Flags, options);

	// var tree = traverse(Flags, code, (scope, node) => console.log(node.type));
	let tree = traverse.traverse(Flags, code, cb);

	return tree;
};
