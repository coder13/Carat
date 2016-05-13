'use strict';
const _ = require('lodash');

const _Node = function (node) {
	_.extend(this, node);
};

_Node.prototype.value = function (value) {
	this.value = value;
	return this;
};

const ast = module.exports = {
	l: function (value, raw) {
		return {
			type: 'Literal',
			value: value,
			raw: raw
		};
	},
	i: function (name) {
		return {
			type: 'Identifier',
			name: name
		};
	},
	me: function (obj, prop, computed) {
		return {
			type: 'MemberExpression',
			object: typeof obj === 'string' ? ast.i(obj) : obj,
			property: typeof prop === 'string' ? ast.i(prop) : prop,
			computed: computed
		};
		return me;
	},
	ce: function (callee, args) {
		return {
			type: 'CallExpression',
			callee: typeof callee === 'string' ? ast.i(callee) : callee,
			arguments: args ? args.map(i => typeof i === 'string' ? ast.l(i) : i) : []
		};
	},
	ne: function (callee, args) {
		return {
			type: 'NewExpression',
			callee: typeof callee === 'string' ? ast.i(callee) : callee,
			arguments: args ? args.map(i => typeof i === 'string' ? ast.l(i) : i) : []
		};
	},
	decFunc: function (name, params, body, options) {
		return Object.assign({
			type: 'FunctionDeclaration',
			name: (typeof name === 'string' ? ast.i(name) : name) || null,
			params: params,
			body: body
		});
	},
	func: function (name, params, body, options) {
		return Object.assign({
			type: 'FunctionExpression',
			name: (typeof name === 'string' ? ast.i(name) : name) || null,
			params: params,
			body: body
		});
	},
	block: function (body) {
		return {
			type: 'BlockStatement',
			body: body
		};
	},
	oe: function (props) {
		return {
			type: 'ObjectExpression',
			properties: props ? _.flattenDeep(arguments) : undefined
		};
	},
	prop: function (key, value, options) {
		return Object.assign({
			type: 'Property',
			key: typeof key === 'string' ? ast.i(key) : key,
			value: value
		});
	},
	req: (value) => ast.ce('require', [value]),

	/* Matches 2 objects. Only returns true if object's property is NOT undefined. */
	// TODO: peformance test
	// TODO: refactor
	matches: function matches (node, object, identifier) {
		if (node === object) {
			return true;
		}
		if ((node.type === 'Identifier' || node.type === 'Property') && node.value && !identifier) {
			return matches(node, object, true) || matches(node.value, object);
		}
		return object ? Object.keys(object).every(function(key) {
			if (object[key] !== undefined && node[key] && typeof node[key] === typeof object[key] && node[key] !== object[key]) {
				if (key === 'properties' && Array.isArray(node[key]) && Array.isArray(object[key])) {
					return object[key].every(function (item) {
						return node[key].find(i => matches(i, item));
					});
				} else if (typeof object[key] === 'object') {
					return matches(node[key], object[key]);
				}
				return node[key] === object[key];
			}
			return true;
		}) : true;
	}
};
