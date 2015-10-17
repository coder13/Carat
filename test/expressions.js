'use strict';

const Lab = require('lab');
const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;

const isMatch = require('lodash').isMatch;
const code = require('code');
const expect = code.expect;

/* Because there is no simple way to add a method to code. */
let t = expect(2);
t.__proto__.objMatch = function (value) {
	return this.__proto__.assert.call(this, isMatch(this._ref, value));
};
t.to.equal(2);

const expressions = require('../lib/expressions.js');
const utils = require('../lib/utils');
const traverse = expressions.traverse;
const ast = require('../lib/ast');

const options = {

};

// 	Get ast from simple snippets of code.:
const FunctionDeclaration = 'function foo() {}';
const FunctionExpression = '(function () {})';
const IfStatement = 'if (true) {;} else {;}\nif (true);';
const ForStatement = 'for (var i = 0; i < 10; i++) {i;}';
const SequenceExpression = '1+2, 1-3, !true, a=3;';

describe('Expressions', function () {
	it('#Program', function (done) {
		const program = '{}';
		let ast = traverse(options, utils.parse(program), function (scope, node) {
			expect(node).to.exist();
		});

		expect(ast.body[0]).to.deep.include({
			type: 'BlockStatement',
			body: [],
			line: 1
		});
		done();
	});

	it('#VariableDeclaration', function (done) {
		const program = 'var a = 2;\nvar b;';
		let body = traverse(options, utils.parse(program), function (scope, node) {
			expect(node).to.exist();
		}).body;

		let value = ast.l(2);

		expect(body[0]).to.objMatch({
			type: 'VariableDeclaration',
			declarations: [{
				type: 'VariableDeclarator',
				id: ast.i('a'),
				init: value
			}],
			kind: 'var',
			line: 1
		});

		expect(body[1]).to.objMatch({
			type: 'VariableDeclaration',
			declarations: [{
				type: 'VariableDeclarator',
				id: ast.i('b')
			}],
			kind: 'var'
		});

		done();
	});

	it('#AssignmentExpression', function (done) {
		const program = 'a = 3;';
		let node = traverse(options, utils.parse(program), function (scope, node) {
			expect(node).to.exist();
		}).body[0].expression;

		expect(node).to.objMatch({
			type: 'AssignmentExpression',
			operator: '=',
			left: ast.i('a'),
			right: ast.l(3)
		});

		done();
	});

	it('#MemberExpression', function (done) {
		const program = 'a.b';
		let node = traverse(options, utils.parse(program), function (scope, node) {
			expect(node).to.exist();
		}).body[0].expression;

		expect(node).to.objMatch(ast.me('a', 'b'));
		expect(node.name).equal(program);

		done();
	});

	it('#CallExpression', function (done) {
		const program = 'callExpression();';
		let node = traverse(options, utils.parse(program), function (scope, node) {
			expect(node).to.exist();
		}).body[0].expression;

		expect(node).to.objMatch({
			type: 'CallExpression',
			callee: ast.i('callExpression'),
			arguments: []
		});

		// console.log(require('util').inspect(ast.body, {depth: 100}));
		done();
	});

	it('#ArrayExpression', function (done) {
		const program = '[1,2,3,4][0]';
		let node = traverse(options, utils.parse(program), function (scope, node) {
			expect(node).to.exist();
		}).body[0].expression;

		expect(node).to.objMatch(ast.l(1));
		done();
	});

	it('#ObjectExpression', function (done) {
		const program = '({a: {b: 2}, c: function () {}})';
		let node = traverse(options, utils.parse(program), function (scope, node) {
			expect(node).to.exist();
		}).body[0].expression;

		expect(node).to.objMatch(ast.oe([
			ast.prop('a', ast.oe([
				ast.prop('b', ast.l(2))
			])),
			ast.prop('c', ast.f(null, [], ast.body([])))
		]));
		done();
	});
});
