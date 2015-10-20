'use strict';

const _ = require('lodash');
const Queries = require('./queries');
const utils = require('./utils');

const Sources = Queries.Sources;	// default list of sources
const Sinks = Queries.Sinks;		// default list of sinks

const callbacks = Queries.callbacks;

const expressions = {};

const query = module.exports = function (scope, node, cb) {
	Sources.forEach(function (source) {
		if (source.test(scope, node) && source.handle) {
			source.handle(scope, node);
		}
	});

	Sinks.forEach(function (sink) {
		if (sink.test(scope, node)) {
			sink.handle(scope, node, function (type, source) {
				//	Found a vuln!!
				cb({
					sink: {
						type: sink,
						node: node
					},
					source: {
						type: type,
						node: source
					}
				});
			});
		}
	});
};
