/**
 * log.js
 *
 * (c) 2020-2022 Wany
 *
 * @summary Logger / Log
 * @author Wany <sung@wany.io>
 */

 const config = {}

 const EventEmitter = require('events');
 const fs = require('fs');
 const time = require('./time');
 const knownHosts = {}
 const knownReferers = {}
 
 class Logger extends EventEmitter {
   constructor(options) {
     super();
     this.source = options.source;
     this.title = options.title;
     this.color = options.color;
     this.dir = options.dir;
     this.type = options.type;
     this.channel = options.channel;
   }
 
   log(message, type, silent) {
     if (!silent) {
       let consoleMessage = '\x1b[0m\x1b[90m[\x1b[0m' + this.color + this.title + '\x1b[0m ';
       consoleMessage += time.stamp('log') + '\x1b[0m\x1b[90m]\x1b[0m: ';
       consoleMessage += this.type[type].console;
       if (message && message.stack) {
         consoleMessage += message.stack + '\x1b[0m';
       } else {
         consoleMessage += message + '\x1b[0m';
       }
       console.log(consoleMessage);
     }
 
     if (typeof msg == 'string') {
       msg = msg.replace(/\x1b\[(.*)m/gi, '');
     }
 
     let filename = this.channel + '-' + time.format('YYYYMMDD') + '-' + this.source;
     if (type == 'error') {
       filename += '-error';
     }
     filename += '.log';
 
     if (!fs.existsSync(this.dir)) {
       fs.mkdirSync(this.dir);
     }
 
     let dir = this.dir + '/' + time.format('YYYYMM');
 
     if (!fs.existsSync(dir)) {
       fs.mkdirSync(dir);
     }
 
     let file = dir + '/' + filename;
 
     let logMessage = '[' + this.title + ']' + this.type[type].text + time.stamp('logm');
     if (message && message.stack) {
       logMessage += message.stack;
     } else {
       logMessage += message;
     }
     logMessage += '\r\n';
     fs.appendFileSync(file, logMessage);
   }
 }
 module.exports.Logger = Logger;
 
 function parseAgent(agent) {
   let browser;
   let system;
 
   if (!agent) {
     system = 'Unknown';
     browser = 'Unknown';
   } else {
     if (agent.indexOf('Windows') > -1) {
       system = 'Windows';
       if (/(Windows 10.0|Windows NT 10.0)/.test(agent)) {
         system = 'Windows 10';
       } else if (/(Windows 8.1|Windows NT 6.3)/.test(agent)) {
         system = 'Windows 8.1';
       } else if (/(Windows 8|Windows NT 6.2)/.test(agent)) {
         system = 'Windows 8';
       } else if (/(Windows 7|Windows NT 6.1)/.test(agent)) {
         system = 'Windows 7';
       } else if (/Windows NT 6.0/.test(agent)) {
         system = 'Windows Vista';
       } else if (/(Windows NT 5.1|Windows XP)/.test(agent)) {
         system = 'Windows XP';
       }
     } else if (agent.indexOf('Macintosh') > -1) {
       system = 'Mac';
     } else if (agent.indexOf('iPhone') > -1) {
       system = 'iPhone';
     } else if (agent.indexOf('iPad') > -1) {
       system = 'iPad';
     } else if (agent.indexOf('iPad') > -1) {
       system = 'iPod';
     } else if (agent.indexOf('Android') > -1) {
       system = 'Android';
     } else if (agent.indexOf('Linux') > -1) {
       system = 'Linux';
     } else if (agent.indexOf('X11') > -1) {
       system = 'Unix';
     } else {
       system = 'Unknown';
     }
 
     if (agent.indexOf('Firefox') > -1) {
       browser = 'Firefox';
     } else if (agent.toLowerCase().indexOf('bot') > -1) {
       browser = 'Bot';
     } else if (agent.indexOf('Steam') > -1) {
       browser = 'Steam';
     } else if (agent.indexOf('Instagram') > -1) {
       browser = 'Instagram';
     } else if (agent.indexOf('KAKAOTALK') > -1 || agent.indexOf('kakaotalk-scrap') > -1) {
       browser = 'Kakaotalk';
     } else if (agent.indexOf('NAVER(inapp') > -1) {
       browser = 'Naver App';
     } else if (agent.indexOf('SamsungBrowser') > -1) {
       browser = 'Samsung Internet';
     } else if (agent.indexOf('Opera') > -1 || agent.indexOf('OPR') > -1) {
       browser = 'Opera';
     } else if (agent.indexOf('Trident') > -1) {
       browser = 'IE';
     } else if (agent.indexOf('Edg') > -1) {
       browser = 'Edge';
     } else if (agent.indexOf('Whale') > -1) {
       browser = 'Whale';
     } else if (agent.indexOf('Chrome') > -1) {
       browser = 'Chrome';
     } else if (agent.indexOf('Safari') > -1) {
       browser = 'Safari';
     } else {
       browser = 'Unknown';
     }
   }
 
   return {
     browser: browser,
     system: system,
   };
 }
 module.exports.parseAgent = parseAgent;
 
 const logger = new Logger({
   channel: 'log',
   source: 'EKE',
   title: 'EKE',
   color: '\u001B[38;2;' + 255 + ';' + 255 + ';' + 255 + 'm',
   dir: 'data/logs',
   type: {
     info: {
       console: '',
       text: '[INFO]',
     },
     warn: {
       console: '\u001B[43m\u001B[30m[WARN]\u001B[0m\u001B[93m ',
       text: '[WARN]',
     },
     error: {
       console: '\u001B[41m\u001B[30m[ERROR]\u001B[0m\u001B[91m ',
       text: '[EROR]',
     },
     debug: {
       console: '\u001B[45m\u001B[30m[DEBUG]\u001B[0m\u001B[95m ',
       text: '[DEBG]',
     },
   },
 });
 
 module.exports.info = (message) => {
   logger.log(message, 'info', false);
 };
 module.exports.warn = (message) => {
   logger.log(message, 'warn', false);
 };
 module.exports.error = (message) => {
   logger.log(message, 'error', false);
 };
 module.exports.debug = (message) => {
   logger.log(message, 'debug', false);
 };
 
 module.exports.only = (message) => {
   logger.log(message, 'info', true);
 };
 module.exports.onlyWarn = (message) => {
   logger.log(message, 'warn', true);
 };
 module.exports.onlyError = (message) => {
   logger.log(message, 'error', true);
 };
 module.exports.onlyDebug = (message) => {
   logger.log(message, 'debug', true);
 };
 
 const reqLogger = new Logger({
   channel: 'req',
   source: 'EKE',
   title: 'EKE',
   color: '\u001B[38;2;' + 255 + ';' + 255 + ';' + 255 + 'm',
   dir: 'data/logs',
   type: {
     info: {
       console: '',
       text: '[INFO]',
     },
     warn: {
       console: '\u001B[43m\u001B[30m[WARN]\u001B[0m\u001B[93m ',
       text: '[WARN]',
     },
     error: {
       console: '\u001B[41m\u001B[30m[ERROR]\u001B[0m\u001B[91m ',
       text: '[EROR]',
     },
     debug: {
       console: '\u001B[45m\u001B[30m[DEBUG]\u001B[0m\u001B[95m ',
       text: '[DEBG]',
     },
   },
 });
 
 const ignoreHosts = []
 const ignoreAgents = []
 
 module.exports.req = (req) => {
   // ip
   let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
   if (ip.substr(0, 7) == '::ffff:') {
     ip = ip.substr(7);
   }
   if (ignoreHosts.includes(ip)) {
     return;
   }
   if (knownHosts.hasOwnProperty(ip)) {
     ip = knownHosts[ip] + ' (' + ip + ')';
   }
 
   // protocol
   let protocol = '';
   if (req.socket.encrypted) {
     protocol = 'HTTPS';
   } else {
     protocol = 'HTTP';
   }
 
   // method
   let method = req.method;
 
   // path
   let path = req.originalUrl;
 
   // document type
   let documentType = req.headers['sec-fetch-dest'];
 
   // cookies
   let cookies = req.cookies;
   try {
     cookies = JSON.stringify(cookies);
   } catch (error) {}
 
   // client data
   let clientData = new Object();
 
   // client data => referer
   let referer = req.headers['referer'];
   if (!referer) {
     clientData.referer = 'Direct';
   } else {
     for (let key in knownReferers) {
       if (referer.startsWith(key)) {
         clientData.referer = knownReferers[key] + ' (' + referer + ')';
         break;
       }
     }
     if (!clientData.referer) {
       clientData.referer = referer;
     }
   }
 
   let host = req.hostname

   // client data => agent
   let agentString = req.headers['user-agent'];
   if (ignoreAgents.includes(agentString)) {
     return;
   }
   let agent = parseAgent(agentString);
   clientData.agent = agent;
   clientData.agent.string = agentString;
 
   // client data => session / account
   if (req.session && req.session.account && req.session.account.login == true) {
     clientData.account = {
       id: req.session.account.id,
       name: req.session.account.name,
     };
     clientData.sid = req.sessionID;
   }
 
   let message = '';
   message += ip + ' => ' + protocol + ' ' + method + ' ' + host + ' ' + path;
   message += ' => ' + JSON.stringify(clientData);
//    message += ' ' + documentType;
 
   reqLogger.log(message, 'info', true);
 };
 