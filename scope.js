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
		- All expressions will have a type, value and source properities. 
		- An Object's type will be 'object' and it's value will be an object containing it's children. 
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
	debug: true,
	verbose: false
};

var Sources = ['process.argv']; // default list of sources
var Sinks = ['eval'];			// default list of sinks

// So as to not be parsing the same file twice. We want to parse once,
// possibly traverse with different argumements multiple times. 
var lookupTable = {};

// List of CallExpressions that have evil callbacks.
// cbParam is where the callback is and sourceParam is the argument in the callback that is the source
var callbacks = {"require('fs').readFile": {cbParam: 2, sourceParam: 1}}

// Custom functions that handle call expressions.
// These are for more complicated callbacks or other.
var custom = { 
	'require': function (node, ce) { 
		if (!ce.arguments[0])
			return;

		var file;
		if (node.arguments[0].type == 'Literal') {
			file = node.arguments[0].value;
		} else if (node.arguments[0].type == 'Identifier') {
			file = this.resolve(node.arguments[0].name).value;
			if (typeof file != 'string')
				return;
		} else
			return;

		if (['hapi', 'express', 'jade'].indexOf(file) != -1 || file.indexOf('hapi') != -1)
			return; // just ignore these things. They have prewritten handlers anyways.

		var scope = this;
		var r;
		this.resolvePath(file, function (pkg) {
			if (!pkg)
				return;

			// Lookup table is a list of files already looked at.
			// In static analysis, we only want to look at each file once.
			if (lookupTable[pkg])
				return;
			lookupTable[pkg] = true;
			code = fs.readFileSync(pkg);
			if (code) {
				var ast = esprima.parse(String(code), {loc: true});
				if (!ast)
					return;
				if (Flags.verbose && !Flags.json)
					console.log(chalk.yellow(' ---- '), pkg);

				var newScope = new Scope({
					file: pkg,
				});
				newScope.traverse(ast);

				if (newScope.vars.module) {
					r = newScope.vars.module.value.exports;

					if (Flags.json) {
						scope.reports.push(newScope.reports);
					}
						
				} else
					if (Flags.verbose && !flags.json)
						console.log(chalk.yellow(' ---- '), chalk.red(pkg));
			}

		});

		return r;
	}
};

var Scope = function(parent) {
	parent = parent || {};

	if (!parent.depth)
		this.depth = 1;
	else
		this.depth = parent.depth + 1;

	if (!parent.file)
		throw new Error("parent.file isn't defined");
	this.file = parent.file || '';
	if (!Scope.baseFile) 
		Scope.baseFile = parent.file;

	this.file = Scope.baseFile ? path.relative(Scope.baseFile.split('/').reverse().slice(1).reverse().join('/'), this.file):'';

	this.vars = parent.vars || {};
	if (!this.vars.module) this.vars.module = {type: 'object', value: {exports: {type: 'object', value: {}}}};
	else if (!this.vars.module.value.exports) this.vars.module.value.exports = {type: 'object', value: {}};
	if (!this.vars.exports) this.vars.exports = this.vars.module.value.exports;
	if (!this.vars.global) this.vars.global = {type: 'object'};
	
	this.sources = parent.sources || Sources;
	this.sinks = parent.sinks || Sinks;
	
	this.reports = parent.reports || [];

	var scope = this;

	this.resolveExpression = {};

	this.resolveExpression['Literal'] = function (right) {
		return {
			type: right.type,
			value: typeof right.value == 'string' ?
				"'" + right.value + "'" : right.value
		};
	};

	this.resolveExpression['Identifier'] = function (right, resolve) {
		var resolved = scope.resolve(right.name);
		if ((resolved === right.name || (resolve != undefined && !resolve))) {
			var isSource = false;
			
			for (var i in Sources) {
				if (right.name.indexOf(i + '.') === 0 ||
					right.name.indexOf(i + '(') === 0 ||
					right.name.indexOf(i + '[') === 0 ||
					right.name == i) {
					isSource = true;
				}
			}

			if (isSource) {
				scope.report('SOURCE', right, right.name);
			}

			return {
				type: right.type,
				value: right.name,
				source: isSource
			}
		} else {
			return resolved;
		}
	};

	this.resolveExpression['ThisExpression'] = function (right) {
		return scope;
	};

	this.resolveExpression['ArrayExpression'] = function (right) {
		var elements = right.elements;
		elements = _.map(right.elements, function (i) {
			var expr = scope.resolveExpression[i.type](i, false);
			if (expr.source)
				scope.report('SOURCE', right, expr.value);
			return expr;
		});

		return {
			type: 'Array',
			value: elements,
		}
	};

	this.resolveExpression['ConditionalExpression'] =
	this.resolveExpression['LogicalExpression'] =
	this.resolveExpression['BinaryExpression'] = function (right) {
		return {
			type: 'BinaryExpression',
			left: scope.resolveExpression[right.left.type](right.left),
			op: right.operator,
			right: scope.resolveExpression[right.right.type](right.right)
		}
	};

	this.resolveExpression['ObjectExpression'] = function (right) {
		var obj = {};
		right.properties.forEach(function(i) {
			var expr = scope.resolveExpression[i.value.type](i.value);
			if (expr.source)
				scope.report('SOURCE', right, expr.value);
			obj[i.key.name] = expr;
			
		});
		return {
			type: 'object',
			value: obj
		}
	};


	this.resolveExpression['CallExpression'] = function (right, sinkCB) {
		var ce = scope.resolveCallExpression(right),
			isSink = false;

		resolved = scope.resolve(ce.callee.value);
		if (resolved && resolved != ce.callee && resolved != ce.callee.value)
			ce.callee = scope.resolve(ce.callee.value);
		
		if (ce.callee.type == 'Function') {	
			ce.callee.traverse(ce.arguments);
		} else if (custom[ce.callee.value]) {
			if (r = custom[ce.callee.value].call(scope, right, ce)) {
				return r;
			}
		}
		
		for (var i in Sinks)
			if ((ce.callee.value || ce.callee).search(Sinks[i]) === 0) {
				isSink = true;
				if (sinkCB)
					sinkCB(ce.callee.value);
			}

		if (isSink) {
			var cb = callbacks[ce.callee.value];
			if (cb) {
				var func = ce.arguments[cb.cbParam];
				var params = _.map(func.params, function (i) {
					return {type: 'Identifier', value: i, source: false};
				});
				if (params[cb.sourceParam]) {
					params[cb.sourceParam].source = true;
					func.scope.report('SOURCE', right, params[cb.sourceParam].value);
				}
				func.traverse.call(func, params);
			}

			ce.arguments.forEach(function (arg) {
				if (scope.resolve(arg.value))
					arg = scope.resolve(arg.value);
	
				if (arg.type != 'Identifier' && arg.type != 'MemberExpression')
					return;
				if (scope.resolve(arg.value).value)
					arg = scope.resolve(arg.value);
				if (arg.source) {
					scope.report('SOURCE', right, arg.value);

					scope.report('SINK', right, arg.value, ce.callee.value);
				}
				
			});
		}

		return {
			type: right.type,
			value: ce,
			sink: isSink,
		}
	};

	this.resolveExpression['MemberExpression'] = function (right) {
		var me = scope.resolveMemberExpression(right),
			isSource = true;

		for (var i in Sources) {
			if (me.indexOf(i + '.') === 0 ||
				me.indexOf(i + '(') === 0 ||
				me.indexOf(i + '[') === 0 ||
				me == i) {
				isSource = true;
			}
		}

		return {
			type: right.type,
			value: me,
			source: isSource
		};
	};

	this.resolveExpression['FunctionExpression'] = function (right) {
		debugger
		var func = scope.resolveFunctionExpression(right);
		
		func.isSink = false;

		func.traverse();

		func.type = 'function';

		return func;
	};

	this.resolveExpression['AssignmentExpression'] = function (right) {
		debugger;
		var assign = scope.resolveAssignment(right);
		assign.names.forEach(function (name) {
			log.call(scope, 'ASSIGN', right, name.value, assign.value);
			name.value = name.value.replace(/\./g, '.value.');
			eval('scope.vars.' + name.value + ' = ' + JSON.stringify(assign.value));
		});

	};


	this.resolveStatement = {};
		
	this.resolveStatement['VariableDeclaration'] = function (node) {
		node.declarations.forEach(function (variable) {
			var name = variable.id.name;

			if (!scope.resolveExpression[variable.init.type])
				return;

			var value = scope.resolveExpression[variable.init.type](variable.init);
			if (!value)
				return;

			scope.vars[name] = value;

			// Handles reports
			if (!Flags.verbose && value.source) {
				scope.report('SOURCE', node, value);
			}

			log.call(scope, value.source ? 'SOURCE' : 'VAR', variable, name, value);
		});
	};

	this.resolveStatement['NewExpression'] =
	this.resolveStatement['CallExpression'] = function (node, sinkCB) {
		var ce = scope.resolveExpression['CallExpression'](node, sinkCB);
		log.call(scope, ce.sink ? 'SINK' : 'CE', node, ce.value.callee, ce);
	};

	this.resolveStatement['AssignmentExpression'] = this.resolveExpression['AssignmentExpression'];

	this.resolveStatement['FunctionDeclaration'] = function(node) {
		var fe = scope.resolveExpression['FunctionExpression'](node);

		scope.vars[fe.name] = fe;
		log.call(scope, 'FUNC', node, fe.name, {type: 'params', value: fe.params});
	};

	this.resolveStatement['IfStatement'] = function (node) {
		scope.resolveExpression[node.test.type](node.test);
		scope.traverse(node.consequent.body);
		if (node.alternate)
			scope.traverse(node.alternat.bodye);
	};

	this.resolveStatement['WhileStatement'] = function (node) {
		var test;
		if (node.test)
			test = scope.resolveExpression[node.test.type](node.test);
		scope.traverse(node.body);
		log.call(scope, 'WHILE', node, node.test ? test : '')
	};

	this.resolveStatement['ForInStatement'] = function (node) {
		// console.log(node);
	};

	this.resolveStatement['ForStatement'] = function (node) {
		if (node.init) {
			scope.resolveStatement[node.init.type](node.init);
		} if (node.test) {
			scope.resolveExpression[node.test.type](node.test);
		} if (node.update) {
			scope.resolveExpression[node.update.type](node.update);
		}
		if (node.body)
			scope.traverse(node.body);
	};

	this.resolveStatement['ThrowStatement'] = function (node) {
		scope.resolveStatement[node.argument.type](node.argument);
	}

	this.resolveStatement['TryStatement'] = function (node) {
		scope.traverse(node.block);
		node.handlers.forEach(function (handler) { // array of catch clauses
			scope.resolveStatement[handler.type](handler);
		})
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
	}

	this.resolveStatement['BreakStatement'] = function(node) {};

	this.resolveStatement['ReturnStatement'] = function (node, sourcCB) {
		if (!node.argument)
			return;

		var arg = scope.resolveExpression[node.argument.type](node.argument);
		if (arg.source) {
			sourcCB(arg.source)
		}
	};

};

Scope.prototype.report = function (type, node, source, name) {
	var scope = this;

	if (Flags.debug)
		console.log(type, pos(node), source, !!name?name:'', scope.reports.length!=0?scope.reports:'');
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
				}

				// Flush the report. After finding the sink, we don't want to track it anymore.
				scope.reports.splice(scope.reports.indexOf(report), 1);
				scope.onReport(report);
			}

			return false;
	}
}

Scope.prototype.onReport = function () {};

// returns a value for a variable if one exists
// if a = b
// resolve(a) will result in b
Scope.prototype.resolve = function(name) {
	if (!name || typeof name != 'string')
		return name;

	try {
		if (eval('!!this.vars.' +  name)) {
			return eval('this.vars.' + name);
		} else if (name.indexOf('.') != -1) {
			var s = name.split('.');
			
			if (eval('!!this.vars.' + s[0] + '.value.' + s[1]))
				return eval('this.vars.' + s[0] + '.value.' + s[1]);
			
			var r = this.resolve(s.slice(0,-1).join('.'));
			r = r.value.raw || r.value;
			return r + '.' + s.slice(-1);
		} else if (name.indexOf('[') != -1 && name.indexOf(']') != -1) {
			var pieces = name.split('[');
			if (eval('this.vars.' + pieces[0] + '.value[' + pieces[1]))
				return eval('this.vars.' + pieces[0] + '.value[' + pieces[1])
			else {
				return false;
			}
		}
		return name;
	} catch (e) {
		return false;
	}
};

Scope.prototype.resolveMemberExpression = function(node) {
	if (node.object.type == 'Identifier')
		var obj = this.resolveExpression['Identifier'](node.object, false);
	else
		var obj = this.resolveExpression[node.object.type](node.object);
	obj = obj.value || obj;
	obj = obj.value || obj.raw || obj.callee || obj.name || obj;

	if (node.property.type == 'Identifier')
		var prop = this.resolveExpression['Identifier'](node.property, false);
	else
		var prop = this.resolveExpression[node.property.type](node.property);
	prop = prop.value || prop
	prop = prop.value || prop.raw || prop.callee || prop.name || prop;
	
	return obj + (node.computed ? '[' + prop + ']' : '.' + prop);
};

Scope.prototype.resolveName = function(name) {
	if (name.type == 'MemberExpression') {
		return this.resolveMemberExpression(name);
	} else {
		return name.name;
	}
};

Scope.prototype.resolveCallExpression = function (node) {
	var scope = this;
	var ce = {}

	if (node.arguments && node.arguments.length > 0){
		ce.arguments = _.map(node.arguments, function (right) {
			right = scope.resolveExpression[right.type](right, false);
			return right;
		});
	}

	if (node.callee.type == 'FunctionExpression') {
		ce.callee = this.resolveExpression['FunctionExpression'](node.callee);
		ce.callee.traverse(ce.arguments);
	} else {
		ce.callee = this.resolveExpression[node.callee.type](node.callee);
	}

	ce.raw = ce.callee.value + '(' + (ce.arguments ? _.map(ce.arguments, function (i) {
		return i.value || i.raw || i;
	}).join(', '):'') + ')';

	return ce;
}

Scope.prototype.resolveFunctionExpression = function(node) {
	var fe = {
		type: node.type,
		name: node.id ? node.id.name : '',
		params: _.pluck(node.params, 'name'),
		body: node.body.body || nody.body,
		raw: 'function',
		sink: false
	}
	var s = this;
	fe.scope = new Scope(this);

	fe.traverse = function(_params) {
		var scope = this.scope;
		if (node.body.length <= 0)
			return;
		if (_params)
			for (var i = 0; i < _params.length; i++) {
				scope.vars[this.params[i]] = _params[i];
			}
		
		this.body = _(this.body).reject(function (node) {
			if (node.type == 'FunctionDeclaration') {
				func = scope.resolveStatement['FunctionDeclaration'](node);
				return true;
			}
		});

		this.body.forEach(function(node) {
			if (node.type == 'ExpressionStatement')
				node = node.expression;

			try {
				if (node.type == 'CallExpression') {
					scope.resolveStatement['CallExpression'](node, function (sink) {
						this.sink = true;
					});
				} else if (node.type == 'ReturnStatement') {
					scope.resolveStatement['ReturnStatement'](node, function (sink) {
						
					});
				} else if (scope.resolveStatement[node.type]) {
					scope.resolveStatement[node.type](node);
				} else {
					console.log('-undefined statement:', node.type);
					throw new Error('undefined statement', node.type);
				}
			} catch (e) {
				if (Flags.debug) {
					console.error(chalk.bold.red('Error reading line:'), scope.file + ':' + pos(node));
					console.error(e.stack);
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
	if (file.indexOf('./') === 0 || file.indexOf('../') === 0)
		if (path.extname(file) == '.json')
			return false;	

	try {
		pkg = resolve.sync(file, {basedir: String(this.file).split('/').slice(0,-1).join('/')});
	} catch (e) {
		return false;
	}

	if (file == pkg)
		return false;
	else if (pkg)
		return cb(pkg);
};

Scope.prototype.traverse = function(body) {
	var scope = this;
	body = body.body || body;

	// Traverse the function declarations first and get rid of them.
	// These get priority when scanning and we also don't want to scan them twice. 
	body = _(body).reject(function (node) {
		if (node.type == 'FunctionDeclaration') {
			func = scope.resolveStatement['FunctionDeclaration'](node); //todo
			return true;
		}
	});
	
	body.forEach(function(node) {
		// ExpressionStatements simply wrap other statements.
		// We don't want expression statements, we want the expressions they wrap
		
		if (node.type == 'ExpressionStatement')
			node = node.expression;

		try {
			if (scope.resolveStatement[node.type]) {
				scope.resolveStatement[node.type](node);
			} else {
				throw new Error('Undefined Statement: ' +node.type);
			}
		} catch (e) {
			if (Flags.debug) {
				console.error(chalk.bold.red('Error reading line:'), scope.file + ':' + pos(node));
				console.error(e.stack);
			}
		}
	});
};

module.exports = function (flags, options) {
	Flags.debug = flags.debug != undefined ? flags.debug : Flags.debug;
	Flags.verbose = flags.verbose != undefined ? flags.verbose : Flags.verbose; 

	if (options) {
		if (options.Sinks != undefined) {
			Sinks = options.Sinks;	
		}
		
		if (options.Sources != undefined) {
			Sources = options.Sources;
		}
	}

	return Scope;
}

/* 
		Convience functions 
*/

var cs = { // colors
	'BE': chalk.green,
	'CE': chalk.green,
	'SCE': chalk.red,
	'SINK': chalk.red,
	'SOURCE': chalk.red,
	'SOURCES': chalk.yellow,
	'RETURN': chalk.red
};

function log(type, node, name, value) {
	if (!Flags.verbose)
		return;
	var p = pos(node);
	if (Scope.baseFile)
		p = path.relative(Scope.baseFile.split('/').reverse().slice(1).reverse().join('/'), this.file) + ':' + p;

	console.log(Array(this.depth||1).join('-'), cs[type] ? cs[type]('[' + type + ']') : chalk.blue('[' + type + ']'),
				chalk.bold.grey(p), name, 
				value ? (chalk.bold.green(value.type) + ': ' + chalk.white(value.value.raw || value.value)) : '');
}

// Quick function to return the line number of a node
function pos(node) {
	// console.log(698, node);
	return node.loc ? String(node.loc.start.line) : '-1';
};

// Search a object for value with a given name
function find(reports, name) {
	if (!name || typeof name != 'string')
		return false;
	return _.find(reports, function(i) {
		return name.indexOf(i.source.name + '.') === 0 ||
			   name.indexOf(i.source.name + '(') === 0 ||
			   name.indexOf(i.source.name + '[') === 0 ||
				   name == i.source.name;				
	});
};