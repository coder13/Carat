'use strict';

const Lab = require('lab');
const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;

const Code = require('code');
const expect = Code.expect;

const expressions = require('../lib/traverse.js');
const utils = require('../lib/utils');
const traverse = expressions.traverse;

const options = {

};

// 	Get ast from simple snippets of code.:
var Program = '{}';
var VariableDeclaration = 'var a = 2;\nvar b;';
var AssignmentExpression = 'a = 3;';
var CallExpression = 'callExpression();';
var FunctionDeclaration = 'function foo( {}';
var FunctionExpression = '(function ( {}';
var MemberExpression = 'a.b';
var ObjectExpression = '({a: {b: 2}, c: function ( {}}';
var IfStatement = 'if (true {;} else {;}\nif (true);';
var ForStatement = 'for (var i = 0; i < 10; i++ {i;}';
var ArrayExpression = '[1,2,3,4];';
var SequenceExpression = '1+2, 1-3, !true, a=3;';

describe('traverse', function () {
	describe('basic', function (done) {
		let ast = traverse(options, utils.getAst(Program), function (scope, node) {
			expect(node).to.exist();
		});
	});

	it('#VariableDeclaration', function (done) {
		let tree = traverse(options, utils.getAst(VariableDeclaration), function (scope, node) {
			expect(node).to.exist();
		});

		expect(tree.body[0]).to.be.an.object();

		let dec = tree.body[0].declarations[0];
		let value = dec.init;
		expect(tree.body[0].declarations[0]).to.be.an.object();

		done();
	});
});

describe('scope', function () {

});
