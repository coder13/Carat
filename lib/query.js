'use strict';

const _ = require('lodash');
const Queries = require('./queries');
const utils = require('./utils');

const Sources = Queries.Sources;	// default list of sources
const Sinks = Queries.Sinks;		// default list of sinks

const callbacks = Queries.callbacks;

const expressions = {};

expressions.CallExpression = function (scope, node, cb) {
	var name = node.callee.raw || node.callee.name;
	let sink = _.find(Sinks, function (sink) {
		if (sink.test) {
			return sink.test(node.callee);
		} else if (sink.object && node.callee.type === 'MemberExpression') {
			return _.isMatch(node.callee, sink.object);
		} else if (sink.regex && node.callee.type === 'Identifier') {
			return sink.regex.test(node.callee.name);
		}
		return false;
	});

	if (sink) {
		let source = sink.handle(scope, node, function (source) {
			console.log(source);
			cb({
				sink: name,
				source: typeof source === 'object'  ? utils.resolveMemberExpression(source) : source
			});
		});
	}
};

expressions.Function = function (scope, node) {
	// console.log(scope, node);
};

const query = module.exports = function (scope, node, cb) {
	if (expressions[node.type]) {
		return expressions[node.type](scope, node, cb);
	}
};
