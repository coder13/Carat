var chalk = require('chalk'),
	_ = require('underscore'),
	path = require('path');

var Flags = {
	debug: true,
	verbose: false
};

Sources = ['process.argv']; // default list of sources
Sinks = ['eval'];			// default list of sinks

var lookupTable = {};

custom = {
	'require': function (node, ce) {
		console.log(node, ce);
	}
};

var Scope = function(parent) {
	parent = parent || {};

	if (!parent.depth)
		this.depth = 1;
	else
		this.depth = parent.depth + 1;

	this.file = parent.file;
	if (!Scope.baseFile) 
		Scope.baseFile = parent.file;

	this.vars = parent.vars || {};
	if (!this.module) this.vars.module = {exports: {}};
	if (!this.vars.module.exports) this.vars.module.exports = {};
	if (!this.vars.exports) this.vars.exports = module.exports;
	if (!this.vars.global) this.vars.global = {};
	
	this.sources = parent.sources || Sources;
	this.sinks = parent.sinks || Sinks;
	
	file = Scope.baseFile ? path.relative(Scope.baseFile.split('/').reverse().slice(1).reverse().join('/'), this.file):'';
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
		var resovled = scope.resolve(right.name);
		if (resovled === right.name || (resolve != undefined && !resolve)) {
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
			return resovled;
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

	this.resolveExpression['ConditionalExpression'] = function (right) {

	};

	this.resolveExpression['LogicalExpression'] = function (right) {

	};

	this.resolveExpression['BinaryExpression'] = function (right) {

	};


	this.resolveExpression['CallExpression'] = function (right, sinkCB) {
		var ce = scope.resolveCallExpression(right),
			isSink = false;

		if (scope.resolve(ce.callee.value))
			ce.callee = scope.resolve(ce.callee.value);
		
		if (ce.callee.type == 'Function') {	
			ce.callee.traverse(ce.arguments);
		}
		
		
		for (var i in Sinks)
			if (ce.callee.value.search(Sinks[i]) === 0){
				isSink = true;
				if (sinkCB)
					sinkCB(ce.callee.value);
			}

		if (isSink) {
			ce.arguments.forEach(function (arg) {
				arg = scope.resolve(arg.value);
				if (arg.type != 'Identifier' && arg.type != 'MemberExpression')
					return;
				if (scope.resolve(arg.value).value)
					arg = scope.resolve(arg.value);
				if (arg.source) {
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

	this.resolveExpression['ObjectExpression'] = function (right) {

	};

	this.resolveExpression['FunctionExpression'] = function (right) {
		func = scope.resolveFunctionExpression(right);
		
		func.isSink = false;

		func.traverse();

		func.type = 'function';

		return func;
	};

	this.resolveExpression['AssignmentExpression'] = function (right) {
		var scope = this;
		var assign = this.resolveAssignment(right);
		assign.names.forEach(function (name) {
			eval('scope.vars[' + name + ']' = assign.value);
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

	this.resolveStatement['newExpression'] =
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

	};

	this.resolveStatement['ForInStatement'] = function (node) {

	};

	this.resolveStatement['ForStatement'] = function (node) {

	};

	this.resolveStatement['WhileStatement'] = function (node) {

	};

	this.resolveStatement['CatchClause'] = function (node) {

	};

	this.resolveStatement['TryStatement'] = function (node) {

	};

	this.resolveStatement['SwitchStatement'] = function (node) {

	};

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
	scope = this;

		console.log(type, pos(node), source, name, scope.reports);
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
			var r = this.resolve(s.slice(0,-1).join('.'));
			r = r.raw || r;
			return r + '.' + s.slice(-1);
		} else if (name.indexOf('[') != -1 && name.indexOf(']') != -1) {
			var pieces = name.split('[');
			if (eval('this.vars.' + pieces[0] + '.value[' + pieces[1]))
				return eval('this.vars.' + pieces[0] + '.value[' + pieces[1])
			else {
				console.log(342, name, eval('this.vars.' + pieces[0] + '.value'));
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
		// if (custom[ce.callee])co {
		// 	return custom[ce.callee].call(scope, node, ce);
		// }
	}

	ce.raw = ce.callee + '(' + (ce.arguments ? _.map(ce.arguments, function (i) {
		return i.value || i.raw || i;
	}).join(', '):'') + ')';

	return ce;
}

Scope.prototype.resolveFunctionExpression = function(node) {
	var fe = {
		type: node.type,
		name: node.id ? node.id.name : '',
		params: _.pluck(node.params, 'name'),
		body: node.body.body,
		raw: 'function',
		sink: false
	}

	fe.traverse = function(_params) {
		scope = this.scope;
		if (node.body.length <= 0)
			return;

		_params = _params || [];
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
					console.log('undefined statement:', node.type);
				}
			} catch (e) {
				if (Flags.debug) {
					console.error(chalk.bold.red('Error reading line:'), scope.file + ':' + pos(node));
					console.error(e.stack);
				}
			}

		});
	}

	fe.scope = new Scope(this);

	return fe;
};

Scope.prototype.resolveAssignment = function(node) {
	var scope = this;
	if (node.right.type == 'AssignmentExpression') {
		var assign = this.resolveAssignment(node.right);
		return {
			names: assign.names.concat(this.resolveExpression[node.left.type](node.left)),
			value: assign.value
		};
	
	} else {
		return {
			names: [this.resolveExpression[node.left.type](node.left)],
			value: node.right
		};
	}
}; 


module.exports = function (flags, options) {
	Flags.debug = flags.debug != undefined ? flags.debug : Flags.debug;
	Flags.verbose = flags.verbose != undefined ? flags.verbose : Flags.verbose; 

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

function pos(node) {
	return node.loc ? String(node.loc.start.line) : '-1';
};

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