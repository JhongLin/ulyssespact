const {EleventyI18nPlugin} = require('@11ty/eleventy');

module.exports = function (eleventyConfig) {
    eleventyConfig.addPlugin(EleventyI18nPlugin, {
        defaultLanguage: 'en', // Required
        errorMode: 'allow-fallback' // Opting out of "strict"
    });

    return {
        dir: {
            input: 'src',
            includes: "../_includes",
            data: "../_data",
            output: '_site'
        },
        markdownTemplateEngine: 'njk',
        htmlTemplateEngine: 'njk'
    };
};
