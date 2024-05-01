const { DateTime } = require("luxon");
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginBundle = require("@11ty/eleventy-plugin-bundle");

const {EleventyI18nPlugin} = require('@11ty/eleventy');

module.exports = function (eleventyConfig) {
    // Copy the contents of the `public` folder to the output folder
	// For example, `./public/css/` ends up in `_site/css/`
	eleventyConfig.addPassthroughCopy({
		"./public/": "/public/"
    });

    eleventyConfig.addPlugin(syntaxHighlight);

    // CSS bundles are provided via the `eleventy-plugin-bundle` plugin:
    // 1. You can add to them using `{% css %}`
    // 2. You can get from them using `{% getBundle "css" %}` or `{% getBundleFileUrl "css" %}`
    // 3. You can do the same for JS: {% js %}{% endjs %} and <script>{% getBundle "js" %}</script>
    // 4. Learn more: https://github.com/11ty/eleventy-plugin-bundle
    eleventyConfig.addPlugin(pluginBundle);

    eleventyConfig.addPlugin(EleventyI18nPlugin, {
        defaultLanguage: 'zh', // Required
        errorMode: 'allow-fallback' // Opting out of "strict"
    });

    // Filters
	eleventyConfig.addFilter("readableDate", (dateObj, format, zone) => {
		// Formatting tokens for Luxon: https://moment.github.io/luxon/#/formatting?id=table-of-tokens
		return DateTime.fromJSDate(dateObj, { zone: zone || "utc" }).toFormat(format || "dd LLLL yyyy");
	});

	eleventyConfig.addFilter('htmlDateString', (dateObj) => {
		// dateObj input: https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#valid-date-string
		return DateTime.fromJSDate(dateObj, {zone: 'utc'}).toFormat('yyyy-LL-dd');
	});

    // Get the first `n` elements of a collection.
	eleventyConfig.addFilter("head", (array, n) => {
		if(!Array.isArray(array) || array.length === 0) {
			return [];
		}
		if( n < 0 ) {
			return array.slice(n);
		}

		return array.slice(0, n);
	});

    // Return the smallest number argument
	eleventyConfig.addFilter("min", (...numbers) => {
		return Math.min.apply(null, numbers);
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
