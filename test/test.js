var assert = require('assert'),
	carat = require('../carat.js'),
	fs = require('fs');

carat.flags({
	verbose: false,
	debug: false
});

var base = __dirname + '/src/';

var tests = {
	'eval.js': function () {
		
	}
};

for (var test in tests) {
	describe(test, function () {
		it('exists', function () {
			fs.exists(base + test, function () {
				assert(true);
			});
		});

		fs.readFile(base + 'eval.js', function (err, data) {
			if (err) {
				return false;
			}

			var reports = carat.check(String(data), base + 'eval.js');

			describe('is vunerable', function () {

				it('has reports', function () {
					assert(!!reports);
				});
			
			});
			
		});
	});
}