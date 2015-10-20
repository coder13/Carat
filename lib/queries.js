'use strict';

const _ = require('lodash');
const expressions = require('./expressions');
const utils = require('./utils');
const ast = require('./ast');

let translate = {
	CallExpression: node => node.callee,
	MemberExpression: node => node,
	Identifier: node => node
};

// 	arg is an object.
const isSource = function (scope, node, cb, parent) {
	if (parent && utils.matches(node, parent)) {
		return false;
	}
	if (node.source) {
		cb(node.source, node);
		return;
	}
	if (node.type === 'BinaryExpression') {
		isSource(scope, node.left, cb, node);
		isSource(scope, node.right, cb, node);
	} else if (node.type === 'MemberExpression') {
		isSource(scope, node.object, cb, node);
		isSource(scope, node.property, cb, node);
	} else if (node.type === 'Identifier' && node.value) {
		isSource(scope, node.value, cb, node);
	}
	return _.forEach(Sources, function (source) {
		if (source.test && source.test(scope, node)) {
			node.source = source;
			cb(source, node);
		}
	});
};

const isSink = function (scope, node, parent) {
	if (parent && utils.matches(node, parent)) {
		return false;
	}
	if (node.sink) {
		return {
			node: node,
			sink: node.sink
		};
	}
	if (node.type === 'BinaryExpression') {
		return isSink(scope, node.left, node) || isSink(scope, node.right, node);
	} else if (node.type === 'MemberExpression') {
		return isSink(scope, node.object, node) || isSink(scope, node.property, node);
	} else if (node.type === 'Identifier' && node.value) {
		return isSink(scope, node.value, node);
	}
};

const tests = {
	regex: function (regex) {
		return function (scope, node) {
			return translate[node.type] ? regex.test(translate[node.type](node).name) : false;
		};
	},
	object: function (object) {
		return (scope, node) => utils.matches(node, object);
	}
};

const handlers = {
	index: function (index) {
		return function (scope, node, cb) {
			if (node.type !== 'CallExpression') {
				return false;
			}
			let arg = node.arguments[index];
			if (arg) {
				isSource(scope, arg, cb);
			}
		};
	},
	callback: function (cbParam, sourceParam) {
		return function (scope, node, cb) {
			if (node.type !== 'CallExpression') {
				return false;
			}
			let func = node.arguments[cbParam === 'last' ? node.arguments.length - 1 : cbParam];
			if (func && func.type === 'FunctionExpression') {
				if (func.params[sourceParam]) {
					func.set.get(func.params[sourceParam].name).source = this;
				}
				expressions.resolveExpression(func, func.body);
			}
		};
	}
};

const Sources = module.exports.Sources = [{
	name: 'process',
	// To be improved. Process should be a global variable and marked as a source from the get go.
	// Then, this should look at the object and property recursively for a source.
	test: tests.object(ast.i('process'))
}, { // fs.*
	name: 'fs.readFile',
	test: tests.object(ast.ce(ast.me(ast.req('fs'), 'readFile'))),
	handle: handlers.callback('last', 1)
}, { // Http.get
	name: 'http.get',
	test: tests.object(ast.ce(ast.me(ast.req('http'), 'get'))),
	handle: handlers.callback(1, 1)
}, { // (require('hapi').server()).route()
	name: '(new hapi.Server()).route',
	test: tests.object(ast.ce(ast.me(ast.ne(ast.me(ast.req('hapi'), 'Server')), 'route'))),
	handle: function (scope, node) {
		if (node.arguments) {
			let handler = this.getHandler(node.arguments[0].properties);
			if (handler) {
				if (handler.type === 'FunctionExpression') {
					let paramName = handler.params[0].name;
					handler.set.get(paramName).source = true;
					expressions.resolveExpression(handler, handler.body);
				}
			}
		}
	},
	getHandler: function (node) {
		let handler = _.get(_.findWhere(node, {key: ast.i('handler')}), 'value');
		if (handler) {
			return handler;
		}
		let config = _.find(node, (i) => utils.matches(ast.prop('config', ast.oe(ast.prop())), i));
		if (config) {
			handler = _.get(_.findWhere(config.value.properties, {key: ast.i('handler')}), 'value');
			if (handler) {
				return handler;
			}
		}
	}
}, { // Wreck
	name: 'wreck',
	test: tests.object(ast.ce(ast.me(ast.req('wreck')), [{}, ast.func()])),
	handle: handlers.callback('last', 1)
}, { // Request
	name: 'request',
	test: tests.object(ast.ce(ast.req('request'), [{}, ast.func()])),
	handle: handlers.callback('last', 1)
}, { // Express - createServer
	name: 'express.createServer()',
	test: tests.object(ast.ce(ast.me(ast.ce(ast.me(ast.req('express'), 'createServer'))))),
	handle: handlers.callback('last', 0)
}, { // Express
	name: 'express',
	test: tests.object(ast.ce(ast.me(ast.ce(ast.req('express'))))),
	handle: function (scope, node, cb) {
		let func = node.arguments[node.arguments.length - 1];
		if (func && func.params.length > 1) {
			func.params[0].source = this;

			func.params[1].sink = {
				name: 'response',
				handle: handlers.index(0)
			};

			expressions.resolveExpression(func, func.body);
		}
	}
}, { // Express - Router
	name: 'express.Router',
	test: tests.object(ast.ce(ast.me(ast.ce(ast.me(ast.req('express'), 'Router'))))),
	handle: function (scope, node, cb) {
		let func = node.arguments[node.arguments.length - 1];
		if (func && func.params.length > 1) {
			func.params[0].source = this;

			func.params[1].sink = {
				name: 'response',
				handle: handlers.index(0)
			};

			expressions.resolveExpression(func, func.body);
		}
	}
}];

module.exports.Sinks = [{
/* 	Necessary for parameters being sinks */
	name: 'sink',
	test: function (scope, node) {
		if (node.type === 'CallExpression') {
			let sink = isSink(scope, node.callee);
			return !!sink;
		}
	},
	handle: function (scope, node, cb) {
		let sink = isSink(scope, node.callee);
		sink.sink.handle(scope, node, cb);
	}
}, { // Eval
	name: 'eval',
	test: tests.object(ast.ce('eval')),
	handle: handlers.index(0)
}, { // Bracket notation
	name: 'Bracket',
	test: tests.object(ast.me({}, {}, true)),
	handle: function (scope, node, cb) {
		let value = node.value || node;
		isSource(scope, value.property, cb);
	}
}, { // fs.*
	name: 'fs.*',
	test: tests.object(ast.ce(ast.me(ast.req('fs')))),
	handle: handlers.index(0)
}, { // http.get
	name: 'http.get',
	test: tests.object(ast.ce(ast.me(ast.req('http'), 'get'))),
	handle: handlers.index(0)
}, { // child_process.exec
	name: 'child_process.exec',
	test: tests.object(ast.ce(ast.me(ast.req('child_process'), 'exec'))),
	handle: handlers.index(0)
}, { // Wreck
	name: 'wreck',
	test: tests.object(ast.ce(ast.me(ast.req('wreck')))),
	handle: handlers.index(0)
}, { // Request
	name: 'request',
	test: tests.object(ast.ce(ast.req('request'), [{}, ast.func()])),
	handle: handlers.index(0)
}, {
	name: 'vm',
	test: tests.object(ast.ce(ast.me(ast.req('vm')))),
	handle: handlers.index(0)
}];
