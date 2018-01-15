'use strict';

module.exports = Component;

var assert = require('assert');
var path = require('path');
var arrify = require('arrify');
var globby = require('globby');
var isAbsolute = require('is-absolute');
var assign = require('object-assign');
var readJson = require('read-json-sync');
var unique = require('array-unique');


var dumpCap = 1000; // suppress dump of output if subject has a length above dumpCap
var dumpPrefix = "[dump   -] ";

/**
 * @param {Object} options
 * @property {Object} json
 * @property {Array} files
 * @property {Array} dependencies
 * @property {Array} devDependencies
 * @constructor
 */
function Component(options) {

	options = normalizeOptions(options);
	this.verbose = options.verbose;
	this.dependencyMap = options.dependencyMap;
	this.filepath = options.dir;
	this.packetID = options.dir.split("/").pop();

	options.json = (options.isRoot)
		? ".bower.json"
		: "bower.json";

	this.json = {};
	var p;

	try {
		p = path.resolve(options.dir, options.composerJson);
		var jsonComposer = readJson(p);
		this.json = assign({}, this.json, jsonComposer || {});
		this.logtrace("[composer] reading " + p);
		// this.logtrace(jsonComposer);
	} catch (err) {
		// ok
	}

	try {
		p = path.resolve(options.dir, options.json);
		var jsonBower = readJson(p);
		this.json = assign({}, this.json, jsonBower || {});
		this.logtrace("[bower   ] reading " + p);
		// this.logtrace(this.json);
	} catch (err) {
		// ok
	}

	this.name = options.isRoot
		? 'self'
		: this.json.name || path.basename(options.dir);
	this.packetID = "[folder:" + this.packetID + ", name:" + this.name + "]";

	options.overrides = assign({}, this.json.overrides, options.overrides);
	if (options.overrides[this.name]) {
		this.logtrace("[override] reading options " + this.packetID);
		assign(this.json, options.overrides[this.name]);
	}

	if (Object.keys(this.json).length == 0) {
		var prefix = this.name.split("-")[0];
		if (["ext", "php"].indexOf(prefix) == -1) {
			this.logtrace("[!!!!!!!!] no json for " + this.packetID + " in " + options.dir);
		}
	}

	if (!this.files) {
		this.files = [];
	}
	var mainFiles = Component.resolveFiles(options.dir, this.json.main);
	if (mainFiles.length > 0) {
		this.files = this.files.concat(mainFiles);
		this.logtrace("           file " + this.packetID);
		this.logtrace("           adding assets via `main` from " + this.packetID);
		this.dumpComplex(mainFiles, dumpPrefix, dumpCap, "assets by " + this.packetID);
	}

	if (options.includeFiles && this.json.files) {
		var filesFiles = Component.resolveFiles(options.dir, this.json.files);
		if (filesFiles.length > 0) {
			this.files = this.files.concat(filesFiles);
			this.logtrace("           adding assets via `files` from " + this.packetID);
			this.dumpComplex(filesFiles, dumpPrefix, dumpCap, "assets by " + this.packetID);
		}
	}

	var depLen = (this.json.dependencies) ? Object.keys(this.json.dependencies).length : 0;
	if (depLen > 0) {
		this.logtrace("[bower   ] adding packets via `dependencies` for " + this.packetID);
		this.dumpComplex(this.json.dependencies, dumpPrefix, dumpCap, "packets by " + this.packetID);
	}
	this.dependencies = getDependentComponents(this.json.dependencies, options);

	if (options.isRoot) {
		depLen = (this.json.devDependencies) ? Object.keys(this.json.devDependencies).length : 0;
		if (depLen > 0) {
			this.logtrace("[bower   ] adding packets via `devDependencies` for " + this.packetID);
			this.dumpComplex(this.json.devDependencies, dumpPrefix, dumpCap, "packets by " + this.packetID);
		}
		this.devDependencies = getDependentComponents(this.json.devDependencies, options);
	}

	var reqLen = (this.json.require) ? Object.keys(this.json.require).length : 0;
	if (reqLen > 0) {
		this.logtrace("[composer] adding packets via `require` for " + this.packetID);
		this.dumpComplex(this.json.require, dumpPrefix, dumpCap, "packets by " + this.packetID);
		var req = getDependentComponents(this.json.require, options);
		this.dependencies = this.dependencies.concat(req);
	}

	var me = this;

	this.dependencyMap = this.dependencies.map(function (dep) {
		return [me.name, dep.name];
	});

	if (Object.keys(this.dependencyMap).length == 0) {
		// make sure that I have a dependency
		this.dependencyMap.unshift([me.name, 'self']);
	}
}

/**
 *
 * @param dir
 * @param mainDef
 * @returns {Array}
 */
Component.resolveFiles = function resolveFiles(dir, mainDef) {
	if (!mainDef) {
		return [];
	}
	return globby.sync(arrify(mainDef), {cwd: dir}).map(function (file) {
		return path.resolve(dir, file);
	});
};

Component.prototype = {
	/**
	 * @param {Object} options
	 * @returns {Array} of Components
	 */
	getDependencies: function (options) {

		options = assign({
			self: false,
			dev: false,
			main: true
		}, options);

		var components = [];
		if (options.main) {
			components = components.concat(this.dependencies || []);
		}
		if (options.dev) {
			var devDependencies = this.devDependencies || [];
			components = options.dev === 'after'
				? components.concat(devDependencies)
				: devDependencies.concat(components);
		}

		var dependencies = components.reduce(function (deps, comp) {
			return deps.concat(comp.getDependencies({self: true}));
		}, []);
		if (options.self) {
			dependencies = dependencies.concat(this);
		}

		var uniqueDeps = dependencies.reduce(function (uniqueDeps, dep) {
			if (dep.name) {
				if (!uniqueDeps.hasOwnProperty(dep.name)) {
					uniqueDeps[dep.name] = dep;
				} else {
					uniqueDeps[dep.name].files = unique(uniqueDeps[dep.name].files.concat(dep.files))
				}
			}
			return uniqueDeps;
		}, {});

		var dependencyNames = Object.keys(uniqueDeps);

		this.logtrace('[req.for ] ' + this.filepath + " " + this.packetID);
		this.dumpComplex(dependencyNames, dumpPrefix, 100 + dumpCap, "dependency names");

		return Object.keys(uniqueDeps).map(function (key) {
			return uniqueDeps[key]
		});
	},

	logtrace: function (msg) {
		if (this.verbose) {
			console.log(msg);
		}
	},

	dumpComplex: function (complex, prefix, cap, label) {
		switch (typeof complex) {
			case "object":
				var len = Object.keys(complex).length;
				if (len < cap) {
					for (var key in complex) {
						if (complex.hasOwnProperty(key)) {
							this.dumpComplex(complex[key], prefix + key + ": ", cap - 1, label + "." + key);
						}
					}
				}
				else {
					this.logtrace(prefix + len + " " + label + " (Object)");
				}
				break;
			case "array":
				var len = complex.length;
				if (len < cap) {
					complex.forEach(
						function (value, key) {
							this.dumpComplex(value, prefix + key + ": ", cap - 1, label + "." + key);
						}
					);
				} else {
					this.logtrace(prefix + len + " " + label + " (Array)");
				}
				break;
			default:
				this.logtrace(prefix + complex);
				break;
		}
	}
};

/**
 * @param {Object} dependencies
 * @param {Object} options
 * @returns {Array} of Component
 */
function getDependentComponents(dependencies, options) {
	dependencies = dependencies || {};
	return Object.keys(dependencies).map(function (key) {
		return new Component(assign({}, options, {
			dir: path.resolve(options.dependencyDir, key),
			isRoot: false,
			verbose: options.verbose
		}));
	});
}

/**
 * @param {Object} options
 * @returns {Object}
 */
function normalizeOptions(options) {
	options = assign({
		dir: null,
		dependencyDir: null,
		json: 'bower.json',
		composerJson: 'composer.json',
		componentJson: '.bower.json',
		overrides: {},
		isRoot: false,
		includeFiles: true,
		verbose: false
	}, options);

	assert(
		isAbsolute(options.dir || ''),
		'options.dir must be absolute'
	);

	assert(
		isAbsolute(options.dependencyDir || ''),
		'options.dependencyDir must be absolute'
	);

	options.json = (options.isRoot)
		? options.componentJson
		: options.json;

	return options;
}