'use strict';

module.exports = function (grunt) {
	grunt.initConfig({
		eslint: {
			src: ['./']
		}
	});

	grunt.loadNpmTasks('gruntify-eslint');
};
