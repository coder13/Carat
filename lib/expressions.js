'use strict';

const _ = require('lodash');
const AST = require('./ast');
const chalk = require('chalk');
const config = require('getconfig');
const escope = require('escope');
const espree = require('espree');
const fs = require('fs');
const path = require('path');
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

let defaults = {};

let callback = function (scope, node) {
	// utils.log(node.type);
};

const resolveRequire = function (scope, filePath) {
	if ((filePath.indexOf('./') === 0 || filePath.indexOf('../') === 0) &&
		filePath.indexOf('.json') === -1 && !resolve.isCore(filePath)) {
		let file = utils.resolvePath(filePath, utils.dir(scope.manager.file));
		if (!file) {
			return false;
		}

		let ast = utils.parseFile(file);
		if (ast) {
			return expressions.traverse(ast, file, scope.options);
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
	ThisExpression: [],
	ExpressionStatement: function (scope, node) {
		node.expression = resolveExpression(scope, node.expression);
		return node;
	},
	VariableDeclaration: ['declarations'],
	VariableDeclarator: function (scope, node) {
		node.id = resolveExpression(scope, node.id) || node.id;
		node.init = resolveExpression(scope, node.init);

		node.id.value = node.init;

		if (node.init && node.init.type === 'ObjectExpression') {
			node.id.properties = node.init.properties;
		}

		return node;
	},

	AssignmentExpression: function (scope, node) {
		node.left = resolveExpression(scope, node.left);
		node.right = resolveExpression(scope, node.right);

		switch (node.left.type) {
		case 'Identifier':
		case 'Property':
			node.left.value = node.right;
			if (node.right.type === 'ObjectExpression') {
				node.left.properties = node.right.properties;
			}
			break;
		case 'MemberExpression':
			// if (scope.resolveVar(node.left.object.name)) {
			// 	console.log(node.left);
			// }
			break;
		}

		return node;
	},

	NewExpression: function (scope, node) {
		node = expressions.CallExpression(scope, node);
		node.type = 'NewExpression';
		return node;
	},

	CallExpression: function (scope, node) {
		node.callee = resolveExpression(scope, node.callee);

		node.arguments = node.arguments.map(function (arg) {
			return resolveExpression(scope, arg);
		});

		if (_.get(node.callee, 'name') === 'require' && _.get(node, 'arguments[0].value')) {
			var module = resolveRequire(scope, node.arguments[0].value);
			if (module) {
				let Exports = module.scopeManager.globalScope.resolveVar('exports').value;
				if (!Exports) {
					Exports = _.find(module.scopeManager.globalScope.resolveVar('module').value.properties, {key: AST.i('exports')});
					if (Exports) {
						return Exports;
					}
				}
			}
		}

		return node;
	},

	FunctionDeclaration: function (scope, node) {
		let bodyScope = (node instanceof escope.Scope ? node : scope.manager.acquire(node));
		bodyScope.manager = scope.manager;

		node.id = resolveExpression(scope, node.id);
		node.params = node.params.map(function (param) {
			param = resolveExpression(scope, param);
			bodyScope.set.set(param.name, param);
			return param;
		});
		node.body = resolveExpression(bodyScope, node.body);
		return node;
	},

	FunctionExpression: function (scope, node) {
		let bodyScope = (node instanceof escope.Scope ? node : scope.manager.acquire(node));
		bodyScope.manager = scope.manager;

		node.id = node.id ? resolveExpression(scope, node.id) : null;
		node.params = node.params.map(function (param) {
			param = resolveExpression(scope, param);
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

	ContinueStatement: ['label'],
	BreakStatement: ['label'],

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
		node.object = resolveExpression(scope, node.object);
		if (node.computed) {
			node.property = resolveExpression(scope, node.property);
		}

		let value = node.object.value || node.object;
		switch (value.type) {
		case 'ObjectExpression':
			if (!value.properties) {
				value.properties = [];
			}
			if (node.property.type === 'Identifier') {
				let prop = _.find(value.properties, {key: AST.i(node.property.name)});
				if (!prop) {
					prop = AST.prop(node.property.name, AST.i('undefined'));
					value.properties.push(prop);
				}
				return prop;
			} else if (node.property.type === 'Literal') {
				let prop = _.find(value.properties, {key: AST.l(node.property.value)});
				if (!prop) {
					prop = AST.prop(node.property.name, AST.i('undefined'));
					value.properties.push(prop);
				}
			}
			break;
		case 'ArrayExpression':
			if (node.property.type === 'Literal') {
				if (value.elements[node.property.value]) {
					return value.elements[node.property.value];
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
			return Object.assign(resolved, node);
		}
		return node;
	},

	Literal: []

};

/*
	Takes in code, outputs tree, calls cb for each node found and parsed;
	options - options for escope.
*/
const traverse = expressions.traverse = function (ast, file, options, cb) {
	callback = cb || callback;

	options = Object.assign({}, defaults, options);

	if (ast) {
		if (typeof ast !== 'object') {
			throw new Error('AST must be an object');
		}

		let scopeManager = escope.analyze(ast, options);

		scopeManager.options = options;
		scopeManager.file = file || options.file || 'anonymous';

		let scope = scopeManager.acquire(ast);
		scope.manager = scopeManager;

		let mod = new escope.Variable('module', scopeManager.globalScope);
		if (scopeManager.globalScope.resolveVar('exports')) {
			mod.value = scopeManager.globalScope.resolveVar('exports');
		} else {
			mod.value = AST.oe(AST.prop('exports', AST.oe([])));
		}
		scopeManager.globalScope.implicit.set.set('module', mod);

		return Object.assign(resolveExpression(scope, ast), {scopeManager: scope.manager});
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
			if (!node.loc) {
				node.loc = {};
			}
			node.loc.file = scope.manager.file;
			let handler = expressions[node.type];
			if (typeof handler === 'function') {
				let expr = expressions[node.type].call(expressions, scope, node);
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

		utils.error(new Error(chalk.red('Unsupported expression type: ') + node.type));
	} catch (e) {
		utils.error(`${chalk.red('Error when parsing line:')} ${chalk.grey(utils.pos(node))}`);
		utils.error(e.stack);
	}
};
