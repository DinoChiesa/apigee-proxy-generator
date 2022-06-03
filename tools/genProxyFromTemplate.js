#! /usr/local/bin/node
// Copyright 2017-2022 Google LLC.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// last saved: <2022-June-03 13:16:04>
/* jshint node:true, esversion: 9, strict: implied */

// genProxyFromTemplate.js
// ------------------------------------------------------------------
//
// generate a new proxy from a template and optionally import it into Apigee,
// and optionally deploy it.
//

const apigeejs = require('apigee-edge-js'),
      archiver = require('archiver'),
      lodash   = require('lodash'),
      Getopt   = require('node-getopt'),
      sprintf  = require('sprintf-js').sprintf,
      tmp      = require('tmp-promise'),
      util     = require('util'),
      fs       = require('fs'),
      path     = require('path'),
      common   = apigeejs.utility,
      apigee   = apigeejs.apigee,
      version  = '20220603-1311',
      getopt   = new Getopt(common.commonOptions.concat([
        ['d' , 'source=ARG', 'required. source directory for the proxy template files. This should have a child dir "apiproxy" or "sharedflowbundle"'],
        ['e' , 'env=ARG', 'optional. the Apigee environment(s) to which to deploy the asset. Separate multiple environments with a comma.'],
        ['' , 'generateonly', 'optional. tells the tool to just generate the proxy, don\'t import or deploy.'],
        ['' , 'config=ARG', 'required. the configuration data for the template.'],
        ['' , 'serviceaccount=ARG', 'required. the service account to use at deployment time.']
      ])).bindHelp();

  lodash.templateSettings = {
        evaluate:    /\{\{([\s\S]+?)\}\}/g,
        interpolate: /\{\{=(.+?)\}\}/g,
        escape:      /\{\{-(.+?)\}\}/g
  };

let config = {};

/**
 * recursive copy, with a hook.
 * @param {string} src  The path to the thing to copy.
 * @param {string} dest The path to the new copy.
 * @param {func} upcall an optional function to call on each destination file after copy
 */
const copyRecursiveSync = (src, dest, upcall) => {
        let exists = fs.existsSync(src),
            stats = exists && fs.lstatSync(src),
            isDirectory = exists && stats.isDirectory();
        if (isDirectory) {
          if ( !fs.existsSync(dest) ) {
            fs.mkdirSync(dest);
          }
          fs.readdirSync(src)
            .forEach(item =>
                     copyRecursiveSync(path.join(src, item), path.join(dest, item), upcall) );
        } else if ( ! src.endsWith('~') && ! src.startsWith('#')) {
          fs.copyFileSync(src, dest);
          if (upcall) { upcall(dest); }
        }
      };

/**
return a function that maps a file to another file - evaluating the file as a
lodash template. The returned fn gets called once on each file, after it has
been copied.
**/
const getTemplateTransformer = (config) => (sourceFilename) => {
        let template = lodash.template(
                           fs.readFileSync(sourceFilename, 'utf8'),
                           {imports: {path, fs, lodash, sourceFilename}});
        fs.writeFileSync(sourceFilename, template(config));
        // conditionally rename the toplevel proxy xml file
        let match = new RegExp('^(.+/apiproxy/)([^/]+\\.xml)$').exec(sourceFilename);
        if (match) {
          let newname = match[1] + config.proxyname + '.xml';
          fs.renameSync(sourceFilename, newname);
        }
      };

function walkDirectory(dir, done) {
  let results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    var i = 0;
    (function next() {
      var file = list[i++];
      if (!file) return done(null, results);
      file = dir + '/' + file;
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walkDirectory(file, function(err, res) {
            results = results.concat(res);
            next();
          });
        } else {
          results.push(file);
          next();
        }
      });
    })();
  });
}

function produceBundleZip(sourcePath, templateName) {
  let assetType = 'apiproxy';

  return new Promise( (resolve, reject) => {
    let time = (new Date()).toString(),
        tstr = time.substr(11, 4) +
        time.substr(4, 3) + time.substr(8, 2) + 'T' +
        time.substr(16, 8).replace(/:/g, ''),
        archiveName = path.join('./', `${assetType}-${templateName}-${tstr}.zip`),
        outs = fs.createWriteStream(archiveName),
        archive = archiver('zip');

    outs.on('close', () => resolve(archiveName));

    archive.on('error', (e) => reject({error:e, archiveName}));
    archive.pipe(outs);

    walkDirectory(sourcePath, function(e, results) {
      results.forEach(filename => {
        let shortName = filename.replace(sourcePath, '');
        archive.append(fs.createReadStream(filename), { name: shortName });
      });
      archive.finalize();
    });
  });
}

function getConfig(filename) {
  let rawContents = fs.readFileSync(filename, 'utf8');
  let re1 = new RegExp('{{= env\\.([^}]+)}}', 'g');
  let match;
  let missingEnv = [];
  while ((match = re1.exec(rawContents))) {
    let envVar = match[1];
    if ( ! process.env[envVar]) {
      missingEnv.push(envVar);
    }
  }

  if (missingEnv.length) {
    throw new Error(`Your configuration refers to one or more undefined environment variables: ${JSON.stringify(missingEnv)}`);
  }

  let template = lodash.template(rawContents, {imports: {path, fs, lodash}});

  let config = JSON.parse(template({ env: process.env })); // array of key/value pairs to be used later
  return {...config, ...process.env};
}

// ========================================================

console.log(
  `Apigee facade proxy generator tool, version: ${version}\nNode.js ${process.version}\n`);

process.on('unhandledRejection',
            r => console.log('\n*** unhandled promise rejection: ' + util.format(r)));

common.logWrite('start');

var opt = getopt.parse(process.argv.slice(2));

config = getConfig(opt.options.config);

if ( ! config.proxyname || !config.basepath /* ... */) {
  console.log('The configuration must specify a proxyname and a basepath.');
  getopt.showHelp();
  process.exit(1);
}

return tmp.dir({unsafeCleanup:true, prefix: 'genproxy'})
  .then(d => {
    // copy the template dir, and for each file, evaluate as a template with the config data
    copyRecursiveSync(opt.options.source, d.path, getTemplateTransformer(config));
    if (opt.options.generateonly) {
      // d.path is the destination path of the generated proxy, the output of the template
      return produceBundleZip(d.path, path.basename(opt.options.source).replace('-template', ''))
        .then(a => common.logWrite(`generated: ${a}`));
    }

    common.verifyCommonRequiredParameters(opt.options, getopt);

    if ( !opt.options.source ) {
      console.log('You must specify a source directory');
      getopt.showHelp();
      return Promise.resolve(1);
    }

    if ( !opt.options.serviceaccount ) {
      console.log('You must specify a service account ID.');
      getopt.showHelp();
      return Promise.resolve(1);
    }

    if ( !opt.options.config ) {
      console.log('You must specify a configuration file.');
      getopt.showHelp();
      return Promise.resolve(1);
    }

    return apigee
      .connect(common.optToOptions(opt))
      .then( org => {
        common.logWrite('connected');
        common.logWrite('importing the generated proxy bundle');

        return org.proxies.import({name:config.proxyname, source: d.path})
          .then( result => {
            common.logWrite(sprintf('import ok. proxy name: %s r%d', result.name, result.revision));
            let env = opt.options.env || process.env.ENV;
            if (env) {
              let deployOptions = {
                    name: result.name,
                    revision: result.revision,
                    serviceAccount: opt.options.serviceaccount,
                    environment:env
                  };
              return org.proxies
                .deploy(deployOptions)
                .then( result => common.logWrite('deployment ' + (result.error ? ('failed: ' + JSON.stringify(result)) : 'ok.')))
                .then( () => common.logWrite('all done.') );
            }
            common.logWrite('finished (not deploying)');
            return Promise.resolve(true);
          });
      })
      .then(() => d.cleanup() );
  })
  .catch( e => console.log('while executing, error: ' + util.format(e)) );
