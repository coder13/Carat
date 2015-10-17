'use strict';
const _ = require('lodash');

const ast = module.exports = {
	l: function (value) {
		return {
			type: 'Literal',
			value: value
		};
	},
	i: function (name) {
		return {
			type: 'Identifier',
			name: name
		};
	},
	me: function (obj, prop, computed) {
		let me = {type: 'MemberExpression'};

		if (obj) {
			me.object = typeof obj === 'string' ? ast.i(obj) : obj;
		}

		if (prop) {
			me.property = typeof prop === 'string' ? ast.i(prop) : prop;
		}

		if (computed) {
			me.computed = computed;
		}

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
	f: function (name, params, body) {
		name = typeof name === 'string' ? ast.i(name) : name;
		return {
			type: 'FunctionExpression',
			id: name || null,
			params: params,
			body: body
		};
	},
	body: function (children) {
		return {
			type: 'BlockStatement',
			body: children
		};
	},
	oe: function (props) {
		return {
			type: 'ObjectExpression',
			properties: _.flattenDeep(arguments)
		};
	},
	prop: function (key, value, options) {
		let prop = options || {
			kind: 'init',
			method: false,
			shorthand: false,
			computed: false
		};

		prop.type = 'Property';
		prop.key = typeof key === 'string' ? ast.i(key) : key;

		if (value) {
			prop.value = value;
		}

		return prop;
	},
	req: (value) => ast.ce('require', [value])
};
