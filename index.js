var _ = require("underscore");
var async = require("async");
var console = require("console");
var fs = require("fs");
var nunjucks = require("nunjucks");
var path = require("path");

module.exports = function(env, done_init) {
  "use strict";

  // Custom Nunjucks loaders.
  var NunjucksStringLoader = nunjucks.Loader.extend({
    init: function() {
      this.path = null;
      this.content = null;
    },

    getSource: function(name) {
      if (this.path && name === '$') {
        return {
          path: this.path,
          src: this.content
        };
      }
      return null;
    },

    setString: function(path, content) {
      this.path = path;
      this.content = content;
      // Bust Nunjucks' internal cache for this template.
      this.emit('update', '$');
    }
  });

  // Load the new nunjucks environment.
  var loaderOpts = {
    watch: (env.mode == 'preview')
  };
  var loaders = [
    new NunjucksStringLoader(),
    new nunjucks.FileSystemLoader(env.templatesPath, loaderOpts)
  ];
  var nenv = new nunjucks.Environment(loaders);

  // Load the filters
  if(env.config.nunjucks && env.config.nunjucks.filterdir) {
    env.config.nunjucks.filters.map( function (name) {
      var file = path.join(env.config.nunjucks.filterdir, name + ".js");
      filter = env.loadModule(env.resolvePath(file), true);
      nenv.addFilter(name, filter);
    });
  }
  if(env.config.nunjucks && env.config.nunjucks.filtermodules) {
    env.config.nunjucks.filtermodules.map( function (name) {
      var filter = require(name);
      filter.install(nenv);
    });
  }

  // Load custom plugins
  if(env.config.nunjucks && env.config.nunjucks.plugindir) {
    var install_ctx = {};   // Nothing for now, but can add stuff later without
                            // breaking APIs.
    env.config.nunjucks.plugins.map( function (name) {
      var file = path.join(env.config.nunjucks.plugindir, name + ".js");
      var plugin = env.loadModule(env.resolvePath(file), true);
      plugin.install(nenv, install_ctx);
    });
  }

  // Configure nunjucks environment.
  if (env.config.nunjucks && env.config.nunjucks.autoescape != null) {
    nenv.opts.autoescape = env.config.nunjucks.autoescape;
  }


  // Template plugin.
  var NunjucksTemplate = function(template) {
    this.template = template;
  };

  NunjucksTemplate.prototype.render = function render(locals, callback) {
    try {
      callback(null, new Buffer(this.template.render(locals)));
    } catch (error) {
      callback(error);
    }
  };

  NunjucksTemplate.fromFile = function fromFile(filepath, callback) {
    callback(null, new NunjucksTemplate(nenv.getTemplate(filepath.relative)));
  };

  env.registerTemplatePlugin("**/*.*(html|nunjucks)", NunjucksTemplate);


  // Content plugin.
  if (env.config.nunjucks && env.config.nunjucks.enable_content) {
    class NunjucksContent extends env.plugins.MarkdownPage {
      constructor(filepath, metadata, markdown) {
        super(filepath, metadata, markdown);
      }
      
      getFilename() {
        return this.filepath.relative.replace(/(md|nunjucks)$/, 'html');
      }
    }

    NunjucksContent.fromFile = function(filepath, callback) {
      return async.waterfall([
        function(next) {
          fs.readFile(filepath.full, next);
        },
        function(buffer, next) {
          env.plugins.MarkdownPage.extractMetadata(buffer.toString(), next);
        },
        function(result, next) {
          nenv.loaders[0].setString(filepath, result.markdown);
          try {
            var tpl = nenv.getTemplate('$');
            var ctx = {};
            _.extend(ctx, env.config.locals, {page: result.metadata, env: env});
            var markdown = tpl.render(ctx);
            next(null, new NunjucksContent(filepath, result.metadata, markdown));
          }
          catch (e) {
            next(e);
          }
        }
      ], callback);
    };

    env.registerContentPlugin('pages', "**/*.*(md|html|nunjucks)", NunjucksContent);
  }


  // We're done!
  console.log("  loaded Nunjucks plugin");
  return done_init();
};
