'use strict';
var _ = require('lodash');
var path = require('path');
var pathParse = require('path-parse');
var roux = require('@retailmenot/roux');
var Pantry = require('@retailmenot/roux/lib/pantry');
var sass = require('node-sass');
var util = require('util');

function importOnce(importCache, value) {
	if (importCache[value.file]) {
		return {
			contents: ''
		};
	}
	importCache[value.file] = true;
	return value;
};

function getImportPath(importCache, pantry, ingredientName) {
	var ingredient = pantry.ingredients[ingredientName];
	if (!ingredient) {
		return new Error(
			util.format('No such ingredient "%s/%s"', pantry.name, ingredientName));
	}

	if (!ingredient.entryPoints.sass) {
		return new Error(
			util.format(
				'"%s/%s" has no Sass entry point', pantry.name, ingredientName
			)
		);
	}

	return importOnce(importCache, {
		file: path.resolve(ingredient.path, ingredient.entryPoints.sass.filename)
	});
}

/**
 * Get a node-sass custom importer[1] with the provided configuration
 *
 * The importer returns `sass.NULL` unless it matches one of the following
 * patterns:
 *
 * - @<namespace>/<pantry>/<ingredient>
 * - <pantry>/<ingredient>
 *
 * If the value of `url` matches one of the above, the importer attempts to
 * look up the Sass entry point for the named pantry and ingredient. If
 * successful, an absolute path to the entry point is returned (possibly
 * asynchronously).
 *
 * If the pantry is not found, an `Error` is returned. If the pantry is found
 * but does not contain the named ingredient, an `Error` is returned. If both
 * the pantry and ingredient are found but the ingredient does not have a Sass
 * entry point, an `Error` is returned.
 *
 * The importer caches pantries it looks up. The cache can be primed by means of
 * the optional `config.pantries` parameter. If the named pantry is cached,
 * the above process completes synchronously. If not cached, the pantry is
 * looked up in the locations named by `config.pantrySearchPaths`. The first
 * matching pantry found is cached and the above process performed.
 *
 * @param {Object} [config] - the importer configuration
 * @param {Object} [config.pantries] - the cache of pantries to use, defaults to
 *   `{}`. Should be {name:pantry} mappings. If pantry is a string, it will be
 *   passed to `@retailmenot/roux.initialize` and cached across calls
 *   to the importer.
 * @param {string[]} [config.pantrySearchPaths=['$CWD/node_modules'] - the paths
 *   to search for pantries in if not found in the cache
 *
 * [1]: https://github.com/sass/node-sass#importer--v200---experimental
 */
module.exports = function (config) {
	config = roux.normalizeConfig(config);
	config.pantries = _.mapValues(config.pantries, function (pantry, name) {
		if (_.isString(pantry)) {
			return roux.initialize({
				name: name,
				path: pantry
			}, config);
		}
		return pantry;
	});

	/**
	 * node-sass custom importer[1] for ingredients in the Roux ecosystem.
	 *
	 * The importer will use `this` to store a cache of ingredient paths
	 * that it has already resolved, and return an empty string as the file's
	 * contents in cases where the file has already returned the file. This will
	 * effectively deduplicate the sass output.
	 *
	 * `node-sass` will:
	 *
	 * @param {Object} config - the importer configuration
	 * @param {Object} config.pantries - the cache of pantries to use
	 * @param {string[]} config.pantrySearchPaths - the paths to search for
	 *   pantries in if not found in the cache
	 * @param {string} url - the original import path (provided by node-sass: see
	 *   [1])
	 * @param {string} prev - the absolute path to the file importing `url`
	 *   (provided by node-sass: see [1])
	 * @param {function} done - a callback function to invoke on async completion
	 *   (provided by node-sass: see [1])
	 *
	 * [1]: https://github.com/sass/node-sass#importer--v200---experimental
	 */
	return function Importer(url, prev, done) {
		var pantry;
		this._rouxImportOnceCache = this._rouxImportOnceCache || {};

		// If we are being asked to resolve a relative url, we want to let
		// the sass importer do its thing by returning sass.NULL, however
		// if that relative URL refers to a file that is a child of a pantry,
		// then we want to add it to this._rouxImportOnceCache, and prevent it from
		// showing up in the output if we encounter an @import for that
		// same file again. To do this, we resolve the relative `url` with
		// respect to `prev` and if the resolved fully qualified URL is a child
		// of one of the pantries in config.pantries, we apply our caching logic.
		if (url.charAt(0) === '.') {
			var baseDir = pathParse(prev).dir;

			// this will lack the .scss extension so it does not necessarily
			// map to a file on the filesystem
			var absoluteImportUrl = path.resolve(baseDir, url);

			// Check our pantries to see if the @import is refering to one of its
			// children. If so, apply caching logic and return as appropriate.
			var pantries = Object.keys(config.pantries);
			for (var i = 0; i < pantries.length; ++i) {
				pantry = config.pantries[pantries[i]];
				if (!Pantry.isPantry(pantry)) {
					continue;
				}

				// Figure out where it lives
				var absolutePantryUrl = path.resolve(pantry.path);

				// If the import is a child of the pantry, apply our caching logic
				if (absoluteImportUrl.indexOf(absolutePantryUrl) === 0) {
					return this._rouxImportOnceCache[absoluteImportUrl] === true ?
						{
							contents: ''
						} :
						sass.NULL;
				}
			}
		}

		var parsedPath = roux.parseIngredientPath(url);

		if (parsedPath == null) {
			// url was not a valid ingredient name, so pass the @import path
			// along unmodified
			return sass.NULL;
		}

		pantry = config.pantries[parsedPath.pantry];

		// There are three posibilities:
		// 1. The pantry already exists and is initialized
		// 2. The pantry is a promise that will resolve to the initialized pantry
		// 3. The pantry is completely undefined
		// This if block handles cases (2, 3)
		if (!pantry || (pantry && _.isFunction(pantry.then))) {
			// The promise that will ultimately resolve to a pantry
			// is either the pantry (case 2), which is already a promise,
			// or the promise returned by calling roux.resolve (case 3).
			(pantry || roux.resolve(parsedPath.pantry, config))
				.then(function (pantry) {
					config.pantries[parsedPath.pantry] = pantry;
					done(
						getImportPath(
							this._rouxImportOnceCache,
							pantry,
							parsedPath.ingredient
						)
					);
				}.bind(this))
				.catch(function (errs) {
					var err = new Error(util.format('Failed to resolve %s', url));
					err.errors = errs;
					done(err);
				});

			return undefined;
		}

		return getImportPath(
			this._rouxImportOnceCache,
			pantry,
			parsedPath.ingredient
		);
	};
};
