'use strict';

const _ = require('lodash');
const espree = require('espree');
const chalk = require('chalk');
const config = require('getconfig');
const escodegen = require('escodegen');
const fs = require('fs');
const resolve = require('resolve');

const _debug = require('debug');
const error = module.exports.error = _debug('carat:error');
const debug = module.exports.debug = _debug('carat');

const espreeOptions = {
	loc: true,
	tolerant: true,
	ecmaFeatures: {
		arrowFunctions: true,
		blockBindings: true,
		templateStrings: true,
		forOf: true,
		regexYFlag: true,
		regexUFlag: true,
		generators: true
	}
};

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

// Splits a MemberExpression by the actually dots that seperate each part.
const splitME = module.exports.splitME = function (me) {
	return me.split(/\.\s*(?=[^)]*(?:\(|$))/g);
};

const parse = module.exports.parse = function (code, options) {
	code = code.replace(/^\#\!/, '//'); // Get rid of #!/usr/bin/env node
	return espree.parse(code, _.extend({}, espreeOptions, options));
};

// Parses the file and returns the ast.
const parseFile = module.exports.parseFile = function (file, options) {
	try {
		var data = fs.readFileSync(file);
		if (data) {
			return parse(String(data), options);
		}
	} catch (e) {
		console.error(config.isDev ? e.stack : e);
	}
	return false;
};

// Returns the directory the given file is in.
const dir = module.exports.dir = function (file) {
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
			return false;
		}

		fileLookupTable[resolvedfile] = true;

		return resolvedfile;
	} catch (e) {
		if (config.debug) {
			console.error(e);
		}
	}
};
