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

const expressions = module.exports = {};

let callback = function (scope, node) {
	console.log(node.type);
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


/*
	Statements:
*/

expressions.ExpressionStatement = function (scope, node) {
	return {
		type: node.type,
		expression: resolveExpression.apply(this, _.extend(arguments, {1: node.expression}))
	};
};

expressions.EmptyStatement = ((scope, node) => ({}));

expressions.Program = expressions.BlockStatement = function (scope, node) {
	node.body = node.body.map(function (child) {
		child = resolveExpression(scope, child);
		return child;
	});

	return node;
};

expressions.VariableDeclaration = function (scope, node) {
	node.declarations = node.declarations.map(function (declaration) {
		let dec = resolveExpression(scope, declaration);
		return dec;
	});

	return node;
};

expressions.VariableDeclarator = function (scope, node) {
	node.id = resolveExpression(scope, node.id);
	node.init = resolveExpression(scope, node.init);

	node.id.value = node.init;

	return node;
};

expressions.AssignmentExpression = function (scope, node) {
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
};

expressions.NewExpression =
expressions.CallExpression = function (scope, node) {
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
};

var resolveRequire = function (scope, filePath) {
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

expressions.FunctionDeclaration = function (scope, node) {
	var neoNode = new NeoNode('Function', node);
	var bodyScope = scope.manager.acquire(node) || scope;
	bodyScope.manager = scope.manager;

	neoNode.name = addRelationship(bodyScope, neoNode, node, 'id', 'name');
	neoNode.params = node.params.map(function (param) {
		var neoParam = resolveExpression(bodyScope, param);
		bodyScope.set.get(param.name).neoNode = neoParam;
		utils.addRelationship(neoNode, neoParam, 'param');
		return neoParam;
	});
	neoNode.body = resolveExpression(bodyScope, node.body);
	utils.addRelationship(neoNode, neoNode.body, 'body');
	return neoNode;
};

expressions.FunctionExpression = function (scope, node) {
	var bodyScope = scope.manager.acquire(node) || scope;
	bodyScope.manager = scope.manager;

	let name = node.id ? resolveExpression(scope, node.id) : false;

	let params = node.params.map(function (param) {
		param = resolveExpression(scope, param); // bodyScope.set.get(param.name).value = ;
		bodyScope.set.set(param.name, param);
		return param;
	});

	let body = resolveExpression(bodyScope, node.body);

	return _.extend(bodyScope, node);
};

/* Control Flow Statements: */

expressions.IfStatement = ['test', 'consequent', 'alternate'];
expressions.ForStatement = ['test', 'init', 'update', 'body'];
expressions.ForInStatement = ['left', 'right', 'body'];
expressions.ForOfStatement = ['left', 'right', 'body'];
expressions.WhileStatement = ['test', 'body'];
expressions.DoWhileStatement = ['test', 'body'];

expressions.SwitchStatement = function (scope, node) {
	node.discriminant = resolveExpression(scope, node.discriminant);
	node.cases = node.cases.map(function (switchCase) {
		return resolveExpression(scope, switchCase);
	});
	return node;
};

expressions.SwitchCase = ['test', 'consequent'];
expressions.TryStatement = ['block', 'handler', 'finalizer'];
expressions.CatchClause = ['param', 'body'];

/*
	Expressions:
*/

expressions.ArrayExpression = function (scope, node) {
	node.elements = node.elements.map(function (element) {
		return resolveExpression(scope, element);
	});
	return node;
};

expressions.MemberExpression = function (scope, node) {
	let obj = resolveExpression(scope, node.object);
	node.object = obj.value || obj;
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
};

expressions.ObjectExpression = function (scope, node) {
	node.properties = node.properties.map(function (prop) {
		return resolveExpression(scope, prop);
	});
	return node;
};

expressions.Property = function (scope, node) {
	node.value = resolveExpression(scope, node.value);
	return node;
};

/* Fundemental expressions: */

expressions.Identifier = function (scope, node) {
	var resolved = scope.resolveVar(node.name);
	if (resolved) {
		return _.extend(resolved, node);
	}
	return node;
};

expressions.Literal = [];

/* Handles node based off of type.*/
const resolveExpression = expressions.resolveExpression = function (scope, node) {
	try {
		if (!node) {
			return;
		}

		if (expressions[node.type]) {
			let handler = expressions[node.type];
			if (typeof handler === 'function') {
				let expr = _.extend(expressions[node.type].apply(expressions, arguments), {line: utils.pos(node)});
				callback(scope, expr);
				return expr;
			}
			handler.forEach(function (n) {
				node[n] = resolveExpression(n);
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
