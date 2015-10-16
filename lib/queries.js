'use strict';

const _ = require('lodash');
const expressions = require('./traverse');
const utils = require('./utils');

/* Source stuff */

const Sources = module.exports.Sources = [{
	name: 'process',
	test: function (arg) {
		console.log(arg);
		let raw = arg.raw || arg.name || arg;
		return raw && utils.splitME(raw)[0] === 'process';
	}
}];

/* Sink stuff */

// 	arg is an object.
const isSource = function (arg) {
	return _.find(Sources, function (source) {
		if (source.test) {
			return source.test(arg);
		}
		let raw = arg.raw || arg.name || arg;
		return raw && (typeof source === 'string' ? source.regex.test(raw) : false);
	});
};

const index = function (index) {
	return function (scope, node, cb) {
		let arg = node.arguments[index];
		if (arg.isSource) {
			return cb(arg);
		}

		if (arg.value) {
			let source = isSource(arg.value);
			if (source) {
				return cb(source);
			}
		}
	};
};

const callback = function (cbParam, sourceParam) {
	return function (scope, node) {
		let func = node.arguments[cbParam === 'last' ? node.arguments.length - 1 : cbParam];
		if (func) {
			if (func.params[sourceParam]) {
				func.set.get(func.params[sourceParam].name).isSource = true;
			}
			expressions.BlockStatement(func, func.body);
		}
	};
};

const literal = function (value) {
	return {
		type: 'Literal',
		value: value
	};
};

const identifier = function (name) {
	return {
		type: 'Identifier',
		name: name
	};
};

const me = function (obj, prop) {
	return {
		type: 'MemberExpression',
		object: obj,
		property: identifier(prop)
	};
};

const ce = function (callee, args) {
	return {
		type: 'CallExpression',
		callee: identifier(callee),
		arguments: args.map(i => literal(i))
	};
};

module.exports.Sinks = [{
	name: 'eval',
	regex: /^eval$/,
	handle: index(0)
}, {
	name: 'require(\'fs\').readFile',
	regex: /^require\('fs'\).readFile$/,
	handle: callback(2, 1)
}, {
	name: 'require(\'http\').get',
	object: me(ce('require', ['http']), 'get'),
	handle: callback(1, 1)
}, { // (require('hapi').server()).route()s
	name: 'require(\'hapi\').Server().route',
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
}, {
	name: 'require(\'express\').createServer().post',
	regex: /^require\('express'\).createServer\(.*?\).post$/,
	handle: callback('last', 0)
}, {
	regex: /^require\('express'\).createServer\(.*?\).get$/,
	handle: callback('last', 0)
}, {
	regex: /^require\('express'\).Router\(.*?\).post$/,
	handle: callback('last', 0)
}, {
	regex: /^require\('express'\).Router\(.*?\).get$/,
	handle: callback('last', 0)
}, {
	regex: /^require\('express'\)\(.*?\).post$/,
	handle: callback('last', 0)
}, {
	regex: /^require\('express'\)\(.*?\).get$/,
	handle: callback('last', 0)
}, {
	regex: /^require\('mongodb'\).MongoClient.connect$/,
	handle: callback(1, 1)
}];

