# @retailmenot/roux-sass-importer

A [node-sass custom importer][node-sass-custom-importer] for ingredients in the [Roux][Roux ecosystem].

[![Build Status](https://travis-ci.org/RetailMeNotSandbox/roux-sass-importer.svg?branch=master)](https://travis-ci.org/RetailMeNotSandbox/roux-sass-importer) [![Coverage Status](https://coveralls.io/repos/github/RetailMeNotSandbox/roux-sass-importer/badge.svg?branch=master)](https://coveralls.io/github/RetailMeNotSandbox/roux-sass-importer?branch=master)

## Installation

```sh
npm install @retailmenot/roux-sass-importer
```

## Usage

This importer makes it possible to import Sass from an ingredient by
specifying the pantry and ingredient name only:

```sass
@import "@namespace/pantry/an-ingredient";
@import "another-pantry/another-ingredient";
```

Create an importer and pass it to node-sass as follows:

```javascript
var sass = require('node-sass');
var rouxSassImporter = require('@retailmenot/roux-sass-importer');

var importer = rouxSassImporter({
  pantries: {
    '@namespace/pantry': somePantryInstance,
    // This will be initialized and cached across calls to the
    // importer
    '@namespace/pantry2': '/path/to/pantry2'
  },
  pantrySearchPaths: [
    path.resolve('node_modules'),
    path.resolve('some/other/path')
  ];
});

console.log(
  sass.render({
    file: 'path/to/your/file.scss',
    importer: importer
  })
);
```

## Relative `@import` paths

**An important note regarding how relative `@import` paths are resolved:**

If the import path can be parsed by `roux.parseIngredientPath`,
then the importer will try to look up the corresponding Sass entry point for
that ingredient by instantiating the pantry with `roux.initialize`.
If successful, the import path is resolved to the entry point, otherwise
an error is returned. This means that relative file system paths which look
like ingredient paths will not work.

Ideally, if we couldn't find the pantry in any of the `pantrySearchPaths`, we
would not return an error, but instead tell node-sass to resolve the import path
in the default manner. Unfortunately, this is not possible due to a
[bug][node-sass#1296] in either node-sass or libsass.

The upshot of this is that *relative paths should begin with `./` or `../`*.
These will never be parseable as ingredient paths, so they will be handed off to
node-sass to resolve.

## CSS De-duplicating

**An important note on deduping output in the CSS:**

The importer will keep track of which ingredient files have already been imported.
It will do so for imports matching an ingredient's entrypoint, as well as relative
imports from within any sass file inside of a known pantry. Whenever an import for
the same file is encountered, the importer will return empty file contents to
prevent duplicate CSS from showing up in the compiled output.

## API

This module exports a function that accepts an optional config object and
returns a [node-sass custom importer][node-sass-custom-importer]. The importer
only handles import paths matching the following patterns:

- `@<namespace>/<pantry>/<ingredient>`
- `<pantry>/<ingredient>`

If the import path matches one of the above, the importer attempts to look up
the Sass entry point for the named pantry and ingredient. If successful, an
absolute path to the entry point is returned (possibly asynchronously).

If the pantry is not found, an `Error` is returned. If the pantry is found but
does not contain the named ingredient, an `Error` is returned. If both the
pantry and ingredient are found but the ingredient does not have a Sass entry
point, an `Error` is returned.

The importer maintains a cache of pantries it looks up. The cache can be primed
by means of the optional `config.pantries` parameter. If the named pantry is
cached, the above process completes synchronously. If not cached, the pantry is
looked up in the locations named by `config.pantrySearchPaths`. The first
matching pantry found is cached and the above process performed.

- `NODE_SASS_NULL` -  The object to return when node-sass should do its
  thing. You should pass `require('node-sass').NULL` from your webpack
  config in the repo that's consuming this module.
- `config` - optional config object for the importer
- `config.pantries` - optional primed cache of pantries, defaults to `{}`
- `config.pantrySearchPaths` - optional array of paths to search for pantries
  not found in the cache, defaults to `['$CWD/node_modules']`

[Roux]:https://github.com/RetailMeNotSandbox/roux
[node-sass-custom-importer]: https://github.com/sass/node-sass#importer--v200---experimental
[node-sass#1296]: https://github.com/sass/node-sass/issues/1296
