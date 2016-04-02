'use strict';

const Lab = require('lab');
const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;

const fs = require('fs');
const path = require('path');
const Code = require('code');
const expect = Code.expect;

const traverse = require('../lib/traverse.js');
const query = require('../lib/query.js');
const utils = require('../lib/utils.js');

const Defaults = {
	recursive: true
};

describe('Vulns:', function () {
	let files = fs.readdirSync('./vulns/').map(file => path.join('./vulns/', file));

	files.forEach(function (file) {
		if (fs.statSync(file).isDirectory() || path.extname(file) !== '.js') {
			return;
		}

		let options = {};
		let line = String(fs.readFileSync(file)).split('\n')[0];
		if (line.search(/^\/\*(\s?)\{.*\}(\s?)\*\/$/) === 0) { // Matches /* {.*} */
			options = JSON.parse(line.slice(2).slice(0, -2).trim());
		}

		if (options.ignore) {
			return;
		}

		it(file, function (done) {
			let reports = [];
			let code = String(fs.readFileSync(file));
			traverse(code, options, file, function (report) {
				reports.push(report);
			});

			expect(reports).to.have.length(options.length);

			done();
		});
	});
});
