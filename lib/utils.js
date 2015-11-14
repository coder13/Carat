'use strict';

const _ = require('lodash');
const chalk = require('chalk');
const escodegen = require('escodegen');
const resolve = require('resolve');

const _debug = require('debug');
const error = module.exports.error = _debug('carat:error');
const debug = module.exports.debug = _debug('carat');

const genOptions = {
	format: {
		indent: {
			style: '',
			base: 0
		},
		newline: '',
		quotes: 'single'
	}
};

const generate = module.exports.generate = (ast => escodegen.generate(ast, genOptions));

const _match = function (node, object, identifier) {
	if (node === object) {
		return true;
	}
};

/* Matches 2 objects. Only returns true if object's property is NOT undefined. */
// TODO: peformance test
// TODO: refactor
const matches = module.exports.matches = function (node, object, identifier) {
	if (node === object) {
		return true;
	}
	if ((node.type === 'Identifier' || node.type === 'Property') && node.value && !identifier) {
		return matches(node, object, true) || matches(node.value, object);
	}
	return object ? Object.keys(object).every(function(key) {
		if (object[key] !== undefined && node[key] && typeof node[key] === typeof object[key] && node[key] !== object[key]) {
			if (key === 'properties' && Array.isArray(node[key]) && Array.isArray(object[key])) {
				return object[key].every(function (item) {
					return node[key].find(i => matches(i, item));
				});
			} else if (typeof object[key] === 'object') {
				return matches(node[key], object[key]);
			}
			return node[key] === object[key];
		}
		return true;
	}) : true;
};
// const matches = module.exports.matches = function (node, object) {
// 	if (node && object) {
// 		return Object.keys(object).every(function (key) {
// 			if (object[key] === undefined ||
// 				node[key] 	=== object[key]) {
// 				return true;
// 			}

// 			if (Array.isArray(node[key]) && Array.isArray(object[key])) {
// 				return object[key].every(function (item) {
// 					return node[key].find(i => matches(i, item));
// 				});
// 			} else if (typeof object[key] === 'object') {
// 				if (['Identifier', 'Property'].indexOf(node[key].type) !== -1 && object[key].value) {
// 					return matches(node[key].value, object[key]);
// 				}
// 				return matches(node[key], object[key]);
// 			}
// 			return node[key] === object[key];
// 		});
// 	}
// 	return false;
// };

// Quick function to return the line number of a node
const pos = module.exports.pos = function (node) {
	return node.loc ? (node.loc.file ? node.loc.file + ':' : '') + node.loc.start.line : '-1';
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
			return false;
		}

		fileLookupTable[resolvedfile] = true;

		return resolvedfile;
	} catch (e) {
		error(e);
	}
};
