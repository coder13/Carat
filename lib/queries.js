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
		return function (scope, node) {
			return _.isMatch(node, object);
		};
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
			if (func) {
				if (func.params[sourceParam]) {
					func.set.get(func.params[sourceParam].name).source = this;
				}
				expressions.BlockStatement(func, func.body);
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
	name: 'require(\'http\').get',
	test: tests.object(ast.ce(ast.me(ast.req('http'), 'get'))),
	handle: handlers.callback(1, 1)
}, { // (require('hapi').server()).route()
	name: 'require(\'hapi\').Server().route',
	test: tests.object(ast.ce(ast.me(ast.ne(ast.me(ast.req('hapi'), 'Server')), 'route'), [ast.oe(ast.prop('handler'))])),
	handle: function (scope, node) {
		console.log('+1');
		let handler = _.get(_.findWhere(node.arguments[0].properties, {key: ast.i('handler')}), 'value');
		if (handler) {
			let paramName = handler.params[0].name;
			handler.set.get(paramName).source = true;
			expressions.BlockStatement(handler, handler.body);
		}
	}
}];

module.exports.Sinks = [{
	name: 'eval',
	test: tests.regex(/^eval$/),
	handle: handlers.index(0)
}, {
	name: 'require(\'fs\').readFile',
	test: tests.object(ast.ce(ast.me(ast.req('fs'), 'readFile'))),
	handle: handlers.index(0)
}, {
	name: 'require(\'http\').get',
	test: tests.object(ast.ce(ast.me(ast.req('http'), 'get'))),
	handle: handlers.index(0)

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
}];

