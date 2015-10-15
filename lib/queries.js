'use strict';

const Sources	= module.exports.Sources	= ['^process.*$'];
const Sinks		= module.exports.Sinks		= ['^eval$'];

const callbacks = module.exports.callbacks	= [{
	name: '^require\\(\'fs\'\\).readFile$',
	handler: {cbParam: 2, sourceParam: 1}
}, {
	name: 'require\\(\'http\'\\).get',
	handler: {cbParam: 1, sourceParam: 1}
}, { // (require('hapi').server()).route()s
	name: '^require\\(\'hapi\'\\).Server\\(.*?\\).route$',
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
	name: '^require\\(\'express\'\\).createServer\\(.*?\\).post$',
	handler: {cbParam: 'last', sourceParam: 0}
}, {
	name: '^require\\(\'express\'\\).createServer\\(.*?\\).get$',
	handler: {cbParam: 'last', sourceParam: 0}
}, {
	name: '^require\\(\'express\'\\).Router\\(.*?\\).post$',
	handler: {cbParam: 'last', sourceParam: 0}
}, {
	name: '^require\\(\'express\'\\).Router\\(.*?\\).get$',
	handler: {cbParam: 'last', sourceParam: 0}
}, {
	name: '^require\\(\'express\'\\)\\(.*?\\).post$',
	handler: {cbParam: 'last', sourceParam: 0}
}, {
	name: '^require\\(\'express\'\\)\\(.*?\\).get$',
	handler: {cbParam: 'last', sourceParam: 0}
}, {
	name: '^require\\(\'mongodb\'\\).MongoClient.connect$',
	handler: {cbParam: 1, sourceParam: 1}
}];
