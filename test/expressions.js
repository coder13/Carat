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
var Program = '{}';
var VariableDeclaration = 'var a = 2;\nvar b;';
var AssignmentExpression = 'a = 3;';
var CallExpression = 'callExpression();';
var FunctionDeclaration = 'function foo() {}';
var FunctionExpression = '(function () {})';
var MemberExpression = 'a.b';
var ObjectExpression = '({a: {b: 2}, c: function () {}})';
var IfStatement = 'if (true) {;} else {;}\nif (true);';
var ForStatement = 'for (var i = 0; i < 10; i++) {i;}';
var ArrayExpression = '[1,2,3,4];';
var SequenceExpression = '1+2, 1-3, !true, a=3;';

describe('Expressions', function () {
	describe('#Program', function (done) {
		let ast = traverse(options, utils.parse(Program), function (scope, node) {
			expect(node).to.exist();
		});

		expect(ast.body[0]).to.deep.include({
			type: 'BlockStatement',
			body: [],
			line: 1
		});
	});

	it('#VariableDeclaration', function (done) {
		let body = traverse(options, utils.parse(VariableDeclaration), function (scope, node) {
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
		let node = traverse(options, utils.parse(AssignmentExpression), function (scope, node) {
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

	it('#CallExpression', function (done) {
		let node = traverse(options, utils.parse(CallExpression), function (scope, node) {
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

	it('#ObjectExpression', function (done) {
		let node = traverse(options, utils.parse(ObjectExpression), function (scope, node) {
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
