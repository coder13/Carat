'use strict';

const _ = require('lodash');
const Queries = require('./queries');

const Sources = Queries.Sources;	// default list of sources
const Sinks = Queries.Sinks;		// default list of sinks

//	List of CallExpressions that have evil callbacks.
//	cbParam is where the callback is and sourceParam is the argument in the callback that is the source
const callbacks = Queries.callbacks;

const expressions = {};

expressions.Identifier = function (scope, node) {

};

expressions.CallExpression = function (scope, node) {
	var name = node.callee.raw || node.callee.name;
	if (_.some(Sinks, (sink) => sink.search(name))) {
		console.log(node.arguments[0]);
	}
};

module.exports = function (scope, node) {
	if (expressions[node.type]) {
		expressions[node.type](scope, node);
	}
};