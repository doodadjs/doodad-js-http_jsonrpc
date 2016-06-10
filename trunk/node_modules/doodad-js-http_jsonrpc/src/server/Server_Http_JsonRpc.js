//! REPLACE_BY("// Copyright 2016 Claude Petit, licensed under Apache License version 2.0\n", true)
// dOOdad - Object-oriented programming framework
// File: Server_Http_JsonRpc.js - Server tools
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
	const global = this;

	var exports = {};
	
	//! BEGIN_REMOVE()
	if ((typeof process === 'object') && (typeof module === 'object')) {
	//! END_REMOVE()
		//! IF_DEF("serverSide")
			module.exports = exports;
		//! END_IF()
	//! BEGIN_REMOVE()
	};
	//! END_REMOVE()
	
	exports.add = function add(DD_MODULES) {
		DD_MODULES = (DD_MODULES || {});
		DD_MODULES['Doodad.Server.Http.JsonRpc'] = {
			version: /*! REPLACE_BY(TO_SOURCE(VERSION(MANIFEST("name")))) */ null /*! END_REPLACE() */,

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

					
				// Source: http://www.jsonrpc.org/specification
				httpJson.ErrorCodes = {
					ParseError: -32700,        // Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text.
					InvalidRequest: -32600,    // The JSON sent is not a valid Request object.
					MethodNotFound: -32601,    // The method does not exist / is not available.
					InvalidParams: -32602,     // Invalid method parameter(s).
					InternalError: -32603,     // Internal JSON-RPC error.
					ServerError: -32000,       // -32000 to -32099 Reserved for implementation-defined server-errors.
				};
				
				httpJson.Error = types.createErrorType('Error', ipc.Error, function _new(code, message, /*optional*/data, /*optional*/params) {
					if (root.DD_ASSERT) {
						root.DD_ASSERT(types.isInteger(code), "Invalid code.");
						root.DD_ASSERT(types.isStringAndNotEmpty(message), "Invalid message.");
						root.DD_ASSERT(types.isSerializable(data), "Invalid data.");
					};
					this.code = code;
					this.data = data;
					return ipc.Error.call(this, message, params);
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
						
						types.setAttributes(this, {
							httpRequest: httpRequest,
							data: {},
						});
					}),
					
					end: doodad.OVERRIDE(function end(/*optional*/result) {
						try {
							if (this.isNotification) {
								result = null;
							};
							this.server.batchCommands[this.server.currentCommand].result = result;
							this.server.runNextCommand(this.httpRequest, this.data);
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

				httpJson.REGISTER(doodad.Object.$extend(
									httpMixIns.Page,
									ipcInterfaces.IServer,
				{
					$TYPE_NAME: 'Page',

					batchCommands: doodad.PUBLIC(null),
					currentCommand: doodad.PUBLIC(-1),
					isBatch: doodad.PUBLIC(false),
					
					resolveService: doodad.PROTECTED(function resolveService(request) {
						let service = request.route.service;

						if (types.isString(service)) {
							service = namespaces.getNamespace(service);
						};
							
						root.DD_ASSERT && root.DD_ASSERT(types._implements(service, ipcMixIns.Service), "Unknown service.");

						if (types.isType(service)) {
							service = new service();
							service = service.getInterface(ipcMixIns.Service);
							request.route.service = service;
						};
							
						if (root.DD_ASSERT) {
							root.DD_ASSERT(types._implements(service, ipcMixIns.Service), "Page has an invalid service.");
						};
						
						return service;
					}),
					
					//addHeaders: doodad.PROTECTED(function addHeaders(request, result) {
					addHeaders: doodad.PROTECTED(function addHeaders(request) {
						const mimeTypes = request.parseAccept(['application/json']);
						
						if (mimeTypes.length) {
							const mimeType = mimeTypes[0];

							request.addHeaders({
								//'Content-Length': result.length,
								'Content-Type': mimeType.name,
								//'Content-Disposition': 'inline',
								//'Last-Modified': dates.strftime('%a, %d %b %Y %H:%M:%S GMT', new Date(), __Internal__.enUSLocale, true), // ex.:   Fri, 10 Jul 2015 03:16:55 GMT
							});
						} else {
							request.respondWithStatus(types.HttpStatus.NotAcceptable, "Content refused by the client.");
						};
					}),
					
					parseResult: doodad.PROTECTED(function parseResult(result, requestId) {
						if (types.isError(result)) {
							if (result instanceof httpJson.Error) {
								result = result.pack();
							} else if (result instanceof ipc.InvalidRequest) {
								result = {
									code: httpJson.ErrorCodes.InvalidRequest, 
									message: result.message,
									data: doodad.PackedValue.$pack(result),
								};
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
							result = {
								jsonrpc: '2.0',
								error: result,
								id: requestId,
							};
						} else {
							result = doodad.PackedValue.$pack(result);
							result = {
								jsonrpc: '2.0',
								result: result,
								id: requestId,
							};
						};
						return result;
					}),
					
					sendResult: doodad.PROTECTED(function sendResult(request) {
						const stream = request.getResponseStream({encoding: 'utf-8'});
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
							stream.write(results);
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
							
							types.extend(rpcRequest.data, requestData);
							
							tools.callAsync(new ipc.RequestCallback(rpcRequest, this, function setImmediateHandler() {
								service.execute(rpcRequest);
							}), -1);

						} else {
							this.sendResult(request);
						};
					}),
					
					execute_GET: doodad.OVERRIDE(function execute_GET(request) {
						this.addHeaders(request);
						
						const args = request.url.args;
						
						let method = args.get('method'),
							methodArgs = args.get('params');
							
						try {
							if (method) {
								try {
									method = JSON.parse(method);
								} catch(ex) {
									throw new httpJson.Error(httpJson.ErrorCodes.ParseError, "Invalid method name.", ex);
								};
							};
								
							if (methodArgs) {
								try {
									methodArgs = JSON.parse(methodArgs);
								} catch(ex) {
									throw new httpJson.Error(httpJson.ErrorCodes.ParseError, "Invalid arguments.", ex);
								};
							};

							this.batchCommands = [{
								jsonrpc: "2.0",
								method: method || '',
								params: methodArgs || [],
							}];
							this.currentCommand = -1;
							this.isBatch = false;
							this.runNextCommand(request);
							
						} catch(ex) {
							if (ex instanceof types.ScriptInterruptedError) {
								throw ex;
							}
							this.batchCommands = [{
								jsonrpc: "2.0",
								method: '',
								params: [],
								result: ex,
							}];
							this.sendResult(request);
						};
					}),
					
					execute_POST: doodad.OVERRIDE(function execute_POST(request) {
						// http://www.jsonrpc.org/specification
						// TODO: Run batch commands in parallel ?
						// TODO: JSON Stream

						// TODO: Parse "Content-Type" in Request
						const contentType = (request.requestHeaders['content-type'] || '');
						if (contentType.split(';')[0].trim() !== 'application/json') {
							request.respondWithStatus(types.HttpStatus.UnsupportedMediaType);
						};
						
						this.addHeaders(request);
						
						const maxRequestLength = types.get(request.route, 'maxRequestLength', 32500); // NOTE: Use "Infinity" for no limit
						let json = '';
							
						request.startBodyTransfer({text: true, callbackObj: this, callback: function onBodyHandler(data) {
							if (data.raw === io.EOF) {
								try {
									json = JSON.parse(json);
								} catch(ex) {
									throw new httpJson.Error(httpJson.ErrorCodes.ParseError, "Parse error.", ex);
								};
								let isBatch = true;
								if (!types.isArray(json)) {
									json = [json];
									isBatch = false;
								};
								this.batchCommands = json;
								this.currentCommand = -1;
								this.isBatch = isBatch;
								this.runNextCommand(request);
							} else {
								const value = data.valueOf();
								if (json.length + value.length > maxRequestLength) {
									throw new httpJson.Error(httpJson.ErrorCodes.InvalidRequest, "Request exceed maximum permitted length.");
								};
								json += value;
							};
						}});
					}),
				}));


			},
		};
		
		return DD_MODULES;
	};
	
	//! BEGIN_REMOVE()
	if ((typeof process !== 'object') || (typeof module !== 'object')) {
	//! END_REMOVE()
		//! IF_UNDEF("serverSide")
			// <PRB> export/import are not yet supported in browsers
			global.DD_MODULES = exports.add(global.DD_MODULES);
		//! END_IF()
	//! BEGIN_REMOVE()
	};
	//! END_REMOVE()
}).call(
	//! BEGIN_REMOVE()
	(typeof window !== 'undefined') ? window : ((typeof global !== 'undefined') ? global : this)
	//! END_REMOVE()
	//! IF_DEF("serverSide")
	//! 	INJECT("global")
	//! ELSE()
	//! 	INJECT("window")
	//! END_IF()
);