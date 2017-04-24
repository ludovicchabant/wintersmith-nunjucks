var nunjucks = require("nunjucks");
var path = require("path");

module.exports = function(env, callback) {

  // Load the new nunjucks environment.
  var loaderOpts = {
    watch: (env.mode == 'preview')
  };
  var loader = new nunjucks.FileSystemLoader(env.templatesPath, loaderOpts);
  var nenv = new nunjucks.Environment(loader);

  // Load the filters
  if(env.config.nunjucks && env.config.nunjucks.filterdir) {
    env.config.nunjucks.filters.map( function (name) {
      file = path.join(env.config.nunjucks.filterdir, name + ".js");
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
    install_ctx = {};   // Nothing for now, but can add stuff later without
                        // breaking APIs.
    env.config.nunjucks.plugins.map( function (name) {
      file = path.join(env.config.nunjucks.plugindir, name + ".js");
      plugin = env.loadModule(env.resolvePath(file), true);
      plugin.install(nenv, install_ctx);
    });
  }

  // Configure nunjucks environment.
  if (env.config.nunjucks && env.config.nunjucks.autoescape != null) {
    nenv.opts.autoescape = env.config.nunjucks.autoescape;
  }

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
  callback();
};
