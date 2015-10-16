'use strict';

const _ = require('lodash');
const expressions = require('./traverse');
const utils = require('./utils');
const api = require('./queryApi');

let translate = {
	CallExpression: node => node.callee,
	MemberExpression: node => node,
	Identifier: node => node
};

// 	arg is an object.
const isSource = function (scope, node, cb) {
	return _.forEach(Sources, function (source) {
		if (source.test && source.test(scope, node)) {
			cb(source);
		}
	});
};

const tests = {
	regex: function (regex) {
		return function (scope, node) {
			if (translate[node.type]) {
				return regex.test(translate[node.type](node).name);
			}
		};
	},
	object: function (object) {
		return function (scope, node) {
			return _.isMatch(translate[node.type] ? translate[node.type](node) : node, object);
		};
	}
};

const handlers = {
	index: function (index) {
		return function (scope, node, cb) {
			if (node.type !== 'CallExpression') {
				return false;
			}

			let arg = node.arguments[index];
			if (arg.isSource) {
				return cb(arg);
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
					func.set.get(func.params[sourceParam].name).isSource = this;
				}
				expressions.BlockStatement(func, func.body);
			}
		};
	}
};

const Sources = module.exports.Sources = [{
	name: 'process',
	test: function (scope, node) {
		if (node.type === 'MemberExpression' || node.type === 'Identifier') {
			return utils.splitME(node.name)[0] === 'process';
		}
		return false;
	}
}, {
	name: 'fs.readFile',
	test: tests.object(api.me(api.req('fs'), 'readFile')),
	handle: handlers.callback('last', 1)
}, {
	name: 'require(\'http\').get',
	test: tests.object(api.me(api.req('http'), 'get')),
	handle: handlers.callback(1, 1)
}];

module.exports.Sinks = [{
	name: 'eval',
	test: tests.regex(/^eval$/),
	handle: handlers.index(0)
}, {
	name: 'require(\'fs\').readFile',
	test: tests.object(api.me(api.req('fs'), 'readFile')),
	handle: handlers.index(0)
}, {
	name: 'require(\'http\').get',
	test: tests.object(api.me(api.req('http'), 'get')),
	handle: handlers.index(0)
}, { // (require('hapi').server()).route()s
	name: 'require(\'hapi\').Server().route',
	test: tests.object(api.me(api.ce(api.me(api.req('hapi'), 'Server')), 'route')),
	regex: /^require\('hapi'\).Server\(.*?\).route$/,
	handler: function (node, ce) {
		var func;

		if (ce.arguments[0].type === 'Object') {
			if (ce.arguments[0].props.config && ce.arguments[0].props.config.props.handler) {
				func = ce.arguments[0].props.config.props.handler;
			} else {
				func = ce.arguments[0].props.handler;
			}
		}

		if (!func || !func.type === 'Function' || !func.params) {
			return;
		}

		var params = _.map(func.params, function (i) {
			return {
				type: 'Identifier',
				value: i,
				source: false
			};
		});

		params[0].source = {name: params[0].value, line: func.scope.pos(node)};
		log.call(func.scope, 'SOURCE', node, func.params[0]);
		func.scope.report('SOURCE', node, func.params[0]);

		func.traverse(params);
	}
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

