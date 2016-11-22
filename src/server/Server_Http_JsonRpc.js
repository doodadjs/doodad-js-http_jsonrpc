//! BEGIN_MODULE()

//! REPLACE_BY("// Copyright 2016 Claude Petit, licensed under Apache License version 2.0\n", true)
// doodad-js - Object-oriented programming framework
// File: Server_Http_JsonRpc.js - Server tools
// Project home: https://github.com/doodadjs/
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

module.exports = {
	add: function add(DD_MODULES) {
		DD_MODULES = (DD_MODULES || {});
		DD_MODULES['Doodad.Server.Http.JsonRpc'] = {
			version: /*! REPLACE_BY(TO_SOURCE(VERSION(MANIFEST("name")))) */ null /*! END_REPLACE()*/,
			create: function create(root, /*optional*/_options, _shared) {
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
				httpJson.ADD('ErrorCodes', types.freezeObject(types.nullObject({
					ParseError: -32700,        // Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text.
					InvalidRequest: -32600,    // The JSON sent is not a valid Request object.
					MethodNotFound: -32601,    // The method does not exist / is not available.
					InvalidParams: -32602,     // Invalid method parameter(s).
					InternalError: -32603,     // Internal JSON-RPC error.
					ServerError: -32000,       // -32000 to -32099 Reserved for implementation-defined server-errors.
				})));
				
				httpJson.REGISTER(types.createErrorType('Error', ipc.Error, function _new(code, message, /*optional*/data, /*optional*/params) {
					if (root.DD_ASSERT) {
						root.DD_ASSERT(types.isInteger(code), "Invalid code.");
						root.DD_ASSERT(types.isStringAndNotEmpty(message), "Invalid message.");
						root.DD_ASSERT(types.isSerializable(data), "Invalid data.");
					};
					this._this.code = code;
					this._this.data = data;
					this._super.call(this._this, message, params);
				}));
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
					
					__ended: doodad.PROTECTED(false),
					
					create: doodad.OVERRIDE(function create(httpRequest, server, method, /*optional*/args, /*optional*/session) {
						this._super(server, method, args, session);
						
						_shared.setAttribute(this, 'httpRequest', httpRequest);
					}),
					
					end: doodad.OVERRIDE(function end(/*optional*/result) {
						if (!this.__ended) {
							this.__ended = true;
							if (this.isNotification) {
								// Notifications must return nothing
								result = null;
							};
							this.server.batchCommands[this.server.currentCommand].result = result;
						};
						
						throw new server.EndOfRequest();
					}),

					respondWithError: doodad.OVERRIDE(function respondWithError(ex) {
						if (this.__ended) {
							throw new server.EndOfRequest();
						};
						this.onError(new doodad.ErrorEvent(ex));
						return this.end(ex);
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
					
					__json: doodad.PROTECTED(null),
					__current: doodad.PROTECTED(null),
					__currentStack: doodad.PROTECTED(null),
					__lastLevel: doodad.PROTECTED(-1),
					__key: doodad.PROTECTED(null),
					
					$prepare: doodad.OVERRIDE(function $prepare(options) {
						options = this._super(options);
						
						let val;
						
						// TODO: Tuneup default values

						val = types.toInteger(options.maxDepth) || 10; // NOTE: Use "Infinity" for no limit
						options.maxDepth = val;

						val = types.toInteger(options.maxStringLength) || 1024 * 1024 * 1; // NOTE: Use "Infinity" for no limit
						options.maxStringLength = val;

						val = types.toInteger(options.maxArrayLength) || 1024 * 1; // NOTE: Use "Infinity" for no limit
						options.maxArrayLength = val;

						val = types.toInteger(options.batchLimit) || 100; // NOTE: Use "Infinity" for no limit
						options.batchLimit = val;

						val = options.service;
						if (types.isString(val)) {
							val = namespaces.get(val);
						};
						root.DD_ASSERT && root.DD_ASSERT(types._implements(val, ipcMixIns.Service), "Unknown service.");
						if (types.isType(val)) {
							val = new val();
							val = val.getInterface(ipcMixIns.Service);
						};
						options.service = val;

						return options;
					}),

					addHeaders: doodad.PROTECTED(function addHeaders(request) {
						const mimeType = request.getAcceptables(['application/json'])[0];
						if (!mimeType) {
							request.response.respondWithStatus(types.HttpStatus.NotAcceptable);
						};
						
						request.response.addHeaders({
							'Content-Type': mimeType.name,
							//'Content-Disposition': 'inline',
							//'Last-Modified': dates.strftime('%a, %d %b %Y %H:%M:%S GMT', new Date(), __Internal__.enUSLocale, true), // ex.:   Fri, 10 Jul 2015 03:16:55 GMT
						});
					}),
					
					parseResult: doodad.PROTECTED(function parseResult(result, requestId) {
						if (types.isError(result)) {
							if (result.critical) {
								throw ex; // Must always throw critical errors
							} else if (result instanceof httpJson.Error) {
								result = result.pack();
							} else if (result instanceof ipc.InvalidRequest) {
								result = types.nullObject({
									code: httpJson.ErrorCodes.InvalidRequest, 
									message: result.message,
									data: doodad.PackedValue.$pack(result),
								});
							} else if (result instanceof ipc.MethodNotCallable) {
								result = types.nullObject({
									code: httpJson.ErrorCodes.MethodNotFound, 
									message: result.message,
									data: doodad.PackedValue.$pack(result),
								});
							} else if (result instanceof ipc.Error) {
								result = types.nullObject({
									code: httpJson.ErrorCodes.ServerError, 
									message: result.message,
									data: doodad.PackedValue.$pack(result),
								});
							} else {
								result = types.nullObject({
									code: httpJson.ErrorCodes.InternalError, 
									message: result.message,
									data: doodad.PackedValue.$pack(result),
								});
							};
							return types.nullObject({
								jsonrpc: '2.0',
								error: result,
								id: requestId,
							});
						} else {
							result = doodad.PackedValue.$pack(result);
							return types.nullObject({
								jsonrpc: '2.0',
								result: result,
								id: requestId,
							});
						};
					}),
					
					sendResult: doodad.PROTECTED(doodad.ASYNC(function sendResult(request, commands) {
						return request.response.getStream({encoding: 'utf-8'})
							.then(function(stream) {
								let results = [];
							
								for (let i = 0; i < commands.length; i++) {
									const command = commands[i]; // NOTE: Comes from JSON
						
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
									return stream.writeAsync(results);
								};
							}, null, this);
					})),

					runNextCommand: doodad.PUBLIC(doodad.ASYNC(function runNextCommand(request, /*optional*/requestData) {
						const commands = this.batchCommands || [];
						if (this.currentCommand < commands.length - 1) {
							const command = commands[++this.currentCommand]; // NOTE: Comes from JSON
							
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
							
							const service = this.options.service,
								rpcRequest = new httpJson.Request(request, this, method, methodArgs, request.session);
							
							types.extend(rpcRequest.data, requestData);
							
							return service.execute(rpcRequest)
								.catch(function(ex) {
									throw ex;
								})
								.then(function endRequestPromise(result) {
									return rpcRequest.end();
								})
								.catch(rpcRequest.catchError)
								.finally(function cleanupRequestPromise() {
									const data = rpcRequest.data;
									//if (!rpcRequest.isDestroyed()) {
										rpcRequest.destroy();
									//};
									return this.runNextCommand(request, data);
								}, this);

						} else {
							return this.sendResult(request, commands);
						};
					})),
					
					execute_GET: doodad.OVERRIDE(function execute_GET(request) {
						this.addHeaders(request);
						
						const args = request.url.args;
						
						let method = args.get('method'),
							methodArgs = args.get('params');
							
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
						return this.runNextCommand(request);
					}),
					
					__onStreamReady: doodad.PROTECTED(function __onStreamReady(ev) {
						const maxDepth = this.options.maxDepth;					// NOTE: Use "Infinity" for no limit
						const maxStringLength = this.options.maxStringLength;	// NOTE: Use "Infinity" for no limit
						const maxArrayLength = this.options.maxArrayLength;		// NOTE: Use "Infinity" for no limit
						const batchLimit = this.options.batchLimit;				// NOTE: Use "Infinity" for no limit

						const data = ev.data;

						ev.preventDefault();

						if (data.raw === io.EOF) {
							this.batchCommands = this.__json;
							this.currentCommand = -1;
							return true;
						} else {
							const obj = data.valueOf(),
								value = obj.value,
								level = obj.level,
								mode = obj.mode,
								isOpenClose = obj.isOpenClose,
								Modes = obj.Modes,
								stack = this.__currentStack;
							if (this.__json) {
								if (level > this.__lastLevel) {
									if (stack.length >= maxDepth) {
										throw new httpJson.Error(httpJson.ErrorCodes.InvalidRequest, "JSON exceed maximum permitted depth level.");
									};
									stack[stack.length] = this.__current;
									if (mode === Modes.Key) {
										this.__current = '';
									} else {
										if (types.isArray(this.__current)) {
											// Always append to arrays
											this.__key = this.__current.length;
											if ((this.__current === this.__json) && (this.__key >= batchLimit)) {
												throw new httpJson.Error(httpJson.ErrorCodes.InvalidRequest, "Batch exceed maximum permitted length.");
											} else if (this.__key >= maxArrayLength) {
												throw new httpJson.Error(httpJson.ErrorCodes.InvalidRequest, "JSON array exceed maximum permitted length.");
											};
										};
										this.__current = this.__current[this.__key] = (mode === Modes.Object ? {} : (mode === Modes.Array ? [] : ''));
									};
								} else if (level < this.__lastLevel) {
									const tmp = this.__current;
									this.__current = stack.pop();
									if (mode === Modes.Key) {
										this.__key = tmp;
									} else if (mode === Modes.String) {
										this.__current[this.__key] = tmp;
									};
								};
								if (!isOpenClose) {
									if (mode === Modes.Key || mode === Modes.String) {
										if (this.__current.length + value.length > maxStringLength) {
											throw new httpJson.Error(httpJson.ErrorCodes.InvalidRequest, "JSON key/string value exceed maximum permitted length.");
										};
										this.__current += value;
									} else {
										if (mode === Modes.Array) {
											// Always append to arrays
											this.__key = this.__current.length;
											if ((this.__current === this.__json) && (this.__key >= batchLimit)) {
												throw new httpJson.Error(httpJson.ErrorCodes.InvalidRequest, "Batch exceed maximum permitted length.");
											} else if (this.__key >= maxArrayLength) {
												throw new httpJson.Error(httpJson.ErrorCodes.InvalidRequest, "JSON array exceed maximum permitted length.");
											};
										};
										this.__current[this.__key] = value;
									};
								};
							} else {
								if (mode === Modes.Object) {
									this.isBatch = false;
									this.__current = {};
									this.__json = [this.__current];
								} else if (mode === Modes.Array) {
									this.__current = this.__json = [];
								} else {
									throw new httpJson.Error(httpJson.ErrorCodes.ParseError, "Parse error.");
								};
							};
							this.__lastLevel = level;
						};
					}),
					
					execute_POST: doodad.OVERRIDE(function execute_POST(request) {
						// http://www.jsonrpc.org/specification
						// TODO: Run batch commands in parallel ?

						const Promise = types.getPromise();

						if (!request.hasHandler(http.JsonBodyHandler)) {
							throw new httpJson.Error(httpJson.ErrorCodes.ParseError, "Parse error.", new types.Error("'http.JsonBodyHandler' is not loaded."));
						};
						
						this.addHeaders(request);
						
						this.isBatch = true;
						this.__json = null;
						this.__current = null;
						this.__currentStack = [];
						this.__lastLevel = -1;
						this.__key = null;
					
						return request.getStream()
							.then(function transferBody(stream) {
								return Promise.create(function onReadyHook(resolve, reject) {
									let readyCb, errorCb;
									stream.onReady.attach(this, readyCb = function(ev) {
										const eof = this.__onStreamReady(ev);
										if (eof) {
											stream.onReady.detach(this, readyCb);
											stream.onError.detach(this, errorCb);
											resolve();
										};
									});
									stream.onError.attachOnce(this, errorCb = function(err) {
										stream.onReady.detach(this, readyCb);
										reject(err);
									});
									stream.listen();
									stream.flush();
								}, this);
							}, null, this)
							.then(function() {
								return this.runNextCommand(request);
							}, null, this);
					}),

					execute: doodad.OVERRIDE(function execute(request) {
						return this._super(request)
							.catch(function(ex) {
								return this.sendResult(request, [{
										jsonrpc: "2.0",
										method: '',
										params: [],
										result: ex,
									}]);
							}, this);
					}),
				}));


			},
		};
		return DD_MODULES;
	},
};
//! END_MODULE()