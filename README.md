# bower-files

Please use the original [bower-files by ksmithut](https://github.com/ksmithut/bower-files)!

This fork is missing test cases and just an idea for a potential rewrite.

## changelog

### 2017-01-04

Fixed options.verbose=false so you can turn off verbose info while parsing the packages. 

### 2016-08-03

Working on the `Component` class:

- Added support for `files` in addition to `main`. (related to [ksmithut/bower-files/issues/69](https://github.com/ksmithut/bower-files/issues/69), [bower/spec/issues/43](https://github.com/bower/spec/issues/43) and [bower/spec/issues/47](https://github.com/bower/spec/issues/47))
- Added support for `composer.json` files in addition to `bower.json` and `.bower.json`.
- Added support for `require` and `require-dev` in addition to `dependencies` and `devDependencies`.
