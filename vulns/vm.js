/* {"length": 3} */
var vm = require('vm');

vm.runInThisContext(process.argv[2]);
vm.runInContext(process.argv[3]);
vm.runInNewContext(process.argv[4]);
