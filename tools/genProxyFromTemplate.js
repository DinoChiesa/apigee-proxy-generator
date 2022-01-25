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
// last saved: <2022-January-25 08:58:27>
/* jshint node:true, esversion: 9, strict: implied */

// genProxyFromTemplate.js
// ------------------------------------------------------------------
// generate a new proxy from a template and import it into Apigee.
//

const apigeejs   = require('apigee-edge-js'),
      lodash     = require('lodash'),
      Getopt     = require('node-getopt'),
      sprintf    = require('sprintf-js').sprintf,
      tmp        = require('tmp-promise'),
      util       = require('util'),
      fs         = require('fs'),
      path       = require('path'),
      common     = apigeejs.utility,
      apigee     = apigeejs.apigee,
      version    = '20220124-1118',
      getopt     = new Getopt(common.commonOptions.concat([
        ['d' , 'source=ARG', 'required. source directory for the proxy template files. This should have a child dir "apiproxy" or "sharedflowbundle"'],
        ['e' , 'env=ARG', 'optional. the Apigee environment(s) to which to deploy the asset. Separate multiple environments with a comma.'],
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
 * cp -R (with a hook).
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
        } else if ( ! src.endsWith('~')) {
          fs.copyFileSync(src, dest);
          if (upcall) { upcall(dest); }
        }
      };

/**
This gets called once on each file, after it has been copied.
It interprets each file as a lodash template.
**/
const getTemplateApplier = (config) => (sourceFilename) => {
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

// ========================================================

console.log(
  `Apigee facade proxy generator tool, version: ${version}\nNode.js ${process.version}\n`);

process.on('unhandledRejection',
            r => console.log('\n*** unhandled promise rejection: ' + util.format(r)));

common.logWrite('start');

var opt = getopt.parse(process.argv.slice(2));

common.verifyCommonRequiredParameters(opt.options, getopt);

if ( !opt.options.source ) {
  console.log('You must specify a source directory');
  getopt.showHelp();
  process.exit(1);
}
if ( !opt.options.serviceaccount ) {
  console.log('You must specify a service account ID.');
  getopt.showHelp();
  process.exit(1);
}

if ( !opt.options.config ) {
  console.log('You must specify a configuration file.');
  getopt.showHelp();
  process.exit(1);
}

config = require(opt.options.config); // array of key/value pairs

if ( ! config.proxyname || !config.basepath /* ... */) {
  console.log('The configuration must specify a proxyname and a basepath.');
  getopt.showHelp();
  process.exit(1);
}

apigee
  .connect(common.optToOptions(opt))
  .then( org => {
    common.logWrite('connected');
    return tmp.dir({unsafeCleanup:true}).then(d => {
      // copy the template dir, and then apply the config data to the template
      copyRecursiveSync(opt.options.source, d.path, getTemplateApplier(config));
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
    });
  })
  .catch( e => console.log('while executing, error: ' + util.format(e)) );
