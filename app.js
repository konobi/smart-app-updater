#!/usr/bin/env node

// Smart Update, a Node.js AMQP broker that updates or creates a GIT repo
// Each host will generate a new message to the 'smart-scan-fs-rec' queue

var AGENT_NAME = 'smart-app-updater';
var VERSION = '0.01';

var sys   = require('sys');
var posix = require('fs'); 
var path  = require('path');
var path  = require('path');
var ini   = require('ini');
var amqp  = require('amqp');
require('./helper');

// Path to GITOSIS.conf
var gitosisConfig = path.join(__dirname, "gitosis.conf");

var currentAMQPConnection;
var hostname;
sys.exec("hostname", function(err, stdout, stderr){
    var tmp = stdout.replace(/(?:^\s+|\s+$)/g, '');
    sys.puts(AGENT_NAME + " version " + VERSION + " starting on host '" + tmp +"'");
    hostname = tmp;
});

var connectionCloseHandle = function (exception) { 
  if (exception) { 
      sys.puts("[ERROR] connection unexpectedly closed: " + exception);
  }
  sys.puts("[INFO] Disconnected, attempting to reconnect");
  setTimeout(function(){
    setup_connection();
  }, 5000);
};

var connectionReadyHandle = function(connection) {
  sys.puts("[INFO] connected to " + connection.serverProperties.product);  
  var config = connection.config;
  
  var exchange = connection.exchange(config.amqp.exchange, {type:'fanout'});  
  var queue = connection.queue(AGENT_NAME + '+' + hostname);
  queue.bind(exchange, config.amqp.exchange);

  queue.subscribe(function (message) {
    message.addListener('data', function (d) {        
      if (d) {
        
        try {
          data = eval("("+d+")");
          repository = data['repository'];
          repository = repository.replace(/\.git$/, '');
          try {            
            update_or_create(repository,config.rsp['projects_dir'],config.rsp['git_user'],config.rsp['git_server']);
          } catch(e){
            sys.debug("[ERROR] Cant Create or Update: " + e);
          }

        } catch(e){
          sys.debug("[ERROR] Failed to decode json object");
        }
      }      
    });

    // Remove message from queue, once it is processed
    message.addListener('end', function () { message.acknowledge(); });
  });
};

var setup_connection = function(prev, curr) {

  // If the times are the same, we just drop out... otherwise we continue and
  // attempt to connect.
  if(curr && prev){
    if(curr.mtime >= prev.mtime){
        return;
    } else {
        sys.puts("[INFO] config changed, reconnecting");
    }
  } else {
    // This is what happens during initial start up
    sys.puts("[INFO] Starting up...");
  }

  posix.readFile(gitosisConfig, function(e, d) {
    if(e){
      sys.puts("[WARNING] Unable to read configuration file: " + gitosisConfig);
    } else {
      var config;
      try {
        config = ini.parse(d);
      } catch(err) {
        throw new Error("[ERROR] Unable to parse config file '" + gitosisConfig + "': " + err);
      }

      if(currentAMQPConnection){
        // This is an expected close event so we don't want to attempt reconnect on the
        // same handle
        currentAMQPConnection.removeListener('close', connectionCloseHandle);
        currentAMQPConnection.close();
        currentAMQPConnection = null;
      }
      var connection = amqp.createConnection({port:Number(config.amqp.port), host:config.amqp.host});
      connection.config = config;
      connection.addListener('close', connectionCloseHandle );
      connection.addListener('ready', connectionReadyHandle.bind(this,connection));  
      currentAMQPConnection = connection;
    }
  });
};

// We want to be able to change configuration on the fly, so we may need to reconnect, etc.
posix.watchFile(gitosisConfig, { persistent: true, interval: 10000 }, setup_connection);
setup_connection();

var update_or_create = function(repository,projectsDir,gitUser,gitServer) {
  projectPath = path.join(projectsDir, repository);
  path.exists(projectPath, function (exists) {
    if (exists) {
      process.chdir(projectPath);
      cmd = "/opt/local/bin/git pull"; // Remote
      sys.puts("[INFO] Updating smart app '" + repository + "'");
    } else {
      cloneUri = gitUser + "@" + gitServer + ":"+ repository;
      cmd = "/opt/local/bin/git clone " + cloneUri + " " + projectPath;
      sys.puts("[INFO] Creating smart app '" + repository + "'");
    }  
    
    sys.exec(cmd, function (err, stdout, stderr) {
      if (err) {
        sys.puts("[ERROR] Could not run command '" + cmd + "'" + ": " + err);
      } else {
        sys.puts("[INFO] Done processing smart app " + repository);
      }
    });
  });
};

