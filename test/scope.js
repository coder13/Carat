'use strict';

const Lab = require('lab');
const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;

const code = require('code');
const expect = code.expect;

const expressions = require('../lib/expressions.js');
const utils = require('../lib/utils');
const traverse = expressions.traverse;

const options = {

};

const VariableDeclaration = 'var a = 2;\na;';
const AssignmentExpression = 'a = 2;\na;';
const CallExpression = 'var a = function (b) {b;};\na(2)';

describe('Scope', function () {
	it('#VariableDeclaration', function (done) {
		let ast = traverse(options, utils.parse(VariableDeclaration), function (scope, node) {
			expect(node).to.exist();
		});

		let id = ast.body[0].declarations[0].id;
		let a = ast.body[1].expression;

		expect(id.value).to.equal(a.value);

		done();
	});

	it('#AssignmentExpression', function (done) {
		let ast = traverse(options, utils.parse(AssignmentExpression), function (scope, node) {
			expect(node).to.exist();
		});

		let left = ast.body[0].expression.left;
		let a = ast.body[1].expression;

		expect(left.value).to.equal(a.value);

		done();
	});

	it('#CallExpression', function (done) {
		let ast = traverse(options, utils.parse(CallExpression), function (scope, node) {
			expect(node).to.exist();
		});

		let name = ast.body[0].declarations[0].id;
		let callee = ast.body[1].expression.callee;

		// console.log(name);
		// console.log(callee);

		// expect(name).to.equal(callee);

		done();
	});

});
