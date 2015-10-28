'use strict';

const merge = require('lodash').merge;
const traverse = require('./expressions').traverse;

const Defaults = {
	recursive: true,
	debug: false,
	verbose: false,
	pretty: false,
	json: false
};

module.exports = function (ast, file, options, cb) {
	let newOptions = merge({}, Defaults, options);

	let tree = traverse(ast, file, newOptions, cb);

	return tree;
};
