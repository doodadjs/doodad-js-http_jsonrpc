//! REPLACE_BY("// Copyright 2016 Claude Petit, licensed under Apache License version 2.0\n")
// dOOdad - Object-oriented programming framework
// File: NodeJs_Server_http_JsonRpc.js - Server tools extension for NodeJs
// Project home: https://sourceforge.net/projects/doodad-js/
// Trunk: svn checkout svn://svn.code.sf.net/p/doodad-js/code/trunk doodad-js-code
// Author: Claude Petit, Quebec city
// Contact: doodadjs [at] gmail.com
// Note: I'm still in alpha-beta stage, so expect to find some bugs or incomplete parts !
// License: Apache V2
//
//	Copyright 2016 Claude Petit
//
//	Licensed under the Apache License, Version 2.0 (the "License");
//	you may not use this file except in compliance with the License.
//	You may obtain a copy of the License at
//
//		http://www.apache.org/licenses/LICENSE-2.0
//
//	Unless required by applicable law or agreed to in writing, software
//	distributed under the License is distributed on an "AS IS" BASIS,
//	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//	See the License for the specific language governing permissions and
//	limitations under the License.
//! END_REPLACE()

(function() {
	var global = this;

	var exports = {};
	if (typeof process === 'object') {
		module.exports = exports;
	};
	
	exports.add = function add(DD_MODULES) {
		DD_MODULES = (DD_MODULES || {});
		DD_MODULES['Doodad.NodeJs.Server.Http.JsonRpc'] = {
			type: null,
			version: '0.3.0d',
			namespaces: null,
			dependencies: [
				'Doodad.Types', 
				'Doodad.Tools', 
				'Doodad', 
				{
					name: 'Doodad.NodeJs.IO',
					version: '0.4.0',
				},
				'Doodad.Server.Http.JsonRpc',
			],

			create: function create(root, /*optional*/_options) {
				"use strict";

				const doodad = root.Doodad,
					types = doodad.Types,
					tools = doodad.Tools,
					server = doodad.Server,
					http = server.Http,
					httpJson = http.JsonRpc,
					ipc = server.Ipc,
					nodejs = doodad.NodeJs,
					nodejsIO = nodejs.IO,
					nodejsServer = nodejs.Server,
					nodejsHttp = nodejsServer.Http,
					nodejsJson = nodejsHttp.JsonRpc;

				
				//const __Internal__ = {
				//};


				nodejsJson.REGISTER(httpJson.Page.$extend(
				{
					$TYPE_NAME: 'Page',

					createRequestStream: doodad.OVERRIDE(function createRequestStream(request) {
						return new nodejsIO.TextInputStream(request.nodeJsRequest);
					}),
					
					createResponseStream: doodad.OVERRIDE(function(request) {
						return new nodejsIO.TextOutputStream(request.nodeJsResponse)			
					}),
				}));

				
				
				//return function init(/*optional*/options) {
				//};
			},
		};
		
		return DD_MODULES;
	};
	
	if (typeof process !== 'object') {
		// <PRB> export/import are not yet supported in browsers
		global.DD_MODULES = exports.add(global.DD_MODULES);
	};
}).call((typeof global !== 'undefined') ? global : ((typeof window !== 'undefined') ? window : this));