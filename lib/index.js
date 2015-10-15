'use strict';

const chalk = require('chalk');
const _ = require('lodash');
const traverse = require('./traverse');
const utils = require('./utils');
const query = require('./query');

const Sinks = [
	"^eval$",
	"^setTimeout$",
	"^clearTimeout$",
	"^setInterval$",
	"^clearInterval$",
	"^require\\('child_process'\\).exec$",
	"^require\\('http'\\).get$",
	"^require\\('fs'\\).*$",
	"^require\\('express'\\).*$",
	"^require\\('hapi'\\).*$",
	"^require\\('mongodb'\\).MongoClient.connect$"
];

const Sources = ['^process.*$'];
const callbacks = [];

const Flags = global.Flags = module.exports.Flags = {
	recursive: false,
	debug: false,
	verbose: false,
	pretty: false,
	json: false
};

module.exports = function (options, code) {
	_.extend(Flags, options);

	let reports = [];

	// var tree = traverse(Flags, code, (scope, node) => console.log(node.type));
	var tree = traverse(Flags, code, query);

	// console.log({children: tree.children});

	return {
		reports: reports,
	};
};
