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
const isSource = function (scope, node, cb) {
	if (node.source) {
		cb(node.source, node);
		return;
	}
	if (node.type === 'BinaryExpression') {
		isSource(scope, node.left, cb);
		isSource(scope, node.right, cb);
	} else if (node.type === 'MemberExpression') {
		isSource(scope, node.object, cb);
		isSource(scope, node.property, cb);
	} else if (node.type === 'Identifier' && node.value) {
		isSource(scope, node.value, cb);
	}
	return _.forEach(Sources, function (source) {
		if (source.test && source.test(scope, node)) {
			node.source = source;
			cb(source, node);
		}
	});
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
			let arg = node.arguments[index];
			if (arg.source) {
				return cb(arg.source, arg);
			}

			isSource(scope, arg.value || arg, cb);
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
	test: function (scope, node) {
		if (node.type === 'MemberExpression' || node.type === 'Identifier') {
			return utils.splitME(node.name)[0] === 'process';
		}
		return false;
	}
}, {
	name: 'fs.readFile',
	test: tests.object(ast.ce(ast.me(ast.req('fs'), 'readFile'))),
	handle: handlers.callback('last', 1)
}, {
	name: 'http.get',
	test: tests.object(ast.ce(ast.me(ast.req('http'), 'get'))),
	handle: handlers.callback(1, 1)
}, { // (require('hapi').server()).route()
	name: '(new hapi.Server()).route',
	// test: tests.object(ast.ce(ast.me(ast.ne(ast.me(ast.req('hapi'), 'Server')), 'route'), [ast.oe(ast.prop('handler'))])),
	test: tests.object(ast.ce(ast.me(ast.ne(ast.me(ast.req('hapi'), 'Server')), 'route'))),
	handle: function (scope, node) {
		let handler = this.getHandler(node.arguments[0].properties);
		if (handler) {
			if (handler.type === 'FunctionExpression') {
				let paramName = handler.params[0].name;
				handler.set.get(paramName).source = true;
				expressions.resolveExpression(handler, handler.body);
			} else if (handler.type === 'ObjectExpression') {

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
}, {
	name: 'wreck',
	test: tests.object(ast.ce(ast.me(ast.req('wreck')), [{}, ast.func()])),
	handle: handlers.callback('last', 1)
}, {
	name: 'request',
	test: tests.object(ast.ce(ast.req('request'), [{}, ast.func()])),
	handle: handlers.callback('last', 1)
}];

module.exports.Sinks = [{
	name: 'eval',
	test: tests.regex(/^eval$/),
	handle: handlers.index(0)
}, {
	name: 'fs.*',
	test: tests.object(ast.ce(ast.me(ast.req('fs')))),
	handle: handlers.index(0)
}, {
	name: 'http.get',
	test: tests.object(ast.ce(ast.me(ast.req('http'), 'get'))),
	handle: handlers.index(0)
}, {
	name: 'wreck',
	test: tests.object(ast.ce(ast.me(ast.req('wreck')))),
	handle: handlers.index(0)
}, {
	name: 'request',
	test: tests.object(ast.ce(ast.req('request'), [{}, ast.func()])),
	handle: handlers.index(0)
}];
// }, {
// 	name: 'require(\'express\').createServer().post',
// 	regex: /^require\('express'\).createServer\(.*?\).post$/,
// 	handle: handlers.callback('last', 0)
// }, {
// 	regex: /^require\('express'\).createServer\(.*?\).get$/,
// 	handle: handlers.callback('last', 0)
// }, {
// 	regex: /^require\('express'\).Router\(.*?\).post$/,
// 	handle: handlers.callback('last', 0)
// }, {
// 	regex: /^require\('express'\).Router\(.*?\).get$/,
// 	handle: handlers.callback('last', 0)
// }, {
// 	regex: /^require\('express'\)\(.*?\).post$/,
// 	handle: handlers.callback('last', 0)
// }, {
// 	regex: /^require\('express'\)\(.*?\).get$/,
// 	handle: handlers.callback('last', 0)
// }, {
// 	regex: /^require\('mongodb'\).MongoClient.connect$/,
// 	handle: handlers.callback(1, 1)
