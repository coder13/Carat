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

var chalk = require('chalk'),
	_ = require('underscore'),
	fs = require('fs'),
	path = require('path'),
	esprima = require('esprima'),
	resolve = require('resolve');

var Flags = {
	recursive: false,
	debug: true,
	verbose: false
};

var Sources = ['^process.argv.*$']; // default list of sources
var Sinks = ['^eval$'];			// default list of sinks

// So as to not be parsing the same file twice. We want to parse once,
// possibly traverse with different argumements multiple times.
var lookupTable = {};

// require('hapi').Server(asd, asjdk, asd).route

// List of CallExpressions that have evil callbacks.
// cbParam is where the callback is and sourceParam is the argument in the callback that is the source
var callbacks = [
	{	name: "^require\('fs'\).readFile$",
		handler: {cbParam: 2, sourceParam: 1}
	},
	{	// (nequire('hapi').server()).route()
		name: "^require\\('hapi'\\).Server\\(.*?\\).route$",
		handler: function (node, ce) {
			var func;
			
			if (ce.arguments[0].type == 'Object') {
				if (ce.arguments[0].props.config && ce.arguments[0].props.config.props.handler) {
					func = ce.arguments[0].props.config.props.handler;
				} else {
					func = ce.arguments[0].props.handler;
				}
			}

			if (!func || !func.type == 'Function' || !func.params)
				return;

			var params = _.map(func.params, function (i) {
				return {
					type: 'Identifier',
					value: i,
					source: false
				};
			});
			
			params[0].source = true;
			log.call(func.scope, 'SOURCE', node, func.params[0]);
			func.scope.report('SOURCE', node, func.params[0]);

			func.traverse(params);
		}
	},
	{	name: "^require\\('express'\\).createServer\\(.*?\\).post$",
		handler: {cbParam: 1, sourceParam: 0}
	},
	{	name: "^require\\('express'\\).createServer\\(.*?\\).get$",
		handler: {cbParam: 1, sourceParam: 0}
	}
];

// Custom functions that handle call expressions that return expressions.
var custom = [
	{	name: "^require$",
		handler: function (node, ce) {
			if (!ce.arguments || !ce.arguments[0])
				return;

			// Get file
			var file;
			var scope = this;

			if (node.arguments[0].type == 'Literal') {
				file = node.arguments[0].value;
			} else if (node.arguments[0].type == 'Identifier') {
				file = this.resolve(node.arguments[0].name).value;
				if (typeof file != 'string')
					return;
			} else {
				return;
			}

			if (file.match('.*.json')) {
				var rtrn;
				this.resolvePath(file, function (json) {
					json = require(json);

					// Takes raw json and converts it to an object to be stored in a scope.vars
					var resolveJSON = function (j) {
						var newJson = {};
						for (var i in j) {
							newJson[i] = {
								props: typeof j[i] == 'object' ? resolveJSON(j[i]) : j[i]
							};
						}
						return newJson;
					};
					rtrn = resolveJSON(json);

				});
				return rtrn;
			}

			if (!Flags.recursive)
				return;

			if ([
				'hapi',		// Doesn't matter if we traverse, has pre-written handlers
				'express',	// ^^
				'jade',		// TODO: Fix;
				'request'	// TODO: Fix; Has a recursive function and program won't quit.
				].indexOf(file) != -1 || file.indexOf('hapi') != -1)
				return; // Ignore these modules; they have pre-written handlers.

			var r;
			this.resolvePath(file, function (pkg) {
				if (!pkg)
					return;

				// Lookup table is a list of files already looked at.
				// In static analysis, we only want to look at each file once.
				if (lookupTable[pkg])
					return;
				lookupTable[pkg] = true;
				var code = fs.readFileSync(pkg);
				if (!code)
					return false;

				var ast = esprima.parse(String(code), {loc: true});
				if (!ast)
					return;

				if (Flags.verbose && !Flags.json)
					console.log(chalk.yellow(' ---- '), pkg);

				var newScope = new Scope({
					file: pkg,
				});

				newScope.traverse(ast);

				if (newScope.vars.module && newScope.vars.module.props.exports.props) {
					r = newScope.vars.module.props.exports;

					if (Flags.json) {
						scope.reports.push(newScope.reports);
					}

				}

			});

			return r;
		}
	}
];

var Scope = function(parent) {
	parent = parent || {};

	this.depth = parent.depth ? parent.depth + 1 : 1;

	if (!parent.file)
		throw new Error("parent.file isn't defined");
	this.file = parent.file || '';
	if (!Scope.baseFile)
		Scope.baseFile = parent.file;

	// Not used here, want to keep code though.
	// this.file = Scope.baseFile ? path.relative(Scope.baseFile.split('/').reverse().slice(1).reverse().join('/'), this.file):'';
	this.file = parent.file;

	// Declare initial variables.
	this.vars = parent.vars || {};
	if (!this.vars.module) this.vars.module = {type: 'Object', props: {exports: {type: 'Object', props: {}}}};
	if (!this.vars.exports) this.vars.exports = this.vars.module.props.exports;
	if (!this.vars.global) this.vars.global = {type: 'Object', props: {}};
	this.vars.this = {type: 'Object', props: this.vars, source: false};

	this.funcLookupTable = {};

	this.reports = [];
	if (parent.reports) {
		parent.reports.forEach(function (i) {
			this.reports.push(i);
		});
	}

	var scope = this;

	this.resolveExpression = {
	};

	this.resolveExpression['Literal'] = function (right) {
		return {
			type: right.type,
			value: typeof right.value == 'string' ?
				"'" + right.value + "'" : right.value
		};
	};

	this.resolveExpression['Identifier'] = function (right, resolve) {
		resolve = (resolve == undefined ? true : false); // default is to not resolve
		var resolved = scope.resolve(right.name);

		// resolve right if resolved is undefined or is exactly right.name (implying that right doesn't exist in vars)
		// resolve is false (meaning we don't want the resolved value)
		if ((!resolved || resolved.value == right.name) || !resolve) {
			var isSource = false;

			_.each(Sources, function (i) {
				if (right.name.search(i) == 0) {
					isSource = true;
					return true;
				}
			});

			if (isSource) {
				scope.report('SOURCE', right, right.name);
			}

			return {
				type: right.type,
				value: right.name,
				source: isSource
			};
		} else {
			return resolved;
		}
	};

	this.resolveExpression['MemberExpression'] = function (right, resolve) {
		resolve = (resolve == undefined ? true : false);
		var me = scope.resolveMemberExpression(right);
		me.type = right.type;
		var resolved = scope.resolve(me.value);

		// resolve right if resolved is undefined or is exactly right.name (implying that right doesn't exist in vars)
		// resolve is false (meaning we don't want the resolved value)
		if (!resolved || !resolve) {
			if (!me.source) {
				// Determines if a source.
				// todo: make better. Awful hack for now
				_.each(Sources, function (i) {
					var split = splitME(me.value)[0];
					if (me.value.search(i) == 0 || (scope.vars[split] && scope.vars[split].source)) {
						me.source = true;
						return true;
					}
				});
			}

			return me;
		} else {
			return resolved;
		}
	};

	this.resolveExpression['ThisExpression'] = function (right) {
		return {
			type: 'Identifier',
			value: 'this',
			source: false
		};
	};

	this.resolveExpression['ArrayExpression'] = function (right) {
		var elements = right.elements;
		elements = _.map(right.elements, function (i) {
			var expr = scope.resolveExpression[i.type](i);
			if (expr.source) {
				scope.report('SOURCE', right, expr.value);
			}
			return expr;
		});

		return {
			type: 'Array',
			value: elements,
		};
	};

	this.resolveExpression['UnaryExpression'] = function (right) {
		return scope.resolveExpression[right.argument.type](right.argument);
	};

	this.resolveExpression['UpdateExpression'] = function (right) {
		return scope.resolveExpression[right.argument.type](right.argument);
	};

	this.resolveExpression['ConditionalExpression'] = function (right) {
		var ce = {
			type: 'ConditionalExpression',
			test: scope.resolveExpression[right.test.type](right.test)
		};
		if (right.consequent) {
			ce.consequent = scope.resolveExpression[right.consequent.type](right.consequent);
		} if (right.alternate) {
			ce.alternate = scope.resolveExpression[right.alternate.type](right.alternate);
		}
		return ce;
	};

	this.resolveExpression['LogicalExpression'] =
	this.resolveExpression['BinaryExpression'] = function (right) {
		var be = {
			type: 'BinaryExpression',
			op: right.operator,
			source: false
		};
		if (right.left)
			be.left = scope.resolveExpression[right.left.type](right.left);

		if (right.right)
			be.right = scope.resolveExpression[right.right.type](right.right);

		return be;
	};

	this.resolveExpression['ObjectExpression'] = function (right) {
		var obj = {};
		right.properties.forEach(function(i) {
			var expr = scope.resolveExpression[i.value.type](i.value);
			if (expr.source) {
				scope.report('SOURCE', right, expr.value);
			}
			obj[i.key.name] = expr;

		});
		return {
			type: 'Object',
			props: obj
		};
	};

	this.resolveExpression['NewExpression'] =
	this.resolveExpression['CallExpression'] = function (right, sinkCB) {
		var ce = scope.resolveCallExpression(right),
			isSink = false;

		// Handles the callee. If it's a function, traverse the function with the given parameters
		// If it's simply the name of a function, handle it normally.
		if (ce.callee.type == 'Function') {
			ce.callee.traverse(ce.arguments);
			return {
				type: right.type,
				value: ce,
				sink: isSink,
			};
		} else if (ce.callee.type == 'Identifier' || ce.callee.type == 'MemberExpression') {
			var resolved = scope.resolve(ce.callee.value);
			if (resolved) {
				ce.raw = ce.raw.replace(ce.callee.value, resolved.value);
				ce.callee = resolved;
			}
			if (ce.callee.type == 'Function') {
				ce.callee.traverse(ce.arguments);
				return {
					type: right.type,
					value: ce,
					sink: isSink,
				};
			} else if (ce.callee.type == 'Identifier' || ce.callee.type == 'MemberExpression') {
				// Determines if ce is a sink.
				for (var i in Sinks) {
					if (ce.callee.value.search(Sinks[i]) == 0) {
						isSink = true;
						// If sinkCB is defined, this call expression is inside of a function.
						// We want the function to know that there is a sink inside of it
						// and to have it mark itself as a sink.
						if (sinkCB)
							sinkCB(ce.callee.value);
					}
				}

				log.call(scope, isSink ? 'SINK' : 'CE', right, ce.callee, {type: 'arguments', value: _.map(ce.arguments, stringifyArg).join(', ')});

				// Custom handler for functions such as require
				var rtrn;
				_.some(custom, function (i) {
					if (ce.callee.value.match(i.name)) {
						rtrn = i.handler.call(scope, right, ce);
						return true;
					}
				});
				if (rtrn)
					return rtrn;
			}
		}

		if (isSink) {
			// Handles simple callbacks containing parameters that are sources
			_.some(callbacks, function (callback) {
				if (ce.callee.value.search(callback.name) != 0)
					return false;

				if (typeof callback.handler == 'object') {
					var func = ce.arguments[callback.handler.cbParam];
					if (!func)
						return false;

					if (func.type == 'Identifier' || func.type == 'MemberExpression') {
						var resolved = scope.resolve(func.value);
						if (resolved) {
							func = resolved;
						}
					}



					// generate a list of default arguments for the parameters.
					// TODO: abstract this into a convienence function
					var params = _.map(func.params, function (p) {
						return {
							type: 'Identifier',
							value: p,
							source: false
						};
					});

					if (params[callback.handler.sourceParam]) {
						// Mark the bad param as the source
						params[callback.handler.sourceParam].source = true;
						func.scope.report('SOURCE', right, params[callback.handler.sourceParam].value);
					}

					if (func.type == 'Function')
						func.traverse.call(func, params);

					return true;
				} else if (typeof callback.handler == 'function') {
					callback.handler.call(scope, right, ce);
					return true;
				}

			});

			if (ce.arguments && ce.arguments.length != 0) {
				// For each argument of the function, if it is a Source and ce is a Sink, report the sink.
				ce.arguments.forEach(function handleArg(arg) {
					if (arg.type == 'BinaryExpression' || arg.type == 'ConditionalExpression') {
						handleArg(arg.left);
						handleArg(arg.right);
					}

					if (arg.type != 'Identifier' && arg.type != 'MemberExpression')
						return;
					
					var resolvedArg = scope.resolve(arg.value);
					if (resolvedArg && arg.value != resolvedArg.value) {
						handleArg(scope.resolve(arg.value));
					}

					if (arg.source) {
						scope.report('SOURCE', right, arg.value);

						scope.report('SINK', right, arg.value, ce.callee.value);
					}

				});
			}
		}


		return {
			type: right.type,
			value: ce,
			sink: isSink,
		};
	};

	this.resolveExpression['FunctionExpression'] = function (right) {
		var func = scope.resolveFunctionExpression(right);

		func.isSink = false;

		func.traverse(_.map(func.params, function (i) {
			return {
				type: 'Identifier',
				value: i,
				source: false
			};
		}));

		func.type = 'Function';

		return func;
	};

	this.resolveExpression['AssignmentExpression'] = function (right) {
		var assign = scope.resolveAssignment(right);
		assign.names.forEach(function (name) {
			// Block of code that creates a property if it doesn't exist
			// and in the end, sets the name to the value.
			if (name.type == 'Identifier') {
				scope.vars[name.value] = assign.value;
			} else if (name.type == 'MemberExpression') {
				var splitName = splitME(name.value || name);
				var n = scope.vars[splitName[0]];
				if (!n) {
					scope.vars[splitName[0]] = n = {
						type: 'Object',
						props: {},
						source: false
					};
				}

				for (var i = 1; i < splitName.length - 1; i++) {
					if (!n.props)
						n.props = {};

					if (!n.props[splitName[i]]) {
						n.props[splitName[i]] = {
							type: 'Object',
							props: {},
							source: false
						};
					}

					n = n.props[splitName[i]];
				} // Do this for all except for the last

				if (!n.props)
					n.props = {};
				n.props[splitName[i]] = assign.value; // Now assign the last to the value.
			}
			log.call(scope, 'ASSIGN', right, name, assign.value);
		});
		return assign.value;
	};


	this.resolveStatement = {
		DebuggerStatement: function () {},	// undefined, does nothing normally.
		ContinueStatement: function () {}, 	// undefined, serves no purpose in static anaylsis.
		BreakStatement: function() {},		// ^^
		EmptyStatement: function() {},		// ^^
		Literal: function () {},			// Example: 'use strict';
		MemberExpression: function () {}	// Standalone MemberExpressions; Does nothing.
	};

	this.resolveStatement['VariableDeclaration'] = function (node) {
		node.declarations.forEach(function (variable) {
			var name = variable.id.name;
			scope.vars[name] = {};

			if (!variable.init || !scope.resolveExpression[variable.init.type])
				return;

			var value = scope.resolveExpression[variable.init.type](variable.init);

			if (!value)
				scope.vars[name] = {
					type: 'Undefined',
					value: undefined,
					source: false
				};
			else
				scope.vars[name] = value;

			// Handles reports
			if (!Flags.verbose && value.source) {
				scope.report('SOURCE', node, value);
			}

			log.call(scope, value.source ? 'SOURCE' : 'VAR', variable, name, value);

		});
	};

	this.resolveStatement['SequenceExpression'] = function (node) {
		node.expressions.forEach(function (expr) {
			scope.resolveStatement[expr.type](expr);
		});
	};

	this.resolveStatement['LogicalExpression'] = scope.resolveExpression['LogicalExpression'];

	this.resolveStatement['UpdateExpression'] =
	this.resolveStatement['UnaryExpression'] = this.resolveExpression['UpdateExpression'];

	this.resolveStatement['NewExpression'] =
	this.resolveStatement['CallExpression'] = scope.resolveExpression['CallExpression'];

	this.resolveStatement['AssignmentExpression'] = this.resolveExpression['AssignmentExpression'];

	this.resolveStatement['FunctionDeclaration'] = function(node) {
		var fe = scope.resolveExpression['FunctionExpression'](node);

		scope.vars[fe.name] = fe;
		log.call(scope, 'FUNC', node, fe.name, {type: 'params', value: fe.params});
	};

	this.resolveStatement['IfStatement'] = function (node) {
		scope.resolveExpression[node.test.type](node.test);
		if (node.consequent)
			scope.traverse(node.consequent.body || [node.consequent]);
		if (node.alternate)
			scope.traverse(node.alternate.body);
	};

	this.resolveStatement['DoWhileStatement'] =
	this.resolveStatement['WhileStatement'] = function (node) {
		var test;
		if (node.test)
			test = scope.resolveExpression[node.test.type](node.test);
		scope.traverse(node.body);
		log.call(scope, 'WHILE', node, node.test ? test : '');
	};


	this.resolveStatement['ForInStatement'] = function (node) {
		// console.log(node);
	};

	this.resolveStatement['ForStatement'] = function (node) {
		if (node.init) {
			(scope.resolveStatement[node.init.type] ||
			scope.resolveExpression[node.init.type])(node.init);
		} if (node.test) {
			scope.resolveExpression[node.test.type](node.test);
		} if (node.update) {
			scope.resolveExpression[node.update.type](node.update);
		}
		if (node.body)
			scope.traverse(node.body);
	};

	this.resolveStatement['ThrowStatement'] = function (node) {
		scope.resolveExpression[node.argument.type](node.argument);
	};

	this.resolveStatement['TryStatement'] = function (node) {
		scope.traverse(node.block);
		node.handlers.forEach(function (handler) { // array of catch clauses
			scope.resolveStatement[handler.type](handler);
		});
	};

	this.resolveStatement['CatchClause'] = function (node) {
		var catchScope = new Scope(scope);
		if (node.param)
			catchScope.vars['e'] = {type: 'Error', value: '[Error]'};
		catchScope.traverse(node.body);
	};

	this.resolveStatement['SwitchStatement'] = function (node) {
		node.cases.forEach(function (switchCase) {
			scope.resolveStatement[switchCase.type](switchCase);
		});
	};

	this.resolveStatement['SwitchCase'] = function (node) {
		if (node.test) // example: default statement doesn't have a test
			scope.resolveExpression[node.test.type](node.test);
		scope.traverse(node.consequent);
	};


	this.resolveStatement['ReturnStatement'] = function (node, sourcCB) {
		if (!node.argument)
			return;

		var arg = scope.resolveExpression[node.argument.type](node.argument);
		if (arg.source && sourcCB) {
			sourcCB(arg.source);
		}

		log.call(scope, 'RETURN', node, '', arg);
	};

};

Scope.prototype.report = function (type, node, source, name) {
	var scope = this;

	if (Flags.debug)
		console.log(chalk.red(type), chalk.grey(this.pos(node)), chalk.blue(source.value || source), name || '\t', scope.reports.length != 0 ? scope.reports : 'N/A');
	switch (type) {
		case 'SOURCE':
			var report = find(scope.reports, source);
			var p = path.relative(Scope.baseFile.split('/').reverse().slice(1).reverse().join('/'), this.file) + ':' + pos(node);

			if (!report){
				scope.reports.push({
					source: {
						name: source,
						line: p
					}
				});
				return true;
			}
			return false;
		case 'SINK':
			report = find(scope.reports, source);

			if (report) {
				var p = path.relative(Scope.baseFile.split('/').reverse().slice(1).reverse().join('/'), scope.file) + ':' + pos(node);
				report.sink = {
					name: name,
					line: p
				};

				// Flush the report. After finding the sink, we don't want to track it anymore.
				scope.reports.splice(scope.reports.indexOf(report), 1);
				scope.onReport(report);
			}

			return false;
	}
};

Scope.prototype.onReport = function () {};

// Takes in any name and returns the value if the name is in scope.vars.
// Returns false if there is no variable with the name.
Scope.prototype.resolve = function(name) {
	var scope = this,
		split = splitME(name), // should ignore dots inside parenthesis
		rtrn = false;

	_.some(this.vars, function (value, key) {
		if (key == name) {
			rtrn = value;
			return true;
		} else if (name != split) { // meaning it contains dots
			if (key === split[0]) {
				var v = scope.resolve(split[0]);
				if (!v || !v.type == 'Undefined') {
					rtrn = false;
					return true;
				}
				rtrn = {
					type: 'MemberExpression',
					value: name,
					source: v.source,
				};

				if (v.type == 'Object') {
					for (var i = 1; i < split.length; i++) {
						if (!v.props || !v.props[split[i]]) {
							rtrn = false;
							return true;
						}
						v = v.props[split[i]];
					}
					rtrn = v;
				} else if (v.type == 'MemberExpression') {
					rtrn.value = name.replace(key, v.value);
				} else if (v.type == 'CallExpression' || v.type == 'NewExpression') {
					rtrn.value = name.replace(key, v.value.raw || v.value.callee.value || v.value.callee);
				}
				return true;
			} // todo: else
		}

	});
	return rtrn;
};

// Takes in ast and returns a string.
Scope.prototype.resolveMemberExpression = function(node) {
	var isSource = false;
	var obj = this.resolveExpression[node.object.type](node.object, false);

	isSource = obj.source;
	obj = obj.value || obj;
	obj = obj.raw || obj.callee || obj.name || obj;

	var prop = this.resolveExpression[node.property.type](node.property, false);
	isSource = isSource || prop.source;

	prop = prop.value || prop;
	prop = prop.raw || prop.callee || prop.name || prop;

	return {
		value: obj + (node.computed ? '[' + prop + ']' : '.' + prop),
		source: isSource
	};
};

Scope.prototype.resolveCallExpression = function (node) {
	var scope = this;
	var ce = {};

	if (node.arguments && node.arguments.length > 0){
		ce.arguments = _.map(node.arguments, function (right) {
			right = scope.resolveExpression[right.type](right, false);
			return right;
		});
	}

	if (node.callee.type == 'FunctionExpression') {
		ce.callee = this.resolveExpression['FunctionExpression'](node.callee);
	} else {
		ce.callee = this.resolveExpression[node.callee.type](node.callee, true);
	}

	ce.raw = (ce.callee.value||ce.callee.name) + '(' + (ce.arguments ? _.map(ce.arguments, function (i) {
		if (i)
			return i.value || i.raw || i;
	}).join(', ') : '') + ')';

	return ce;
};

Scope.prototype.resolveFunctionExpression = function(node) {
	var fe = {
		type: node.type,
		name: node.id ? node.id.name : '',
		params: _.pluck(node.params, 'name'),
		body: node.body.body || node.body,
		props: {
			'prototype': {
				type: 'Object',
				props: {}, source:
				false
			}
		},
		raw: 'Function',
		sink: false
	};
	var parentScope = this;
	fe.scope = new Scope(this);

	fe.traverse = function(_params) {
		var scope = this.scope;
		if (!node || node.body.length <= 0)
			return;

		if (_params) {
			for (var i = 0; i < _params.length; i++) {
				scope.vars[this.params[i]] = _params[i];
			}
		}

		// TODO: REWORK
		// var raw = fe.name||'Function' + '(' + _.map(_params, stringifyArg).join(',') + ')';
		// if (scope.funcLookupTable[raw])
		// 	return;
		// else
		// 	scope.funcLookupTable[raw] = true;

		// Look at function declarations first. Different from assigning a variable to a function.
		// Create temp variable because we could run this function multiple times
		var newBody = _.reject(this.body, function (node) {
			if (node.type == 'FunctionDeclaration') {
				func = scope.resolveStatement['FunctionDeclaration'](node);
				return true;
			}
		});

		newBody.forEach(function(node) {
			if (node.type == 'ExpressionStatement')
				node = node.expression;

			try {
				if (node.type == 'CallExpression') {
					scope.resolveStatement['CallExpression'](node, function () {
						this.sink = true;
					});
				} else if (node.type == 'ReturnStatement') {
					scope.resolveStatement['ReturnStatement'](node, function () {

					});
				} else if (scope.resolveStatement[node.type]) {
					scope.resolveStatement[node.type](node);
				} else if (Flags.debug) {
					throw new Error('-undefined statement: ' + node.type);
				}
			} catch (e) {
				if (Flags.debug) {
					console.error(chalk.bold.red('Error reading line:'), scope.file + ':' + pos(node));
					console.error(e.stack || e);
				}
			}
		});

	};


	return fe;
};

Scope.prototype.resolveAssignment = function(node) {
	var scope = this;

	if (node.right.type == 'AssignmentExpression') {
		var assign = scope.resolveAssignment(node.right);
		return {
			names: assign.names.concat(scope.resolveExpression[node.left.type](node.left, false)),
			value: assign.value
		};

	} else {
		return {
			names: [scope.resolveExpression[node.left.type](node.left, false)],
			value: scope.resolveExpression[node.right.type](node.right)
		};
	}
};

Scope.prototype.resolvePath = function(file, cb) {
	var pkg;
	
	try {
		pkg = resolve.sync(file, {basedir: String(this.file).split('/').slice(0, -1).join('/')});
	} catch (e) {
		console.error(chalk.red('Could not find ' + file));
		return false;
	}

	if (file == pkg)
		return false;
	else if (pkg)
		return cb(pkg);
};

// Convienence function to return the file and line number of the given node
// in the format: file:line
Scope.prototype.pos = function(node) {
	return (Scope.baseFile ? path.relative(Scope.baseFile.split('/').reverse().slice(1).reverse().join('/'), this.file) : '') + ':' + pos(node);
};

Scope.prototype.traverse = function(body) {
	if (!body)
		return;
	var scope = this;

	body = body.body || body;

	// Traverse the function declarations first and get rid of them.
	// These get priority when scanning and we also don't want to scan them twice.
	body = _.reject(body, function (node) {
		if (node.type == 'FunctionDeclaration') {
			scope.resolveStatement['FunctionDeclaration'](node); //todo
			return true;
		}
	});

	body.forEach(function(node) {
		// ExpressionStatements simply wrap other statements.
		// We don't want expression statements, we want the expressions they wrap
		if (node.type == 'ExpressionStatement')
			node = node.expression;

		try {
			if (!node.type)
				return;
			if (scope.resolveStatement[node.type]) {
				scope.resolveStatement[node.type](node);
			} else {
				if (Flags.debug)
					throw new Error('Undefined Statement: ' + node.type);
			}
		} catch (e) {
			if (Flags.debug && e.stack) {
				console.error(chalk.bold.red('Error reading line:'), scope.pos(node));
				console.error(e.stack);
			}
		}
	});
};

module.exports = function (flags, options) {
	Flags.recursive = (flags.recursive == undefined ? Flags : flags).recursive;
	Flags.debug = (flags.debug == undefined ? Flags : flags).debug;
	Flags.verbose = (flags.verbose == undefined ? Flags : flags).verbose;

	if (options) {
		if (options.Sinks != undefined) {
			Sinks = options.Sinks;
		}

		if (options.Sources != undefined) {
			Sources = options.Sources;
		}
	}

	return Scope;
};

/*
		Convience functions
*/

var cs = { // colors
	'CE': chalk.green,
	'SCE': chalk.red,
	'SINK': chalk.red,
	'SOURCE': chalk.red,
	'RETURN': chalk.green
};

function log(type, node, name, value) {
	if (!Flags.verbose)
		return;
	var p = pos(node);
	if (Scope.baseFile)
		p = path.relative(Scope.baseFile.split('/').reverse().slice(1).reverse().join('/'), this.file) + ':' + p;


	v = value ? stringifyArg(value) : '';
	console.log(Array(this.depth || 1).join('-'), cs[type] ? cs[type]('[' + type + ']') : chalk.blue('[' + type + ']'),
				chalk.bold.grey(p), name.name || name.raw || name.value || name,
				value ? (chalk.bold.green(value.type) + ': ' + chalk.white(v)) : '');
}

// Quick function to return the line number of a node
function pos(node) {
	return node.loc ? String(node.loc.start.line) : '-1';
}

// Search a object for value with a given name
function find(reports, name) {
	if (!name || typeof name != 'string')
		return false;
	return _.find(reports, function(i) {
		return name.indexOf(i.source.name + '.') == 0 ||
				name.indexOf(i.source.name + '(') == 0 ||
				name.indexOf(i.source.name + '[') == 0 ||
				name == i.source.name;
	});
}

// Splits a MemberExpression by the actually dots that seperate each part. 
function splitME(me) {
	return me.split(/\.\s*(?=[^)]*(?:\(|$))/g);
}

function stringifyArg(arg) {
	return (arg.value || (arg.callee ? (arg.callee.raw || arg.callee.value || arg.callee) : arg.name) || arg.raw || arg);
}
