'use strict';

const traverse = require('espect').traverse;
const query = require('./query');

const Defaults = {
	recursive: true,
	debug: false,
	verbose: false,
	pretty: false,
	json: false
};

module.exports = function (code, options, file, cb) {
	traverse(code, Object.assign({}, Defaults, options), file, function (scope, node) {
		query(scope, node, function (report) {
			if (report) {
				cb(report);
			}
		});
	});
};
