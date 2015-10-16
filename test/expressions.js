'use strict';

const Lab = require('lab');
const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;

const Code = require('code');
const expect = Code.expect;

const expressions = require('../lib/expressions.js');
const utils = require('../lib/utils');
const traverse = expressions.traverse;

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
var ObjectExpression = '({a: {b: 2}, c: function () {}}';
var IfStatement = 'if (true) {;} else {;}\nif (true);';
var ForStatement = 'for (var i = 0; i < 10; i++) {i;}';
var ArrayExpression = '[1,2,3,4];';
var SequenceExpression = '1+2, 1-3, !true, a=3;';

describe('expressions', function () {
	describe('#Program', function (done) {
		let ast = traverse(options, utils.getAst(Program), function (scope, node) {
			expect(node).to.exist();
		});

		expect(ast.body[0]).to.deep.include({
			type: 'BlockStatement',
			body: [],
			line: '1'
		});
	});

	it('#VariableDeclaration', function (done) {
		let ast = traverse(options, utils.getAst(VariableDeclaration), function (scope, node) {
			expect(node).to.exist();
		});

		expect(ast.body[0]).to.deep.include({
			type: 'VariableDeclaration',
			declarations: [{
				type: 'VariableDeclarator',
				id: {
					type: 'Identifier',
					name: 'a'
				},
				init: {
					type: 'Literal',
					value: 2,
					raw: '2',
					line: '1'
				}
			}],
			kind: 'var'
		});

		expect(ast.body[1]).to.deep.include({
			type: 'VariableDeclaration',
			declarations: [{
				type: 'VariableDeclarator',
				id: {
					type: 'Identifier',
					name: 'b'
				},
				init: null
			}],
			kind: 'var'
		});

		done();
	});

	it('#AssignmentExpression', function (done) {
		let ast = traverse(options, utils.getAst(AssignmentExpression), function (scope, node) {
			expect(node).to.exist();
		});

		expect(ast.body[0]).to.deep.include({
			type: 'ExpressionStatement',
			expression: {
				type: 'AssignmentExpression',
				operator: '=',
				left: {
					type: 'Identifier',
					name: 'a'
				}, right: {
					type: 'Literal',
					value: 3,
					raw: '3',
					line: '1'
				}
			}
		});

		done();
	});

	it('#CallExpression', function (done) {
		let ast = traverse(options, utils.getAst(CallExpression), function (scope, node) {
			expect(node).to.exist();
		});

		expect(ast.body[0]).to.deep.include({
			type: 'ExpressionStatement',
			expression: {
				type: 'CallExpression',
				callee: {
					type: 'Identifier',
					name: 'callExpression',
					line: '1'
				},
				arguments: []
			}
		});

		done();
	});
});

describe('scope', function () {

});
