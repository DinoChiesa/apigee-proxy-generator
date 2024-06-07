#! /usr/local/bin/node
// Copyright 2017-2024 Google LLC.
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
// last saved: <2024-June-07 12:33:31>
/* jshint node:true, esversion: 9, strict: implied */


const lodash   = require('lodash'),
      Getopt   = require('node-getopt'),
      sprintf  = require('sprintf-js').sprintf,
      util     = require('util'),
      fs       = require('fs'),
      path     = require('path'),
      version  = '20240607-1224',
      getopt   = new Getopt([
        ['' , 'templatefile=ARG', 'required. source directory for the proxy template files. This should have a child dir "apiproxy" or "sharedflowbundle"'],
        ['' , 'config=ARG', 'required. the configuration data for the template.']
      ]).bindHelp();

  lodash.templateSettings = {
        evaluate:    /\{\{([\s\S]+?)\}\}/g,
        interpolate: /\{\{=(.+?)\}\}/g,
        escape:      /\{\{-(.+?)\}\}/g
  };


const getTemplateTransformer = (config) => (sourceFilename) => {
      };

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
  `template evaluator tool, version: ${version}\nNode.js ${process.version}\n`);

process.on('unhandledRejection',
            r => console.log('\n*** unhandled promise rejection: ' + util.format(r)));

const opt = getopt.parse(process.argv.slice(2));

if ( ! opt.options.config ) {
  console.log('Error: you must specify a configuration file.');
  getopt.showHelp();
  process.exit(1);
}

if ( ! opt.options.templatefile ) {
  console.log('Error: you must specify a templatefile.');
  getopt.showHelp();
  process.exit(1);
}

const config = getConfig(opt.options.config);

const sourcedata = fs.readFileSync(opt.options.templatefile, 'utf8');
const template = lodash.template(
        sourcedata,
        {imports: {path, fs, lodash, sourceFilename: opt.options.templatefile}});

let result = template(config);
      console.log('result:\n' + result);
