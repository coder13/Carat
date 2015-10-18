'use strict';
const _ = require('lodash');

const ast = module.exports = {
	l: function (value, raw) {
		let node = {
			type: 'Literal'
		};
		if (value) {
			node.value = value;
		};
		if (raw) {
			node.raw = raw;
		};
		return node;
	},
	i: function (name) {
		let node = {
			type: 'Identifier'
		};
		if (name) {
			node.name = name;
		}
		return node;
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
		let node = {
			type: 'CallExpression'
		};
		if (callee) {
			node.callee = typeof callee === 'string' ? ast.i(callee) : callee;
		}
		if (args) {
			node.arguments = args ? args.map(i => typeof i === 'string' ? ast.l(i) : i) : [];
		}
		return node;
	},
	ne: function (callee, args) {
		let node = {
			type: 'NewExpression'
		};
		if (callee) {
			node.callee = typeof callee === 'string' ? ast.i(callee) : callee;
		}
		if (args) {
			node.arguments = args ? args.map(i => typeof i === 'string' ? ast.l(i) : i) : [];
		}
		return node;
	},
	decFunc: function (name, params, body, options) {
		let node = options || {};
		node.type = 'FunctionDeclaration';
		name = typeof name === 'string' ? ast.i(name) : name;
		if (name) {
			node.id = name || [];
		}
		if (params) {
			node.params = params;
		}
		if (body) {
			node.body = body;
		}
		return node;
	},
	func: function (name, params, body, options) {
		let node = options || {};
		node.type = 'FunctionExpression';
		name = typeof name === 'string' ? ast.i(name) : name;
		if (name) {
			node.id = name || [];
		}
		if (params) {
			node.params = params;
		}
		if (body) {
			node.body = body;
		}
		return node;
	},
	block: function (body) {
		let node = {
			type: 'BlockStatement'
		};
		if (body) {
			node.body = body;
		}
		return node;
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
