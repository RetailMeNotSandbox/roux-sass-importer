'use strict';

module.exports = function (grunt) {
	grunt.initConfig({
		eslint: {
			lint: {
				src: ['./']
			},
			fix: {
				options: {
					fix: true
				},
				src: ['./']
			}
		}
	});

	grunt.loadNpmTasks('gruntify-eslint');
};
