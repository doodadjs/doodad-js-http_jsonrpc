//! REPLACE_BY("// Copyright 2015 Claude Petit, licensed under Apache License version 2.0\n")
// dOOdad - Class library for Javascript (BETA) with some extras (ALPHA)
// File: Server_Http_JsonRpc.js - Server tools
// Project home: https://sourceforge.net/projects/doodad-js/
// Trunk: svn checkout svn://svn.code.sf.net/p/doodad-js/code/trunk doodad-js-code
// Author: Claude Petit, Quebec city
// Contact: doodadjs [at] gmail.com
// Note: I'm still in alpha-beta stage, so expect to find some bugs or incomplete parts !
// License: Apache V2
//
//	Copyright 2015 Claude Petit
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
	const global = this;

	global.DD_MODULES = (global.DD_MODULES || {});
	global.DD_MODULES['Doodad.Server.Http.JsonRpc'] = {
		type: null,
		version: '0d',
		namespaces: null,
		dependencies: ['Doodad.Types', 'Doodad.Tools', 'Doodad', 'Doodad.IO', 'Doodad.Server.Http', 'Doodad.Server.Ipc'],

		create: function create(root, /*optional*/_options) {
			"use strict";

			const doodad = root.Doodad,
				types = doodad.Types,
				tools = doodad.Tools,
				namespaces = doodad.Namespaces,	
				io = doodad.IO,
				//ioInterfaces = io.Interfaces,
				server = doodad.Server,
				http = server.Http,
				httpMixIns = http.MixIns,
				ipc = server.Ipc,
				ipcInterfaces = ipc.Interfaces,
				ipcMixIns = ipc.MixIns,
				httpJson = http.JsonRpc;
				
				
			//const __Internal__ = {
			//};

				
			
			httpJson.ErrorCodes = {
				ParseError: -32700,        // Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text.
				InvalidRequest: -32600,    // The JSON sent is not a valid Request object.
				MethodNotFound: -32601,    // The method does not exist / is not available.
				InvalidParams: -32602,     // Invalid method parameter(s).
				InternalError: -32603,     // Internal JSON-RPC error.
				ServerError: -32000,       // -32000 to -32099 Reserved for implementation-defined server-errors.
			};
			
			httpJson.Error = types.createErrorType('Error', ipc.Error, function _new(code, message, /*optional*/data) {
				if (root.DD_ASSERT) {
					root.DD_ASSERT(types.isInteger(code), "Invalid code.");
					root.DD_ASSERT(types.isStringAndNotEmpty(message), "Invalid message.");
					root.DD_ASSERT(types.isSerializable(data), "Invalid data.");
				};
				this.code = code;
				this.data = data;
				return ipc.Error.call(this, message);
			});
			httpJson.Error.prototype.pack = function pack() {
				return {
					code: this.code, 
					message: this.message,
					data: doodad.PackedValue.$pack(this.data),
				};
			};
			
			httpJson.REGISTER(ipc.Request.$extend(
			{
				$TYPE_NAME: 'Request',
				
				httpRequest: doodad.PUBLIC(doodad.READ_ONLY(  null  )),
				
				create: doodad.OVERRIDE(function create(httpRequest, server, method, /*optional*/args, /*optional*/session) {
					this._super(server, method, args, session);
					this.setAttribute('httpRequest', httpRequest);
					this.customData = {};
				}),
				
				end: doodad.OVERRIDE(function end(/*optional*/result) {
					try {
						if (this.isNotification) {
							result = null;
						};
						this.server.batchCommands[this.server.currentCommand].result = result;
						this.server.runNextCommand(this.httpRequest, this.customData);
					} catch(ex) {
						if (!(ex instanceof server.EndOfRequest)) {
							this.httpRequest.respondWithError(ex);
						};
					};
					throw new server.EndOfRequest();
				}),

				respondWithError: doodad.OVERRIDE(function respondWithError(ex) {
					this.onError(new doodad.ErrorEvent(ex));
					this.end(ex);
				}),
			}));

			httpJson.REGISTER(doodad.BASE(doodad.Object.$extend(
								httpMixIns.Page,
								ipcInterfaces.IServer,
			{
				$TYPE_NAME: 'Page',

				batchCommands: doodad.PUBLIC(null),
				currentCommand: doodad.PUBLIC(-1),
				isBatch: doodad.PUBLIC(false),
				isGet: doodad.PUBLIC(false),
				
				resolveService: doodad.PROTECTED(function resolveService(request) {
					let service = request.mapping.service;

					if (types.isString(service)) {
						service = namespaces.getNamespace(service);
					};
						
					root.DD_ASSERT && root.DD_ASSERT(types._implements(service, ipcMixIns.Service), "Unknown service.");

					if (types.isType(service)) {
						service = new service();
						service = service.getInterface(ipcMixIns.Service);
						request.mapping.service = service;
					};
						
					if (root.DD_ASSERT) {
						root.DD_ASSERT(types._implements(service, ipcMixIns.Service), "Page has an invalid service.");
					};
					
					return service;
				}),
				
				addHeaders: doodad.PROTECTED(function addHeaders(request, result) {
					request.addHeaders({
						'Content-Length': result.length,
						'Content-Type': 'application/json',
						//'Content-Disposition': 'inline',
						//'Last-Modified': dates.strftime('%a, %d %b %Y %H:%M:%S GMT', new Date(), __Internal__.enUSLocale, true), // ex.:   Fri, 10 Jul 2015 03:16:55 GMT
					});
				}),
				
				parseResult: doodad.PROTECTED(function parseResult(result, requestId) {
					if (types.isError(result)) {
						if (this.isGet) {
							result = doodad.PackedValue.$pack(result);
						} else if (result instanceof httpJson.Error) {
							result = result.pack();
						} else if (result instanceof ipc.MethodNotCallable) {
							result = {
								code: httpJson.ErrorCodes.MethodNotFound, 
								message: result.message,
								data: doodad.PackedValue.$pack(result),
							};
						} else if (result instanceof ipc.Error) {
							result = {
								code: httpJson.ErrorCodes.ServerError, 
								message: result.message,
								data: doodad.PackedValue.$pack(result),
							};
						} else {
							result = {
								code: httpJson.ErrorCodes.InternalError, 
								message: result.message,
								data: doodad.PackedValue.$pack(result),
							};
						};
						if (!this.isGet) {
							result = {
								jsonrpc: '2.0',
								error: result,
								id: requestId,
							};
						};
					} else {
						result = doodad.PackedValue.$pack(result);
						if (!this.isGet) {
							result = {
								jsonrpc: '2.0',
								result: result,
								id: requestId,
							};
						};
					};
					return result;
				}),
				
				sendResult: doodad.PROTECTED(function sendResult(request) {
					const commands = this.batchCommands;
					let results = [];
						
					for (let i = 0; i < commands.length; i++) {
						const command = commands[i];
					
						const requestId = types.get(command, 'id'),
							result = types.get(command, 'result');
							
						if (!this.isNotification) {
							results.push(this.parseResult(result, requestId));
						};
					};

					if (!this.isBatch) {
						results = results[0];
					} else if (results.length === 0) {
						// Server MUST NOT return an empty array. Server MUST return nothing.
						results = null;
					};
					
					if (results) {
						results = JSON.stringify(results);
						this.addHeaders(request, results);
						request.sendHeaders();
						request.responseStream.write(results);
					};
					
					request.end();
				}),

				runNextCommand: doodad.PUBLIC(function runNextCommand(request, /*optional*/requestData) {
					const commands = this.batchCommands;
					if (this.currentCommand < commands.length - 1) {
						const command = commands[++this.currentCommand];
						
						if (!types.isObject(command)) {
							throw new httpJson.Error(httpJson.ErrorCodes.InvalidRequest, "Request must be an object.");
						};
						
						if (types.get(command, 'jsonrpc') !== '2.0') {
							throw new httpJson.Error(httpJson.ErrorCodes.InvalidRequest, "Invalid protocol version.");
						};
					
						const method = types.get(command, 'method');
						let methodArgs = types.get(command, 'params');

						if (!types.isNothing(methodArgs) && !types.isArray(methodArgs)) {
							throw new httpJson.Error(httpJson.ErrorCodes.InvalidParams, "Invalid arguments.");
						};
						
						try {
							methodArgs = tools.map(methodArgs, function(value) {
								if (types.isObject(value)) {
									return doodad.PackedValue.$unpack(value);
								} else {
									return value;
								};
							});
						} catch(ex) {
							throw new httpJson.Error(httpJson.ErrorCodes.InvalidParams, "Invalid arguments.", ex);
						};
						
						const service = this.resolveService(request),
							rpcRequest = new httpJson.Request(request, this, method, methodArgs, request.session);
						
						types.extend(rpcRequest.customData, requestData);
						
						setImmediate(new ipc.RequestCallback(rpcRequest, this, function setImmediateHandler() {
							service.execute(rpcRequest);
						}));

					} else {
						this.sendResult(request);
					};
				}),
				
				execute_GET: doodad.OVERRIDE(function execute_GET(request) {
					const args = request.url.args,
						method = JSON.parse(args.get('method'));
					let methodArgs = args.get('params');
						
					if (methodArgs) {
						methodArgs = JSON.parse(methodArgs);
					};

					this.batchCommands = [{
						jsonrpc: "2.0",
						method: method,
						params: methodArgs,
					}];
					this.currentCommand = -1;
					this.isBatch = false;
					this.isGet = true;
					this.runNextCommand(request);
				}),
				
				execute_POST: doodad.OVERRIDE(function execute_POST(request) {
					// http://www.jsonrpc.org/specification
					// TODO: Run batch commands in parallel ?

					const maxRequestLength = types.get(request.mapping, 'maxRequestLength', 32500); // NOTE: Use "Infinity" for no limit
					let data = '';
						
					request.startBodyTransfer(new http.RequestCallback(request, this, function onBodyHandler(ev) {
						ev.preventDefault();
						if (ev.data.data === io.EOF) {
							try {
								data = JSON.parse(data);
							} catch(ex) {
								throw new httpJson.Error(httpJson.ErrorCodes.ParseError, "Parse error.", ex);
							};
							let isBatch = true;
							if (!types.isArray(data)) {
								data = [data];
								isBatch = false;
							};
							this.batchCommands = data;
							this.currentCommand = -1;
							this.isBatch = isBatch;
							this.isGet = false;
							this.runNextCommand(request);
						} else {
							const text = ev.data.text;
							if (data.length + text.length > maxRequestLength) {
								throw new httpJson.Error(httpJson.ErrorCodes.InvalidRequest, "Request exceed maximum permitted length.");
							};
							data += text;
						};
					}));
				}),
			})));


		},
	};
})();