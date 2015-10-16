const api = module.exports = {
	literal: function (value) {
		return {
			type: 'Literal',
			value: value
		};
	},
	identifier: function (name) {
		return {
			type: 'Identifier',
			name: name
		};
	},
	me: function (obj, prop, computed) {
		var me = {type: 'MemberExpression'};

		if (obj) {
			me.object = typeof obj === 'string' ? api.identifier(obj) : obj;
		}

		if (prop) {
			me.property = typeof prop === 'string' ? api.identifier(prop) : prop;
		}

		if (computed) {
			me.computed = computed;
		}

		return me;
	},
	ce: function (callee, args) {
		var ce = {
			type: 'CallExpression',
			callee: typeof callee === 'string' ? api.identifier(callee) : callee,
			arguments: []
		};
		if (args) {
			ce.arguments = args.map(i => api.literal(i));
		}
		return ce;
	},
	req: (value) => api.ce('require', [value])
};
