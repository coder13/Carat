'use strict';
const expressions = require('./expressions');

module.exports = {
	traverse: expressions.traverse,
	expressions: expressions,
	quieries: require('./queries'),
	query: require('./query'),
	api: require('./queryApi')
};
