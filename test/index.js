'use strict';

var _ = require('lodash');
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var rimraf = require('rimraf');
var sinon = require('sinon');
var tap = require('tap');
var touch = require('touch');
var sass = require('node-sass');

var NODE_SASS_NULL = 'NODE_SASS_NULL';
var rouxSassImporter = require('../');

var FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

var IMPORTING_PATH = '/path/to/importing/file.scss';

function scaffold(directory, config) {
	mkdirp.sync(directory);
	if (_.isArray(config)) {
		_.forEach(config, function (filename) {
			touch.sync(path.resolve(directory, filename));
		});
	} else if (_.isObject(config)) {
		_.forEach(config, function (v, k) {
			scaffold(path.resolve(directory, k), v);
		});
	}
}

tap.tearDown(function () {
	// remove all fixture pantries
	rimraf.sync(FIXTURES_DIR);
});

tap.test('exports a function', function (t) {
	t.autoend();

	t.ok(
		_.isFunction(rouxSassImporter), 'module.exports is a function');

	t.test('accepts a config object', function (t) {
		t.autoend();

		t.doesNotThrow(function () {
			rouxSassImporter(NODE_SASS_NULL);
		}, 'optional');

		_.forEach(
			[
				'',
				'foo',
				0,
				123
			],
			function (arg) {
				t.throws(function () {
					rouxSassImporter(NODE_SASS_NULL, arg);
				}, 'must be an object or undefined');
			});

		t.test('config.pantries', function (t) {
			t.autoend();

			_.forEach(
				[
					'',
					'foo',
					0,
					123
				],
				function (arg) {
					t.throws(function () {
						rouxSassImporter(NODE_SASS_NULL, {
							pantries: arg
						});
					}, 'must be an object or undefined');
				});
		});

		t.test('config.pantrySearchPaths', function (t) {
			t.autoend();

			_.forEach(
				[
					'',
					'foo',
					0,
					123,
					{},
					new Date(),
					function () {}
				],
				function (arg) {
					t.throws(function () {
						rouxSassImporter(NODE_SASS_NULL, {
							pantrySearchPaths: arg
						});
					}, 'must be an array or undefined');
				});

			t.test('defaults to `["$CWD/node_modules"]`', function (t) {
				var nodeModulesPath = path.resolve('node_modules');

				scaffold(nodeModulesPath, {
					pantry: {
						ingredient: ['ingredient.md', 'index.scss']
					}
				});

				var config = {
					pantries: {}
				};
				var importer = rouxSassImporter(NODE_SASS_NULL, config).bind({});

				var original = 'pantry/ingredient';
				var expected = path.resolve(
					nodeModulesPath,
					'pantry',
					'ingredient',
					'index.scss'
				);
				var doneFn = function (result) {
					rimraf.sync(path.resolve(nodeModulesPath, 'pantry'));

					t.same(result, {
						file: expected
					}, 'the pantry is found in $CWD/node_modules');

					t.end();
				};

				importer(original, original, doneFn);
			});
		});
	});
});

tap.test('absolute paths are not handled', function (t) {
	t.autoend();

	var url = '/some/absolute/path';
	var doneFn = sinon.spy();

	var importer = rouxSassImporter(NODE_SASS_NULL, {}).bind({});

	t.same(
		importer(url, IMPORTING_PATH, doneFn),
		NODE_SASS_NULL,
		'`NODE_SASS_NULL` is returned synchronously'
	);

	t.notOk(doneFn.called, 'the function passed as `done` is not called');
});

tap.test('throws if NODE_SASS_NULL argument is omitted', function (t) {
	t.autoend();

	var url = '/some/absolute/path';
	var doneFn = sinon.spy();

	var importer = rouxSassImporter.bind();
	t.throws(
		importer,
		'Throws if no arguments passed.'
	);
});


tap.test('returns whatever NODE_SASS_NULL it is passed', function (t) {
	t.autoend();

	var url = '/some/absolute/path';
	var doneFn = sinon.spy();

	var importer = rouxSassImporter('NODE_SASS_NULL_OVERRIDE', {}).bind({});

	t.same(
		importer(url, IMPORTING_PATH, doneFn),
		'NODE_SASS_NULL_OVERRIDE',
		'`NODE_SASS_NULL_OVERRIDE` is returned synchronously'
	);
});

tap.test('relative paths are returned unchanged', function (t) {
	t.autoend();

	var url = '../some/other/relative/path';
	var doneFn = sinon.spy();

	var importer = rouxSassImporter(NODE_SASS_NULL, {}).bind({});

	t.same(
		importer(url, IMPORTING_PATH, doneFn),
		NODE_SASS_NULL,
		'`NODE_SASS_NULL` is returned synchronously'
	);

	t.notOk(doneFn.called, 'the function passed as `done` is not called');
});

tap.test('paths like `pantry/ingredient`', function (t) {
	t.autoend();

	t.test('are rewritten synchronously if cached', function (t) {
		t.autoend();

		var mockPantry = {
			ingredients: {
				ingredient: {
					name: 'ingredient',
					path: '/path/to/pantry/ingredient',
					entryPoints: {
						sass: {
							filename: 'index.scss'
						}
					}
				}
			}
		};
		var importer = rouxSassImporter(NODE_SASS_NULL, {
			pantries: {
				pantry: mockPantry
			}
		} ).bind({});

		var original = 'pantry/ingredient';
		var expected = path.join(
			mockPantry.ingredients.ingredient.path,
			mockPantry.ingredients.ingredient.entryPoints.sass.filename
		);
		var doneFn = sinon.spy();

		t.same(importer(original, IMPORTING_PATH, doneFn), {
			file: expected
		}, 'the path to the Sass entry point is returned synchronously');

		t.notOk(doneFn.called, 'the function passed as `done` is not called');
	});

	t.test('are resolved asynchronously if not cached', function (t) {
		t.autoend();

		t.test('Error returned if pantry not found', function (t) {
			scaffold(FIXTURES_DIR, {
				pantry: {
					ingredient: ['ingredient.md', 'index.scss']
				}
			});
			var config = {
				pantries: {},
				pantrySearchPaths: [FIXTURES_DIR]
			};
			var importer = rouxSassImporter(NODE_SASS_NULL, config).bind({});

			var original = 'not-a-pantry/ingredient';
			var doneFn = function (result) {
				t.type(result, Error, 'an Error is returned');
				t.end();
			};

			var returnValue = importer(original, IMPORTING_PATH, doneFn);
			t.equal(
				returnValue,
				undefined,
				'nothing is returned'
			);
		});

		t.test('path rewritten if pantry found', function (t) {
			scaffold(FIXTURES_DIR, {
				pantry: {
					ingredient: ['ingredient.md', 'index.scss']
				}
			});
			var config = {
				pantries: {},
				pantrySearchPaths: [FIXTURES_DIR]
			};
			var importer = rouxSassImporter(NODE_SASS_NULL, config).bind({});

			var original = 'pantry/ingredient';
			var expected = path.resolve(
				FIXTURES_DIR,
				'pantry',
				'ingredient',
				'index.scss'
			);
			var doneFn = function (result) {
				t.same(result, {
					file: expected
				}, 'the path to the Sass entry point is returned asynchronously');

				t.end();
			};

			var returnValue = importer(original, IMPORTING_PATH, doneFn);
			t.equal(
				returnValue,
				undefined,
				'nothing is returned'
			);
		});

		t.test('empty file returned on second ingredient import', function (t) {
			scaffold(FIXTURES_DIR, {
				pantry: {
					ingredient: ['ingredient.md', 'index.scss']
				}
			});
			var config = {
				pantries: {},
				pantrySearchPaths: [FIXTURES_DIR]
			};
			var importer = rouxSassImporter(NODE_SASS_NULL, config).bind({});

			var toImport = 'pantry/ingredient';
			var expected = path.resolve(
				FIXTURES_DIR,
				'pantry',
				'ingredient',
				'index.scss'
			);
			var doneFn = function (result) {
				t.same(
					result,
					{
						file: expected
					},
					'the path to the Sass entry point is returned asynchronously'
				);
				var doneSpyFn = sinon.spy();
				t.same(
					importer(toImport, IMPORTING_PATH, doneSpyFn),
					{
						contents: ''
					},
					'empty contents are returned on the second call to the importer'
				);

				t.notOk(
					doneSpyFn.called, 'the function passed as `done` is not called'
				);
				t.end();
			};

			importer(toImport, IMPORTING_PATH, doneFn);
		});
	});
});

tap.test('paths like `@namespace/pantry/ingredient`', function (t) {
	t.autoend();

	t.test('are rewritten synchronously if cached', function (t) {
		t.autoend();

		var mockPantry = {
			ingredients: {
				ingredient: {
					name: 'ingredient',
					path: '/path/to/@namespace/pantry/ingredient',
					entryPoints: {
						sass: {
							filename: 'index.scss'
						}
					}
				}
			}
		};
		var importer = rouxSassImporter(NODE_SASS_NULL, {
			pantries: {
				'@namespace/pantry': mockPantry
			}
		}).bind({});

		var original = '@namespace/pantry/ingredient';
		var expected = path.join(
			mockPantry.ingredients.ingredient.path,
			mockPantry.ingredients.ingredient.entryPoints.sass.filename
		);
		var doneFn = sinon.spy();

		t.same(importer(original, IMPORTING_PATH, doneFn), {
			file: expected
		}, 'the path to the Sass entry point is returned synchronously');

		t.notOk(doneFn.called, 'the function passed as `done` is not called');
	});

	t.test('are resolved asynchronously if not cached', function (t) {
		t.autoend();

		t.test('path unchanged if pantry not found', function (t) {
			scaffold(FIXTURES_DIR, {
				pantry: {
					ingredient: ['ingredient.md', 'index.scss']
				}
			});
			var config = {
				pantries: {},
				pantrySearchPaths: [FIXTURES_DIR]
			};
			var importer = rouxSassImporter(NODE_SASS_NULL, config).bind({});

			var original = '@namespace/not-a-pantry/ingredient';
			var doneFn = function (result) {
				t.type(result, Error, 'an Error is returned');
				t.end();
			};

			var returnValue = importer(original, IMPORTING_PATH, doneFn);
			t.equal(
				returnValue,
				undefined,
				'nothing is returned'
			);
		});

		t.test('path rewritten if pantry found', function (t) {
			scaffold(FIXTURES_DIR, {
				'@namespace': {
					pantry: {
						ingredient: ['ingredient.md', 'index.scss']
					}
				}
			});
			var config = {
				pantries: {},
				pantrySearchPaths: [FIXTURES_DIR]
			};
			var importer = rouxSassImporter(NODE_SASS_NULL, config).bind({});

			var original = '@namespace/pantry/ingredient';
			var expected = path.resolve(
				FIXTURES_DIR,
				'@namespace/pantry',
				'ingredient',
				'index.scss'
			);
			var doneFn = function (result) {
				t.same(result, {
					file: expected
				}, 'the path to the Sass entry point is returned asynchronously');

				t.end();
			};

			var returnValue = importer(original, IMPORTING_PATH, doneFn);
			t.equal(
				returnValue,
				undefined,
				'nothing is returned'
			);
		});

		t.test('pantry cached if found', function (t) {
			scaffold(FIXTURES_DIR, {
				'@namespace': {
					pantry: {
						ingredient: ['ingredient.md', 'index.scss']
					}
				}
			});
			var config = {
				pantries: {},
				pantrySearchPaths: [FIXTURES_DIR]
			};
			var importer = rouxSassImporter(NODE_SASS_NULL, config).bind({});

			var original = '@namespace/pantry/ingredient';
			var expected = path.resolve(
				FIXTURES_DIR,
				'@namespace/pantry',
				'ingredient',
				'index.scss'
			);
			var doneFn = function (result) {
				t.same(result, {
					file: expected
				}, 'the path to the Sass entry point is returned asynchronously');
				var doneSpyFn = sinon.spy();
				t.same(
					importer(original, IMPORTING_PATH, doneSpyFn),
					{
						contents: ''
					},
					'returns an empty file synchronously the 2nd time a file is imported'
				);

				t.notOk(
					doneSpyFn.called, 'the function passed as `done` is not called');
				t.end();
			};

			importer(original, original, doneFn);
		});
	});
});

tap.test('node-sass integration', function (t) {
	var nodeModulesPath = path.resolve('node_modules');
	var content = {
		'node_modules/npm-pantry/ingredient/index.scss': [
			'/* node_modules/npm-pantry/ingredient/index.scss */',
			'@import "./relative-import.scss";'
		].join('\n'),
		'node_modules/npm-pantry/ingredient/relative-import.scss':
			'/* node_modules/npm-pantry/ingredient/relative-import.scss */\n',
		'node_modules/@rmn/another-npm-pantry/ingredient/index.scss':
			'/* node_modules/@rmn/another-npm-pantry/ingredient/index.scss */\n',
		'FIXTURES_DIR/pantry/ingredient/index.scss':
			'/* FIXTURES_DIR/pantry/ingredient/index.scss */\n',
		'FIXTURES_DIR/@namespace/pantry/ingredient/index.scss':
			'/* FIXTURES_DIR/@namespace/pantry/ingredient/index.scss */\n',
		'cached-pantry/ingredient/index.scss':
			'/* cached-pantry/ingredient/index.scss */\n',
		'@namespace/cached-pantry/ingredient/index.scss':
			'/* @namespace/cached-pantry/ingredient/index.scss */\n'
	};

	scaffold(nodeModulesPath, {
		'npm-pantry': {
			ingredient: ['ingredient.md', 'index.scss']
		},
		'@rmn': {
			'another-npm-pantry': {
				ingredient: ['ingredient.md', 'index.scss']
			}
		}
	});
	fs.writeFileSync(
		path.resolve(nodeModulesPath, 'npm-pantry', 'ingredient', 'index.scss'),
		content['node_modules/npm-pantry/ingredient/index.scss']
	);
	fs.writeFileSync(
		path.resolve(
			nodeModulesPath, 'npm-pantry', 'ingredient', 'relative-import.scss'
		),
		content['node_modules/npm-pantry/ingredient/relative-import.scss']
	);
	fs.writeFileSync(
		path.resolve(
			nodeModulesPath, '@rmn/another-npm-pantry', 'ingredient', 'index.scss'
		),
		content['node_modules/@rmn/another-npm-pantry/ingredient/index.scss']
	);

	scaffold(FIXTURES_DIR, {
		pantry: {
			ingredient: ['ingredient.md', 'index.scss']
		},
		'@namespace': {
			pantry: {
				ingredient: ['ingredient.md', 'index.scss']
			}
		},
		cached: {
			pantry: {
				ingredient: ['ingredient.md', 'index.scss']
			},
			'@namespace': {
				pantry: {
					ingredient: ['ingredient.md', 'index.scss']
				}
			}
		}
	});
	fs.writeFileSync(
		path.resolve(
			FIXTURES_DIR, 'pantry', 'ingredient', 'index.scss'
		),
		content['FIXTURES_DIR/pantry/ingredient/index.scss']
	);
	fs.writeFileSync(
		path.resolve(
			FIXTURES_DIR, '@namespace/pantry', 'ingredient', 'index.scss'
		),
		content['FIXTURES_DIR/@namespace/pantry/ingredient/index.scss']
	);
	fs.writeFileSync(
		path.resolve(
			FIXTURES_DIR, 'cached', 'pantry', 'ingredient', 'index.scss'
		),
		content['cached-pantry/ingredient/index.scss']
	);
	fs.writeFileSync(
		path.resolve(
			FIXTURES_DIR, 'cached', '@namespace/pantry', 'ingredient', 'index.scss'
		),
		content['@namespace/cached-pantry/ingredient/index.scss']
	);

	var importer = rouxSassImporter(NODE_SASS_NULL, {
		pantries: {
			'cached-pantry': {
				ingredients: {
					ingredient: {
						name: 'ingredient',
						path: path.resolve(
							FIXTURES_DIR, 'cached', 'pantry', 'ingredient'
						),
						entryPoints: {
							sass: {
								filename: 'index.scss'
							}
						}
					}
				}
			},
			'@namespace/cached-pantry': {
				ingredients: {
					ingredient: {
						name: 'ingredient',
						path: path.resolve(
							FIXTURES_DIR, 'cached', '@namespace/pantry', 'ingredient'
						),
						entryPoints: {
							sass: {
								filename: 'index.scss'
							}
						}
					}
				}
			}
		},
		pantrySearchPaths: [
			nodeModulesPath,
			FIXTURES_DIR
		]
	}).bind({});
	var expected =
		content['node_modules/npm-pantry/ingredient/index.scss'].split('\n')[0] +
		 '\n' +
		content['node_modules/npm-pantry/ingredient/relative-import.scss'] +
		content['node_modules/@rmn/another-npm-pantry/ingredient/index.scss'] +
		content['FIXTURES_DIR/pantry/ingredient/index.scss'] +
		content['FIXTURES_DIR/@namespace/pantry/ingredient/index.scss'] +
		content['cached-pantry/ingredient/index.scss'] +
		content['@namespace/cached-pantry/ingredient/index.scss'];

	sass.render({
		file: null,
		data: [
			'@import "npm-pantry/ingredient";',
			'@import "@rmn/another-npm-pantry/ingredient";',
			'@import "pantry/ingredient";',
			'@import "@namespace/pantry/ingredient";',
			'@import "cached-pantry/ingredient";',
			'@import "@namespace/cached-pantry/ingredient";',
		].join('\n'),
		importer: importer
	}, function (err, result) {
		rimraf.sync(path.resolve(nodeModulesPath, 'pantry'));
		rimraf.sync(FIXTURES_DIR);

		if (err) {
			throw err;
		}

		t.equal(result.css.toString(), expected);
		t.end();
	});
});
