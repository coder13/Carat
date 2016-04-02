'use strict';

const Lab = require('lab');
const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;

const code = require('code');
const expect = code.expect;

/* Because there is no simple way to add a method to Code. */
let t = expect(2);
t.__proto__.objMatch = function (value) {
	return this.__proto__.assert.call(this, ast.matches(this._ref, value), 'match');
};
t.to.equal(2);

const _ = require('lodash');
const expressions = require('../lib/index.js');
const utils = require('../lib/utils');
const ast = require('../lib/ast');

const options = {
	file: 'test',
	recursive: true
};

let traverse = function (program, opts) {
	return expressions.traverse(program, options, options.file, function (scope, node) {
		expect(node).to.exist();
	});
};

describe('traverse', function () {
	it('#Program', function (done) {
		const program = '{}';
		let tree = traverse(program);

		expect(tree.body[0]).to.objMatch(ast.block());
		done();
	});

	it('#VariableDeclaration', function (done) {
		const program = 'var a = 2;\nvar b = a;';
		let tree = traverse(program);

		let value = ast.l(2);

		expect(tree.body[0]).to.objMatch({
			type: 'VariableDeclaration',
			declarations: [{
				type: 'VariableDeclarator',
				id: ast.i('a'),
				init: value
			}],
			kind: 'var'
		});

		expect(tree.body[1]).to.objMatch({
			type: 'VariableDeclaration',
			declarations: [{
				type: 'VariableDeclarator',
				id: ast.i('b'),
				init: tree.scopeManager.globalScope.resolveVar('a')
			}],
			kind: 'var'
		});

		done();
	});

	it('#AssignmentExpression', function (done) {
		const program = 'a = 3;\na';
		let tree = traverse(program);

		expect(tree.body[0].expression).to.objMatch({
			type: 'AssignmentExpression',
			operator: '=',
			left: ast.i('a'),
			right: ast.l(3)
		});

		expect(tree.body[1].expression).to.equal(tree.scopeManager.globalScope.resolveVar('a'));

		done();
	});

	it('#MemberExpression', function (done) {
		const program = 'a.b';
		let tree = traverse(program);

		expect(tree.body[0].expression).to.objMatch(ast.me('a', 'b'));
		expect(utils.generate(tree.body[0].expression)).to.equal(program);

		done();
	});

	it('#CallExpression', function (done) {
		const program = 'var a = function (b) {b;};\na(2)';
		let tree = traverse(program);

		let name = tree.body[0].declarations[0].id;
		expect(tree.body[1].expression).to.objMatch(ast.ce(name));

		done();
	});

	it('#ArrayExpression', function (done) {
		const program = '[1,2,3,4][0]';
		let tree = traverse(program);

		expect(tree.body[0].expression).to.objMatch(ast.l(1));
		done();
	});

	it('#ObjectExpression', function (done) {
		const program = 'var a = ({a: {b: 2}, c: function () {}});\na.a.b = 3;\na.a.c = 4;';
		let tree = traverse(program);

		let a = tree.scopeManager.globalScope.resolveVar('a');
		expect(a).to.objMatch(ast.oe([
			ast.prop('a', ast.oe([
				ast.prop('b', ast.l(3)),
				ast.prop('c', ast.l(4))
			])),
			ast.prop('c', ast.func(null))
		]));

		done();
	});

	it('#FunctionDeclaration', function (done) {
		const program = 'function foo() {}';
		let tree = traverse(program);

		expect(tree.body[0]).to.objMatch(ast.decFunc('foo', undefined, ast.block(), {generator: false, expression: false}));

		done();
	});
});

describe('Functionality', function () {
	it('Loads from another file', function (done) {
		const program = `var test = require('../test/lib/testFile.js');`;
		let tree = traverse(program);

		expect(tree.body[0].declarations[0].init).to.objMatch(ast.l(2));

		done();
	});

	it('Resolves a MemberExpression when the object is an ObjectExpression', function (done) {
		const program = `var test = {a: 2};\ntest.a = 3;\ntest.a;`;
		let tree = traverse(program);

		expect(tree.body[2].expression).to.objMatch(ast.l(3));

		done();
	});

	it('#IfStatement', function (done) {
		const program = `var a = 2;\nif (a === 3) {\na = 3;\n} else {\na = 4;\n}`;
		let nodes = 0;
		let tree =  expressions.traverse(program, options, options.file, function (scope, node) {
			expect(node).to.exist();
			nodes++;
		});

		expect(nodes).to.equal(24);

		done();
	});
});
