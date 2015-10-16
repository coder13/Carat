'use strict';

const _ = require('lodash');
const Queries = require('./queries');
const utils = require('./utils');

const Sources = Queries.Sources;	// default list of sources
const Sinks = Queries.Sinks;		// default list of sinks

const callbacks = Queries.callbacks;

const expressions = {};

const source = function (scope, node, cb) {
	Sources.forEach(function (source) {
		if (source.test(scope, node)) {
			cb(source);
		}
	});
};

const sink = function (scope, node, cb) {
	Sinks.forEach(function (sink) {
		if (sink.test(scope, node)) {
			cb(sink);
		}
	});
};

expressions.CallExpression = function (scope, node, cb) {
	source(scope, node, function (source) {
		if (source.handle) {
			source.handle(scope, node);
		}
	});

	sink(scope, node, function (sink) {
		sink.handle(scope, node, function (source) {
			//	Found a vuln!!
			cb({
				sink: sink,
				source: source
			});
		});
	});
};

const query = module.exports = function (scope, node, cb) {
	if (expressions[node.type]) {
		expressions[node.type](scope, node, cb);
	}
};
