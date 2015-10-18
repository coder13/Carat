'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const espree = require('espree');
const escope = require('escope');
const resolve = require('resolve');
const utils = require('./utils');

//  Resolve the variable. Traverse up scope untill it finds a variable;
escope.Scope.prototype.resolveVar = function (name) {
	if (this.set.has(name)) {
		return this.set.get(name);
	} else if (this.implicit && this.implicit.set.has(name)) {
		return this.implicit.set.get(name);
	} else if (this.upper) {
		return this.upper.resolveVar(name);
	}
	return false;
};

//	So as to not be parsing the same file twice. We want to parse once,
//	possibly traverse with different arguments multiple times.
const lookupTable = {};


let callback = function (scope, node) {
	console.log(node.type);
};

const resolveRequire = function (scope, filePath) {
	if ((filePath.indexOf('./') === 0 || filePath.indexOf('../') === 0) &&
		filePath.indexOf('.json') === -1 && !resolveModule.isCore(filePath)) {
		var file = utils.resolvePath(filePath, utils.dir(scope.manager.file));
		if (!file) {
			return false;
		}

		var ast = utils.parseFile(file);
		if (ast) {
			var module = expressions.traverse(ast, file);
			return module;
		}
	}
};

/*
	Statements:
*/

const expressions = module.exports = {
	Program: ['body'],
	BlockStatement: ['body'],
	EmptyStatement: [],
	ExpressionStatement: function (scope, node) {
		node.expression = resolveExpression(scope, node.expression);
		return node;
	},
	VariableDeclaration: ['declarations'],
	VariableDeclarator: function (scope, node) {
		node.id = resolveExpression(scope, node.id);
		node.init = resolveExpression(scope, node.init);

		node.id.value = node.init;

		return node;
	},

	AssignmentExpression: function (scope, node) {
		node.left = resolveExpression(scope, node.left);
		node.right = resolveExpression(scope, node.right);

		// if (right.properties) {
		// 	if (!left.properties) {
		// 		left.properties = right.properties;
		// 	} else {
		// 		// _.extend(node.left.properties, node.right.properties);
		// 	}
		// }

		return node;
	},

	NewExpression: function (scope, node) {
		// if (_.get(node.callee, 'name') === 'require' && _.get(node, 'arguments[0].value')) {
		// 	var module = resolveRequire(scope, neoNode, node.arguments[0].value);
		// 	if (module) {
		// 		return _.get(module.scopeManager.globalScope.implicit.set.get('module'), 'properties.exports');
		// 		return moduleExports;
		// 	}
		// }

		node.callee = resolveExpression(scope, node.callee);

		node.arguments = node.arguments.map(function (arg) {
			return resolveExpression(scope, arg);
		});

		return node;
	},

	CallExpression: function (scope, node) {
		// if (_.get(node.callee, 'name') === 'require' && _.get(node, 'arguments[0].value')) {
		// 	var module = resolveRequire(scope, neoNode, node.arguments[0].value);
		// 	if (module) {
		// 		return _.get(module.scopeManager.globalScope.implicit.set.get('module'), 'properties.exports');
		// 		return moduleExports;
		// 	}
		// }

		node.callee = resolveExpression(scope, node.callee);

		node.arguments = node.arguments.map(function (arg) {
			return resolveExpression(scope, arg);
		});

		return node;
	},

	FunctionDeclaration: function (scope, node) {
		var bodyScope = scope.manager.acquire(node);
		bodyScope.manager = scope.manager;

		node.id = resolveExpression(scope, node.id);
		node.params = node.params.map(function (param) {
			var neoParam = resolveExpression(bodyScope, param);
			bodyScope.set.get(param.name).node = neoParam;
			utils.addRelationship(node, neoParam, 'param');
			return neoParam;
		});
		node.body = resolveExpression(bodyScope, node.body);
		return node;
	},

	FunctionExpression: function (scope, node) {
		var bodyScope = scope.manager.acquire(node);
		bodyScope.manager = scope.manager;

		node.id = node.id ? resolveExpression(scope, node.id) : null;
		node.params = node.params.map(function (param) {
			param = resolveExpression(scope, param); // bodyScope.set.get(param.name).value = ;
			bodyScope.set.set(param.name, param);
			return param;
		});

		node.body = resolveExpression(bodyScope, node.body);

		return _.extend(bodyScope, node);
	},

	/* Control Flow Statements: */

	IfStatement: ['test', 'consequent', 'alternate'],
	ForStatement: ['test', 'init', 'update', 'body'],
	ForInStatement: ['left', 'right', 'body'],
	ForOfStatement: ['left', 'right', 'body'],
	WhileStatement: ['test', 'body'],
	DoWhileStatement: ['test', 'body'],

	SwitchStatement: ['discriminant', 'cases'],

	SwitchCase: ['test', 'consequent'],
	TryStatement: ['block', 'handler', 'finalizer'],
	CatchClause: ['param', 'body'],

	/*
		Expressions:
	*/

	ArrayExpression: ['elements'],
	SequenceExpression: ['expressions'],

	MemberExpression: function (scope, node) {
		let obj = resolveExpression(scope, node.object);
		node.object = obj;
		node.property = resolveExpression(scope, node.property);

		if (node.property.type === 'Literal') {
			if (node.object.type === 'ArrayExpression') {
				if (node.object.elements[node.property.value]) {
					return node.object.elements[node.property.value];
				}
			}
		}

		node.name = utils.generate(node);

		return node;
	},

	ObjectExpression: ['properties'],
	Property: ['value'],

	ReturnStatement: ['argument'],
	ThrowStatement: ['argument'],
	UnaryExpression:['argument'],
	UpdateExpression: ['argument'],

	/*  Binary  */

	BinaryExpression: ['left', 'right'],
	LogicalExpression: ['left', 'right'],
	ConditionalExpression: ['consequent', 'alternate'],

	/* Fundemental expressions */

	Identifier: function (scope, node) {
		var resolved = scope.resolveVar(node.name);
		if (resolved) {
			return _.extend(resolved, node);
		}
		return node;
	},

	Literal: []

};

/*
	Takes in code, outputs tree, calls cb for each node found and parsed;
*/
const traverse = expressions.traverse = function (options, ast, cb) {
	callback = cb;

	if (ast) {
		if (typeof ast !== 'object') {
			throw new Error('AST must be an object');
		}

		let scopeManager = escope.analyze(ast, options);
		scopeManager.globalScope.implicit.set.set('module', new escope.Variable('module', scopeManager.globalScope));
		scopeManager.file = options.file || 'anonymous';
		let scope = scopeManager.acquire(ast);
		scope.manager = scopeManager;
		return _.extend(resolveExpression(scope, ast), {scopeManager: scope.manager});
	}
	return false;
};

/* Handles node based off of type.*/
const resolveExpression = expressions.resolveExpression = function (scope, node) {
	try {
		if (!node) {
			return;
		}

		if (expressions[node.type]) {
			let handler = expressions[node.type];
			if (typeof handler === 'function') {
				let expr = expressions[node.type].apply(expressions, arguments);
				callback(scope, expr);
				return expr;
			}
			handler.forEach(function (child) {
				if (Array.isArray(node[child])) {
					node[child] = node[child].map(function (i) {
						return resolveExpression(scope, i);
					});
				} else {
					node[child] = resolveExpression(scope, node[child]);
				}
			});
			return node;
		}
		console.error(new Error('Unsupported expression type: ' + node.type));
		// throw new Error('Unsupported expression type: ' + node.type);
	} catch (e) {
		console.error('Error when parsing line', utils.pos(node), 'in file', scope.manager.file);
		console.error(e.stack);
	}
};
