/* Overall Design Theory:
	- Parse code using Esprima
	- Handle Each statement at a time
	- Statments handle expressions and the two are sometimes similar.
	- Satements can also contain blocks of statements (I probably should explictly handle BlockStatements)
	- CallExpressions:
		- Are in the form a1.a2...(b1, b2...)
		- Exist as either a name and it's arguments and are either handled as such or it might return something (require)
		- Or the name references a function and that function should be ran using the given function's arguments as parameters.
	- Expressions:
		- All expressions will have a type, and source properities.
		- An Object's type will be 'Object' and it's value will be an object containing it's children.
			- If you want module.exports, you will do module.value.exports.
			- This way, an object can be parsed that has 'type' or 'source' as it's children

	- Reports:
		Defines a vulnerability as a source that ends up in a sink
		Has a source property containing the name of the source and its line number and file it was born
		Has a sink property contain the name of the sink and its line number and file it was executed.
		Also has a chain property which is a list of all the statements that affected it.
*/

'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const espree = require('espree');
const estraverse = require('estraverse');
const escope = require('escope');
const resolve = require('resolve');
const utils = require('./utils');

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

expressions.EmptyStatement = ((scope, node) => ({}));

expressions.Program = expressions.BlockStatement = function (scope, node) {
	let children = node.body.map(function (child) {
		child = resolveExpression(scope, child, true);
		return child;
	});

	return node;
};

expressions.VariableDeclaration = function (scope, node) {
	let declarations = node.declarations.map(function (declaration) {
		let dec = resolveExpression(scope, declaration);
		return dec;
	});

	return {
		type: node.type,
		declarations: declarations
	};
};

expressions.VariableDeclarator = function (scope, node) {
	let name = resolveExpression(scope, node.id, true);
	let init = undefined;

	if (node.init) {
		init = resolveExpression(scope, node.init, true);

		name.value = init;
	} else {
		init = undefined;
	}

	return {
		type: node.type,
		name: name,
		init: init
	};
};

expressions.AssignmentExpression = function (scope, node) {
	let left = resolveExpression(scope, node.left, true);
	let right = resolveExpression(scope, node.right, true);

	if (right.properties) {
		if (!left.properties) {
			left.properties = right.properties;
		} else {
			_.extend(neoNode.left.properties, neoNode.right.properties);
		}
	}

	return {
		left: left,
		right: right
	};
};

expressions.NewExpression =
expressions.CallExpression = function (scope, node, resolve) {
	// if (_.get(node.callee, 'name') === 'require' && _.get(node, 'arguments[0].value')) {
	// 	var module = resolveRequire(scope, neoNode, node.arguments[0].value);
	// 	if (module) {
	// 		return _.get(module.scopeManager.globalScope.implicit.set.get('module'), 'properties.exports');
	// 		return moduleExports;
	// 	}
	// }

	let callee = resolveExpression(scope, node.callee, resolve);

	let args = node.arguments.map(function (arg) {
		return resolveExpression(scope, arg, resolve);
	});

	return {
		type: node.type,
		callee: callee,
		arguments: args
	};
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

// expressions.FunctionDeclaration = function (scope, node) {
// 	var neoNode = new NeoNode('Function', node);
// 	var bodyScope = scope.manager.acquire(node) || scope;
// 	bodyScope.manager = scope.manager;

// 	neoNode.name = addRelationship(bodyScope, neoNode, node, 'id', 'name');
// 	neoNode.params = node.params.map(function (param) {
// 		var neoParam = resolveExpression(bodyScope, param);
// 		bodyScope.set.get(param.name).neoNode = neoParam;
// 		utils.addRelationship(neoNode, neoParam, 'param');
// 		return neoParam;
// 	});
// 	neoNode.body = resolveExpression(bodyScope, node.body);
// 	utils.addRelationship(neoNode, neoNode.body, 'body');
// 	return neoNode;
// };

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

	return Object.assign({
		type: 'Function',
		name: name,
		params: params,
		body: body
	}, bodyScope);
};

/* Control Flow Statements: */

/*
	Expressions:
*/


expressions.MemberExpression = function (scope, node, resolve) {
	let object = resolveExpression(scope, node.object, resolve);
	let property = resolveExpression(scope, node.property, resolve && node.computed);

	let raw = utils.resolveMemberExpression(node, resolve, true);

	// if (property.type === 'Identifier') {
	// 	if (!_.get(object.properties, node.property.name)) {
	// Does a.b not already exist? then we're accessing this for the first time. add b to a's properties and continue
	// 		_.set(object.properties, node.property.name);
	// 	} else { // a.b already exists. b points to what a.b was the first time- a member expression.
	// 		return _.get(object.properties, node.property.name);
	// 	}
	// } else if (property.type === 'Identifier') {
	// 	// todo?
	// }

	return {
		type: node.type,
		object: object.value || object,
		property: property,
		computed: node.computed,
		raw: raw
	};
};

/* Fundemental expressions: */

expressions.Identifier = function (scope, node, resolve) {
	if (resolve) {
		var resolved = resolveVar(scope, node.name);
		if (resolved) {
			return _.extend(resolved, node);
		}
	}

	return {
		type: node.type,
		name: node.name
	};
};

expressions.Literal = function (scope, node) {
	return {
		type: node.type,
		value: node.value
	};
};

//  Resolve the variable. Traverse up scope untill it finds a variable;
const resolveVar = function (scope, name) {
	if (scope.set.has(name)) {
		return scope.set.get(name);
	} else if (scope.implicit && scope.implicit.set.has(name)) {
		return scope.implicit.set.get(name);
	} else if (scope.upper) {
		return resolveVar(scope.upper, name);
	}
	return false;
};

/* Handles node based off of type.*/
const resolveExpression = expressions.resolveExpression = function (scope, node) {
	if (!node) {
		return;
	}

	if (node.type === 'ExpressionStatement') {
		arguments[1] = node = node.expression;
	}

	if (expressions[node.type]) {
		let expr = _.extend(expressions[node.type].apply(expressions, arguments), {line: utils.pos(node)});
		callback(scope, expr);
		return expr;
	}
	// console.error(new Error('Unsupported expression type: ' + node.type));
	// throw new Error('Unsupported expression type: ' + node.type);
};
