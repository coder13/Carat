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

var Sources = ['^process.*$']; // default list of sources
var Sinks = ['^eval$'];			// default list of sinks

// So as to not be parsing the same file twice. We want to parse once,
// possibly traverse with different arguments multiple times.
var lookupTable = {};

// List of CallExpressions that have evil callbacks.
// cbParam is where the callback is and sourceParam is the argument in the callback that is the source
var callbacks = [
	{	name: "^require\\('fs'\\).readFile$",
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

			params[0].source = {name: params[0].value, line: func.scope.pos(node)};
			log.call(func.scope, 'SOURCE', node, func.params[0]);
			func.scope.report('SOURCE', node, func.params[0]);

			func.traverse(params);
		}
	},
	{	name: "^require\\('express'\\).createServer\\(.*?\\).post$",
		handler: {cbParam: 'last', sourceParam: 0}
	},
	{	name: "^require\\('express'\\).Router\\(.*?\\).post$",
		handler: {cbParam: 'last', sourceParam: 0}
	},
	{	name: "^require\\('express'\\).createServer\\(.*?\\).get$",
		handler: {cbParam: 'last', sourceParam: 0}
	},
	{	name: "^require\\('express'\\).Router\\(.*?\\).get$",
		handler: {cbParam: 'last', sourceParam: 0}
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

				var parent = _.extend(Scope.Global, {
					file: pkg,
					vars: {
						module: {type: 'Object', props: {exports: {type: 'Object', props: {}}}},
						global: {type: 'Object', props: {}}
					}
				});
				parent.vars.exports = parent.vars.module.props.exports;

				var newScope = new Scope(parent);

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
	this.parent = parent;

	var scope = this;

	this.depth = parent.depth ? parent.depth + 1 : 1;

	this.file = parent.file || '';
	if (!Scope.baseFile)
		Scope.baseFile = parent.file;

	this.file = parent.file;

	// Declare initial variables.
	this.vars = {};
	for (var i in parent.vars) {
		this.vars[i] = parent.vars[i];
	}
	this.vars.this = {type: 'Object', props: this.vars, source: false};

	this.funcLookupTable = {};

	this.reports = [];
	if (parent.reports) {
		parent.reports.forEach(function (i) {
			scope.reports.push(i);
		});
	}

	this.resolveExpression = {};

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
		if (!resolved || !resolve) {
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
		resolve = (resolve == undefined ? true : false); // resolved should be true by default
		var me = scope.resolveMemberExpression(right);
		me.type = right.type;
		var resolved = scope.resolve(me.value);

		// resolve right if resolved is undefined or is exactly right.name (implying that right doesn't exist in vars)
		// resolve is false (meaning we don't want the resolved value)
		if (!resolved || !resolve) {
			if (!me.source) {
				// Determines if a source.
				resolved = scope.resolve(splitME(me.value)[0]);
				if (resolved && resolved.source)
					me.source = {name: me.value, line: scope.pos(right)};
				else
					_.each(Sources, function (i) {
						if (me.value.search(i) == 0) {
							me.source = {name: me.value, line: scope.pos(right)};
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

	this.resolveExpression['SequenceExpression'] = function (node) {
		var rtrn;
		node.expressions.forEach(function (expr) {
			rtrn = (scope.resolveExpression[expr.type] ||
			scope.resolveStatement[expr.type])(expr);
		});
		return rtrn;
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

		// Quick resolve if type is an Identifier or a memberExpression
		if (ce.callee.type == 'Identifier' || ce.callee.type == 'MemberExpression') {
			var resolved = scope.resolve(ce.callee.value);
			if (resolved) {
				if (resolved.type == 'Identifier' || resolved.type == 'MemberExpression') {
					ce.raw = ce.raw.replace(ce.callee.value, resolved.value);
				}
				ce.callee = resolved;
			}
		}

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
			// Determines if ce is a sink.
			for (var i in Sinks) {
				if (ce.callee.value.search(Sinks[i]) == 0) {
					isSink = {raw: ce.callee.value, line: scope.pos(right)};
					if (Flags.sinks)
						Scope.reportedSinks = Scope.reportedSinks.concat(isSink);
					// If sinkCB is defined, this call expression is inside of a function.
					// We want the function to know that there is a sink inside of it
					// and to have it mark itself as a sink.
					if (sinkCB)
						sinkCB(ce.callee.value);
					break;
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
			if (rtrn) {
				return rtrn;
			}
		}

		if (ce.arguments && ce.arguments.length != 0) {
			// Handles simple callbacks containing parameters that are sources
			if (isSink) {
				_.some(callbacks, function (callback) {
					if (ce.callee.value.search(callback.name) != 0)
						return false;

					if (typeof callback.handler == 'object') {
						var cbParam = callback.handler.cbParam == 'last' ? ce.arguments.length - 1 : callback.handler.cbParam;
						var func = ce.arguments[cbParam];
						if (!func)
							return false;


						if (func.type == 'Identifier' || func.type == 'MemberExpression') {
							var resolved = scope.resolve(func.value);
							if (resolved) {
								func = resolved;
							}
						}

						if (func.type != 'Function')
							return false;

						// generate a list of default arguments for the parameters.
						// TODO: abstract this into a convienence function
						var params = _.map(func.params, function (p) {
							return {
								type: 'Identifier',
								value: p,
								source: false
							};
						});

						var param = callback.handler.sourceParam;
						if (callback.handler.sourceParam == 'last')
							param = params.length - 1;
						if (params[param]) {
							// Mark the bad param as the source
							params[param].source = {name: params[param].value, line: scope.pos(right)};
							func.scope.report('SOURCE', right, params[param].value);
						}

						func.traverse(params);

						return true;
					} else if (typeof callback.handler == 'function') {
						callback.handler.call(scope, right, ce);
						return true;
					}
				});
			}

			// For each argument of the function, if it is a Source and ce is a Sink, report the sink.
			// TODO: Instead, keep a list here of all the args that have been handled so as to not
			// attempt to handle the same more than once.
			ce.arguments.forEach(function handleArg(arg) {
				if (!arg)
					return;
				if (arg.type == 'BinaryExpression' || arg.type == 'ConditionalExpression') {
					handleArg(arg.left);
					handleArg(arg.right);
					return;
				} else if (arg.type == 'Identifier' || arg.type == 'MemberExpression') {
					var resolvedArg = scope.resolve(arg.value);
					if (resolvedArg) {
						if (resolvedArg.type == 'Identifier' || resolvedArg.type == 'MemberExpression') {
							if (splitME(arg.value)[0] != splitME(resolvedArg.value)[0]) {
								handleArg(resolvedArg);
								return;
							}
						} else if (resolvedArg.type == 'BinaryExpression' || resolvedArg.type == 'ConditionalExpression') {
							if ((resolvedArg.left && arg.value != resolvedArg.left.value) &&
								(resolvedArg.right && arg.value != resolvedArg.right.value)) {
								handleArg(resolvedArg);
								return;
							}
						}
						arg = resolvedArg;
					}

					if (arg.source) {
						scope.report('SOURCE', right, arg.value);
						scope.report(isSink ? 'SINK' : right.type, right, arg.value, ce.callee.value);
					}
				}
			});
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
			var firstScope = scope.firstScope(name.value) || Scope.Global;

			// Block of code that creates a property if it doesn't exist
			// and in the end, sets the name to the value.
			if (name.type == 'Identifier') {
				firstScope.vars[name.value] = assign.value;
			} else if (name.type == 'MemberExpression') {
				var splitName = splitME(name.value || name);
				var n = firstScope.vars[splitName[0]];
				if (!n) {
					firstScope.vars[splitName[0]] = n = {
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
		MemberExpression: function () {},	// Standalone MemberExpressions; Does nothing.
		LabeledStatement: function () {},
	};

	this.resolveStatement['BlockStatement'] = function (node) {
		node.body.forEach(function (node) {
			if (!node)
				return;

			if (node.expression)
				node = node.expression;

			scope.resolveStatement[node.type](node);
		});
	}

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
			if (value.source) {
				scope.report('SOURCE', node, value);

				if (Flags.verbose)
					log.call(scope, value.source ? 'SOURCE' : 'VAR', variable, name, value);
			}

		});
	};

	this.resolveStatement['ConditionalExpression'] = this.resolveExpression['ConditionalExpression'];

	this.resolveStatement['SequenceExpression'] = this.resolveExpression['SequenceExpression'];

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
		var test;
		if (node.test)
			test = scope.resolveExpression[node.test.type](node.test);
		if (node.consequent)
			scope.traverse(node.consequent.body || [node.consequent]);
		if (node.alternate)
			scope.traverse(node.alternate.body);
		log.call(scope, 'IF', node, node.test ? test : '');
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
		var name;
		if (scope.resolveExpression[node.left.type])
			name = scope.resolveExpression[node.left.type](node.left, false);
		else if (node.left.type == 'VariableDeclaration')
			name = scope.resolveExpression[node.left.declarations[0].id.type](node.left.declarations[0].id, false);

		var firstScope = scope.firstScope(name.value) || Scope.Global;
		firstScope.vars[name.value] = scope.resolveExpression[node.right.type](node.right);

		if (node.body)
			scope.traverse(node.body);
	};

	this.resolveStatement['ForStatement'] = function (node) {
		if (node.init)
			(scope.resolveStatement[node.init.type] ||
			scope.resolveExpression[node.init.type])(node.init);
		if (node.test)
			scope.resolveExpression[node.test.type](node.test);
		if (node.update)
			scope.resolveExpression[node.update.type](node.update);

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

Scope.reportedSinks = [];

// returns the first scope that contains name. If it can't find one, returns false
Scope.prototype.firstScope = function(name) {
	var scope = this;
	while (!_.has(scope.vars, splitME(name)[0])) {
		if (!scope.parent)
			return false;
		scope = scope.parent;
	}
	return !_.has(scope.vars, splitME(name)[0]) ? scope : false;
};

Scope.prototype.report = function (type, node, source, name) {
	var scope = this;

	if (Flags.debug)
		console.log(chalk.red(type), chalk.grey(this.pos(node)), chalk.blue(source.value || source), name || '');
	var p = scope.pos(node);
	switch (type) {
		case 'SOURCE':
			var report = find(scope.reports, source);

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
				report.sink = {
					name: name,
					line: p
				};

				// Flush the report. After finding the sink, we don't want to track it anymore.
				scope.reports.splice(scope.reports.indexOf(report), 1);
				scope.onReport(report);
			}

			return false;
		default:
			report = find(scope.reports, source);

			if (report) {
				if (!report.chain)
					report.chain = [];

				report.chain.push({
					type: type,
					name: name,
					line: p
				});
			}

			return false;
	}
};

Scope.prototype.onReport = function () {};

// Takes in any name and returns the value if the name is in scope.vars.
// Returns false if there is no variable with the name.
Scope.prototype.resolve = function(name) {
	var split = splitME(name); // should ignore dots inside parenthesis
	var scope = this.firstScope(split[0]) || this;

	if (name == split) {
		var value = scope.vars[name];
		return value;
	} else {
		var v = scope.vars[split[0]];

		if (!v || v.type == 'Undefined')
			return false;

		var rtrn = {
			type: 'MemberExpression',
			value: name,
			source: !!v.source,
		};

		if (v.type == 'Object') {
			for (var i = 1; i < split.length; i++) {
				if (v.props && v.props[split[i]]) {
					v = v.props[split[i]];
				}
			}
			rtrn = v;
		} else if (v.type == 'MemberExpression') {
			rtrn.value = name.replace(split[0], v.value);
		} else if (v.type == 'CallExpression' || v.type == 'NewExpression') {
			rtrn.value = name.replace(split[0], v.value.raw || v.value.callee.value);
		} else if (v.type == 'BinaryExpression' || v.type == 'ConditionalExpression') {
			rtrn = v;
		}

		return rtrn;
	}

	return false;
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

	ce.callee = this.resolveExpression[node.callee.type](node.callee, true);

	ce.raw = (ce.callee.value || ce.callee.name) + '(' + (ce.arguments ? _.map(ce.arguments, function (i) {
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

	fe.parentScope = this;
	fe.scope = new Scope(this);


	fe.traverse = function(_params) {
		if (!node || node.body.length <= 0)
			return;
		var scope = this.scope;

		if (_params) {
			for (var i = 0; i < _params.length; i++) {
				scope.vars[this.params[i]] = _params[i];
			}
		}

		// TODO: REWORK 		err...maybe it's fine.
		var raw = scope.pos(node) + (fe.name || 'Function') + '(' + _.map(_params, function (i) {
			return require('util').inspect(i);
		}).join(',') + ')';

		if (scope.funcLookupTable[raw])
			return;
		scope.funcLookupTable[raw] = true;

		// Look at function declarations first. Different from assigning a variable to a function.
		// Create temp variable because we could run this function multiple times
		var newBody = _.reject(this.body, function (node) {
			if (node.type == 'FunctionDeclaration') {
				scope.resolveStatement['FunctionDeclaration'](node);
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
					(scope.resolveStatement[node.type] || 
					scope.resolveExpression[node.type])(node);
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
	if (Scope.baseFile && this.file)
		return (Scope.baseFile ? path.relative(Scope.baseFile.split('/').reverse().slice(1).reverse().join('/'), this.file) : '') + ':' + pos(node);
	else
		return 'Global:' + pos(node);
};

Scope.prototype.traverse = function(body) {
	if (!body)
		return;

	var scope = this;

	body = body.body || body;

	// Traverse the function declarations first and get rid of them.
	// These get priority when scanning and we also don't want to scan them twice.
	body = _.reject(body, function (node) {
		if (node && node.type == 'FunctionDeclaration') {
			scope.resolveStatement['FunctionDeclaration'](node); //todo
			return true;
		}
	});

	body.forEach(function(node) {
		if (!node)
			return;
		// ExpressionStatements simply wrap other statements.
		// We don't want expression statements, we want the expressions they wrap
		if (node.type == 'ExpressionStatement')
			node = node.expression;

		try {
			if (!node.type)
				return;
			if (scope.resolveStatement[node.type] || scope.resolveExpression[node.type]) {
				(scope.resolveStatement[node.type] ||
				scope.resolveExpression[node.type])(node);
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
	Flags.sinks = (flags.sinks == undefined ? Flags : flags).sinks;

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
	var p = this.pos(node);

	var v = value ? stringifyArg(value) : '';
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
