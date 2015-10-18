// TODO: mark payload as source?

var wreck = require('wreck');

var source = process.argv[2];

var handle = function (err, res, payload) {
	eval(res);
};

wreck.get(source, handle);
wreck.put(source, handle);
wreck.post(source, handle);
wreck.delete(source, handle);
wreck.request(method, source, handle);
